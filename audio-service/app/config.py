"""Конфигурация сервиса. Читается из переменных окружения (.env)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _detect_ml_available() -> bool:
    """Доступны ли тяжёлые ML-зависимости (demucs/librosa/...)."""
    import importlib.util

    for mod in ("librosa", "demucs", "soundfile"):
        if importlib.util.find_spec(mod) is None:
            return False
    return True


@dataclass
class Settings:
    # Где хранить загрузки и результаты по задачам
    data_dir: Path
    # Очередь: "inline" (в процессе, для разработки) или "rq" (Redis)
    queue_backend: str
    redis_url: str
    # Демукс-модель: htdemucs (4 стема) или htdemucs_6s (6 стемов, есть piano)
    demucs_model: str
    # Какой стем считать фисгармонью. Для киртана обычно "other".
    harmonium_stem: str
    # Принудительный stub-режим (без ML), даже если библиотеки установлены
    force_stub: bool
    # Реальный stub-режим = принудительный ИЛИ нет ML-библиотек
    stub_mode: bool
    # Максимальный размер загрузки, байт
    max_upload_bytes: int
    # --- Параметры транскрипции/очистки нот (крутятся под конкретный звук) ---
    note_min_duration: float      # короче — выбрасываем как артефакт, с
    note_merge_gap: float         # склейка нот того же тона с зазором меньше этого, с
    harmonium_onset_thr: float    # порог зажигания ноты (доля от макс. CQT)
    harmonium_offset_thr: float   # порог гашения (ниже onset → гистерезис против дробления)
    harmonic_suppression: bool    # подавлять обертоны (+12/+19 полутонов)
    max_polyphony: int            # максимум одновременных нот в кадре
    chord_min_duration: float     # минимальная длительность аккорда, с (против дробления)
    chord_source: str             # стем для детекции аккордов: vocals/harmonium/instrumental
    chord_beats_per_bar: int      # долей в такте — аккорд берётся на такт, а не на долю
    chord_change_penalty: float   # штраф Витерби за смену аккорда (больше → меньше смен)
    # --- Выравнивание текста (forced alignment) ---
    asr_model: str                # размер Whisper: tiny/base/small/medium/large-v3
    asr_language: str             # язык: hi (хинди), sa (санскрит), bn, en и т.д.
    asr_device: str               # cpu/cuda/auto
    asr_compute_type: str         # int8 (быстро на CPU), float16, float32

    @classmethod
    def load(cls) -> "Settings":
        data_dir = Path(os.environ.get("DATA_DIR", "data")).resolve()
        data_dir.mkdir(parents=True, exist_ok=True)
        force_stub = _env_bool("FORCE_STUB", False)
        ml_available = _detect_ml_available()
        return cls(
            data_dir=data_dir,
            queue_backend=os.environ.get("QUEUE_BACKEND", "inline").strip().lower(),
            redis_url=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
            demucs_model=os.environ.get("DEMUCS_MODEL", "htdemucs"),
            harmonium_stem=os.environ.get("HARMONIUM_STEM", "other"),
            force_stub=force_stub,
            stub_mode=force_stub or not ml_available,
            max_upload_bytes=int(os.environ.get("MAX_UPLOAD_MB", "100")) * 1024 * 1024,
            note_min_duration=float(os.environ.get("NOTE_MIN_DURATION", "0.12")),
            note_merge_gap=float(os.environ.get("NOTE_MERGE_GAP", "0.10")),
            harmonium_onset_thr=float(os.environ.get("HARMONIUM_ONSET_THR", "0.18")),
            harmonium_offset_thr=float(os.environ.get("HARMONIUM_OFFSET_THR", "0.09")),
            harmonic_suppression=_env_bool("HARMONIC_SUPPRESSION", True),
            max_polyphony=int(os.environ.get("MAX_POLYPHONY", "6")),
            chord_min_duration=float(os.environ.get("CHORD_MIN_DURATION", "0.8")),
            chord_source=os.environ.get("CHORD_SOURCE", "instrumental").strip().lower(),
            chord_beats_per_bar=int(os.environ.get("CHORD_BEATS_PER_BAR", "4")),
            chord_change_penalty=float(os.environ.get("CHORD_CHANGE_PENALTY", "0.08")),
            asr_model=os.environ.get("ASR_MODEL", "small"),
            asr_language=os.environ.get("ASR_LANGUAGE", "hi"),
            asr_device=os.environ.get("ASR_DEVICE", "auto"),
            asr_compute_type=os.environ.get("ASR_COMPUTE_TYPE", "int8"),
        )


settings = Settings.load()
