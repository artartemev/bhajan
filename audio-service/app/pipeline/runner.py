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

    # 2. Разделение на дорожки
    storage.update_job(job_id, status=JobStatus.separating, progress=0.25)
    stems_dir = d / "stems"
    if stub:
        stems = separate.stub_separate(source, stems_dir, harmonium_stem=settings.harmonium_stem)
    else:
        stems = separate.separate(
            source, stems_dir,
            model=settings.demucs_model,
            harmonium_stem=settings.harmonium_stem,
        )

    # 3. Транскрипция в MIDI
    storage.update_job(job_id, status=JobStatus.transcribing, progress=0.55)
    midi: dict[str, str] = {}
    vocals_mid = d / "vocals.mid"
    harmonium_mid = d / "harmonium.mid"
    if stub:
        transcribe.stub_to_midi(vocals_mid, polyphonic=False)
        transcribe.stub_to_midi(harmonium_mid, polyphonic=True)
    else:
        if "vocals" in stems:
            transcribe.vocals_to_midi(stems["vocals"], vocals_mid)
        if "harmonium" in stems:
            transcribe.harmonium_to_midi(stems["harmonium"], harmonium_mid)
    if vocals_mid.exists():
        midi["vocals"] = vocals_mid.name
    if harmonium_mid.exists():
        midi["harmonium"] = harmonium_mid.name

    # 4. Аккорды (по стему фисгармони, если он есть, иначе по исходнику)
    storage.update_job(job_id, status=JobStatus.chords, progress=0.8)
    chord_source = stems.get("harmonium", source)
    if stub:
        chord_spans = chords_mod.stub_chords()
    else:
        chord_spans = chords_mod.detect_chords(chord_source)
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
    )
    storage.set_result(job_id, result)


def _rel(base: Path, p: Path) -> str:
    try:
        return str(p.relative_to(base))
    except ValueError:
        return p.name
