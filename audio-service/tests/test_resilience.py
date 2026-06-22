"""Тест устойчивости: ML-режим включён, но шаги падают (нет библиотек).

Проверяем, что задача всё равно завершается (done), создаёт MIDI/аккорды
через запасные варианты и фиксирует предупреждения.

Запуск:  pytest audio-service/tests/test_resilience.py -q
"""
import os

os.environ.setdefault("QUEUE_BACKEND", "inline")

from app import config, storage  # noqa: E402
from app.pipeline import chords as chords_mod  # noqa: E402
from app.pipeline import runner, separate, transcribe  # noqa: E402
from app.schemas import JobStatus  # noqa: E402


def test_partial_ml_falls_back(monkeypatch, tmp_path):
    # Имитируем реальный ML-режим
    monkeypatch.setattr(config.settings, "stub_mode", False)

    # Demucs работает (через stub-разделение), а транскрипция и аккорды «падают»
    monkeypatch.setattr(
        separate, "separate",
        lambda *a, **k: separate.stub_separate(a[0], a[1], harmonium_stem="other"),
    )

    def boom(*a, **k):
        raise ModuleNotFoundError("No module named 'basic_pitch'")

    monkeypatch.setattr(transcribe, "vocals_to_midi", boom)
    monkeypatch.setattr(transcribe, "harmonium_to_midi", boom)
    monkeypatch.setattr(chords_mod, "detect_chords", boom)

    view = storage.create_job(title="resilience", source_type="upload", source_ref="x.mp3")
    (storage.job_dir(view.id) / "source.mp3").write_bytes(b"not-real-audio")

    runner.run_job(view.id)

    done = storage.load_job(view.id)
    assert done.status == JobStatus.done, done.error
    res = done.result
    # запасные варианты дали MIDI и аккорды
    assert "vocals" in res.midi and "harmonium" in res.midi
    assert len(res.chords) > 0
    # каждый упавший шаг оставил предупреждение
    assert any("Basic Pitch" in w for w in res.warnings)
    assert any("madmom" in w for w in res.warnings)
    assert len(res.warnings) >= 2
