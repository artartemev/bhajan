"""Хранилище задач: метаданные в JSON на диске + файлы артефактов в папке задачи.

Структура на диске:
    data/jobs/<job_id>/
        job.json        — метаданные/статус/манифест
        source.mp3      — исходный звук
        stems/*.wav     — разделённые дорожки
        *.mid           — MIDI
        chords.json     — аккорды
"""
from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path
from typing import Optional

from .config import settings
from .schemas import JobResult, JobStatus, JobView

_lock = threading.Lock()


def _jobs_root() -> Path:
    root = settings.data_dir / "jobs"
    root.mkdir(parents=True, exist_ok=True)
    return root


def job_dir(job_id: str) -> Path:
    return _jobs_root() / job_id


def _job_file(job_id: str) -> Path:
    return job_dir(job_id) / "job.json"


def create_job(*, title: Optional[str], source_type: str, source_ref: Optional[str]) -> JobView:
    job_id = uuid.uuid4().hex[:12]
    d = job_dir(job_id)
    (d / "stems").mkdir(parents=True, exist_ok=True)
    view = JobView(
        id=job_id,
        status=JobStatus.queued,
        title=title,
        source_type=source_type,
        source_ref=source_ref,
    )
    save_job(view)
    return view


def save_job(view: JobView) -> None:
    with _lock:
        _job_file(view.id).write_text(view.model_dump_json(indent=2), encoding="utf-8")


def load_job(job_id: str) -> Optional[JobView]:
    f = _job_file(job_id)
    if not f.exists():
        return None
    return JobView.model_validate_json(f.read_text(encoding="utf-8"))


def list_jobs() -> list[JobView]:
    out: list[JobView] = []
    for d in sorted(_jobs_root().glob("*"), key=lambda p: p.stat().st_mtime, reverse=True):
        view = load_job(d.name)
        if view:
            out.append(view)
    return out


def update_job(job_id: str, **fields) -> JobView:
    view = load_job(job_id)
    if view is None:
        raise KeyError(job_id)
    for k, v in fields.items():
        setattr(view, k, v)
    save_job(view)
    return view


def set_result(job_id: str, result: JobResult) -> JobView:
    return update_job(job_id, result=result, status=JobStatus.done, progress=1.0)
