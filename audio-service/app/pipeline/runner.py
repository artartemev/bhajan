"""Оркестратор пайплайна. Вызывается воркером (inline или RQ).

Этапы: источник → стемы → MIDI(вокал) + MIDI(фисгармонь) → аккорды → манифест.
Каждый этап обновляет статус и прогресс задачи в хранилище.
"""
from __future__ import annotations

import json
import traceback
from pathlib import Path

from ..config import settings
from ..schemas import JobResult, JobStatus
from .. import storage
from . import align as align_mod
from . import chords as chords_mod
from . import download, separate, transcribe


def run_job(job_id: str) -> None:
    try:
        _run(job_id)
    except Exception as exc:  # noqa: BLE001 — фиксируем любую ошибку в статусе задачи
        storage.update_job(
            job_id,
            status=JobStatus.error,
            error=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
        )


def _run(job_id: str) -> None:
    view = storage.load_job(job_id)
    if view is None:
        raise KeyError(job_id)
    d = storage.job_dir(job_id)
    stub = settings.stub_mode

    # 1. Источник звука
    storage.update_job(job_id, status=JobStatus.downloading, progress=0.05)
    if view.source_type == "youtube":
        source = download.fetch_youtube(view.source_ref or "", d)
    else:
        # файл уже сохранён в папку задачи как source.* эндпоинтом загрузки
        candidates = sorted(d.glob("source.*"))
        if not candidates:
            raise FileNotFoundError("Исходный файл source.* не найден")
        source = candidates[0]

    # warnings собираются по ходу: если ML-шаг недоступен/упал, фиксируем и идём дальше
    warnings: list[str] = []

    # 2. Разделение на дорожки
    storage.update_job(job_id, status=JobStatus.separating, progress=0.25)
    stems_dir = d / "stems"
    if stub:
        stems = separate.stub_separate(source, stems_dir, harmonium_stem=settings.harmonium_stem)
    else:
        try:
            stems = separate.separate(
                source, stems_dir,
                model=settings.demucs_model,
                harmonium_stem=settings.harmonium_stem,
            )
        except Exception as exc:  # noqa: BLE001
            warnings.append(_warn("Разделение (Demucs)", exc, "исходник идёт целиком как vocals/harmonium"))
            stems = separate.stub_separate(source, stems_dir, harmonium_stem=settings.harmonium_stem)

    # 3. Транскрипция в MIDI
    storage.update_job(job_id, status=JobStatus.transcribing, progress=0.55)
    midi: dict[str, str] = {}
    vocals_mid = d / "vocals.mid"
    harmonium_mid = d / "harmonium.mid"

    if "vocals" in stems:
        _stage(
            "Транскрипция вокала",
            tiers=[("librosa pyin", lambda: transcribe.vocals_to_midi(stems["vocals"], vocals_mid))],
            stub=lambda: transcribe.stub_to_midi(vocals_mid, polyphonic=False),
            use_stub=stub, warnings=warnings,
        )
    if "harmonium" in stems:
        _stage(
            "Транскрипция фисгармони",
            tiers=[
                ("Basic Pitch", lambda: transcribe.harmonium_to_midi(stems["harmonium"], harmonium_mid)),
                ("librosa CQT", lambda: transcribe.harmonium_to_midi_librosa(stems["harmonium"], harmonium_mid)),
            ],
            stub=lambda: transcribe.stub_to_midi(harmonium_mid, polyphonic=True),
            use_stub=stub, warnings=warnings,
        )
    if vocals_mid.exists():
        midi["vocals"] = vocals_mid.name
    if harmonium_mid.exists():
        midi["harmonium"] = harmonium_mid.name

    # 4. Аккорды (по стему фисгармони, если он есть, иначе по исходнику)
    storage.update_job(job_id, status=JobStatus.chords, progress=0.8)
    chord_source = stems.get("harmonium", source)
    chord_spans = _stage(
        "Аккорды",
        tiers=[
            ("madmom", lambda: chords_mod.detect_chords(chord_source)),
            ("librosa", lambda: chords_mod.detect_chords_librosa(chord_source)),
        ],
        stub=chords_mod.stub_chords,
        use_stub=stub, warnings=warnings,
    ) or []
    chords_file = d / "chords.json"
    chords_file.write_text(
        json.dumps([c.model_dump() for c in chord_spans], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 5. Выравнивание текста с аудио (если пользователь передал текст)
    lyrics_lines = []
    lyrics_timeline = []
    lyrics_file_name = None
    lang = None
    if view.lyrics and view.lyrics.strip():
        storage.update_job(job_id, status=JobStatus.aligning, progress=0.9)
        align_source = stems.get("vocals", source)
        # язык: из задачи (форма) → иначе из .env. "auto" → None (Whisper определит сам)
        lang = (view.language or settings.asr_language or "").strip().lower()
        lang = None if lang in ("", "auto") else lang
        lyrics_lines, lyrics_timeline = _stage(
            "Выравнивание текста",
            tiers=[("faster-whisper", lambda: align_mod.align_lyrics(
                align_source, view.lyrics or "", language=lang,
            ))],
            stub=lambda: align_mod.fallback_align(view.lyrics or "", align_source),
            use_stub=stub, warnings=warnings,
        ) or ([], [])
        # привязываем аккорды к строкам и к фрагментам таймлайна
        lyrics_lines = align_mod.attach_chords(lyrics_lines, chord_spans)
        lyrics_timeline = align_mod.attach_chords_to_timeline(lyrics_timeline, chord_spans)
        if not stub and not lyrics_timeline:
            warnings.append(
                "Выравнивание текста: совпадений не найдено. Проверьте ASR_LANGUAGE "
                "(для этой песни — bn) и установите indic-transliteration, если текст "
                "латиницей, а Whisper распознаёт деванагари/бенгали."
            )
        lyrics_path = d / "lyrics.json"
        lyrics_path.write_text(
            json.dumps({
                "lines": [l.model_dump() for l in lyrics_lines],
                "timeline": [t.model_dump() for t in lyrics_timeline],
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        lyrics_file_name = lyrics_path.name

    # 6. Манифест
    result = JobResult(
        stems={name: _rel(d, p) for name, p in stems.items()},
        midi=midi,
        chords_file=chords_file.name,
        chords=chord_spans,
        lyrics_file=lyrics_file_name,
        lyrics_lines=lyrics_lines,
        lyrics_timeline=lyrics_timeline,
        lyrics_language=(lang or "auto") if view.lyrics else None,
        stub=stub,
        warnings=warnings,
    )
    storage.update_job(job_id, warnings=warnings)
    storage.set_result(job_id, result)


def _warn(stage: str, exc: Exception, fallback: str) -> str:
    return f"{stage}: {type(exc).__name__}: {exc} → запасной вариант ({fallback})"


def _stage(name, *, tiers, stub, use_stub: bool, warnings: list[str]):
    """Пробует методы по очереди (топовый → облегчённый); иначе заглушка.

    tiers — список (имя_метода, функция). Первый успешный результат возвращается.
    Каждый неудавшийся метод оставляет предупреждение.
    """
    if use_stub:
        return stub()
    for tier_name, fn in tiers:
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 — ловим ImportError и сбои моделей
            warnings.append(_warn(f"{name} / {tier_name}", exc, "пробую запасной метод"))
    warnings.append(f"{name}: ни один метод недоступен → демо-результат")
    return stub()


def _rel(base: Path, p: Path) -> str:
    try:
        return str(p.relative_to(base))
    except ValueError:
        return p.name
