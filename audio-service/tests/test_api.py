"""End-to-end тест API в stub-режиме (без ML-зависимостей).

Запуск:  FORCE_STUB=1 pytest audio-service/tests -q
"""
import io
import os
import time

os.environ.setdefault("FORCE_STUB", "1")
os.environ.setdefault("QUEUE_BACKEND", "inline")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def _wait_done(job_id: str, timeout: float = 15.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "error"):
            return j
        time.sleep(0.1)
    raise AssertionError("Задача не завершилась за отведённое время")


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["stub_mode"] is True


def test_upload_pipeline_stub():
    fake_audio = io.BytesIO(b"RIFF....not-real-audio")
    r = client.post(
        "/api/jobs",
        files={"file": ("track.mp3", fake_audio, "audio/mpeg")},
        data={"title": "Тест Бхаджан"},
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]

    job = _wait_done(job_id)
    assert job["status"] == "done", job.get("error")
    res = job["result"]
    assert res["stub"] is True
    assert "vocals" in res["midi"]
    assert "harmonium" in res["midi"]
    assert "vocals" in res["stems"]
    assert "harmonium" in res["stems"]
    assert len(res["chords"]) > 0

    # файлы реально отдаются
    midi_name = res["midi"]["harmonium"]
    fr = client.get(f"/api/jobs/{job_id}/files/{midi_name}")
    assert fr.status_code == 200
    assert fr.content[:4] == b"MThd"  # заголовок MIDI


def test_requires_source():
    r = client.post("/api/jobs", data={"title": "no source"})
    assert r.status_code == 400


def test_lyrics_with_language_persisted():
    fake_audio = io.BytesIO(b"RIFF....not-real-audio")
    r = client.post(
        "/api/jobs",
        files={"file": ("song.mp3", fake_audio, "audio/mpeg")},
        data={"title": "Simple", "lyrics": "first line\nsecond line", "language": "en"},
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]

    job = _wait_done(job_id)
    assert job["status"] == "done", job.get("error")
    assert job["language"] == "en"
    # в stub-режиме срабатывает fallback_align (равномерное деление) → строки есть
    assert len(job["result"]["lyrics_lines"]) == 2
