"""HTTP-роуты сервиса."""
from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import settings
from ..pipeline import download
from ..queue import enqueue
from ..schemas import JobView
from .. import storage

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "stub_mode": settings.stub_mode, "queue": settings.queue_backend}


@router.post("/jobs", response_model=JobView)
async def create_job(
    youtube_url: Optional[str] = Form(default=None),
    title: Optional[str] = Form(default=None),
    lyrics: Optional[str] = Form(default=None),
    language: Optional[str] = Form(default=None),
    a_cappella: bool = Form(default=False),
    file: Optional[UploadFile] = File(default=None),
) -> JobView:
    if not youtube_url and file is None:
        raise HTTPException(400, "Нужен либо файл, либо youtube_url")
    if youtube_url and file is not None:
        raise HTTPException(400, "Укажите что-то одно: файл ИЛИ youtube_url")

    lyrics = (lyrics or "").strip() or None
    language = (language or "").strip() or None

    if youtube_url:
        view = storage.create_job(
            title=title, source_type="youtube", source_ref=youtube_url,
            lyrics=lyrics, language=language, a_cappella=a_cappella,
        )
    else:
        assert file is not None
        contents = await file.read()
        if len(contents) > settings.max_upload_bytes:
            raise HTTPException(413, "Файл слишком большой")
        view = storage.create_job(
            title=title or file.filename, source_type="upload", source_ref=file.filename,
            lyrics=lyrics, language=language, a_cappella=a_cappella,
        )
        with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "a.mp3").suffix, delete=False) as tmp:
            tmp.write(contents)
            tmp_path = Path(tmp.name)
        download.save_upload(tmp_path, storage.job_dir(view.id))
        tmp_path.unlink(missing_ok=True)

    enqueue(view.id)
    return view


@router.get("/jobs", response_model=list[JobView])
def list_jobs() -> list[JobView]:
    return storage.list_jobs()


@router.get("/jobs/{job_id}", response_model=JobView)
def get_job(job_id: str) -> JobView:
    view = storage.load_job(job_id)
    if view is None:
        raise HTTPException(404, "Задача не найдена")
    return view


@router.get("/jobs/{job_id}/files/{path:path}")
def get_file(job_id: str, path: str):
    base = storage.job_dir(job_id).resolve()
    target = (base / path).resolve()
    # защита от выхода за пределы папки задачи
    if not str(target).startswith(str(base)) or not target.is_file():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(target)
