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
            "Транскрипция вокала (librosa)",
            real=lambda: transcribe.vocals_to_midi(stems["vocals"], vocals_mid),
            stub=lambda: transcribe.stub_to_midi(vocals_mid, polyphonic=False),
            use_stub=stub, warnings=warnings,
        )
    if "harmonium" in stems:
        _stage(
            "Транскрипция фисгармони (Basic Pitch)",
            real=lambda: transcribe.harmonium_to_midi(stems["harmonium"], harmonium_mid),
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
        "Аккорды (madmom)",
        real=lambda: chords_mod.detect_chords(chord_source),
        stub=chords_mod.stub_chords,
        use_stub=stub, warnings=warnings,
    ) or []
    chords_file = d / "chords.json"
    chords_file.write_text(
        json.dumps([c.model_dump() for c in chord_spans], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 5. Манифест
    result = JobResult(
        stems={name: _rel(d, p) for name, p in stems.items()},
        midi=midi,
        chords_file=chords_file.name,
        chords=chord_spans,
        stub=stub,
        warnings=warnings,
    )
    storage.update_job(job_id, warnings=warnings)
    storage.set_result(job_id, result)


def _warn(stage: str, exc: Exception, fallback: str) -> str:
    return f"{stage}: {type(exc).__name__}: {exc} → запасной вариант ({fallback})"


def _stage(name, *, real, stub, use_stub: bool, warnings: list[str]):
    """Выполняет реальный шаг; при stub-режиме или ошибке/отсутствии ML — запасной."""
    if use_stub:
        return stub()
    try:
        return real()
    except Exception as exc:  # noqa: BLE001 — ловим ImportError и сбои моделей
        warnings.append(_warn(name, exc, "демо-результат"))
        return stub()


def _rel(base: Path, p: Path) -> str:
    try:
        return str(p.relative_to(base))
    except ValueError:
        return p.name
