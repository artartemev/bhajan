"""Разделение на дорожки через Demucs.

Для киртанов/бхаджанов ключевые стемы:
  • vocals    — голос
  • harmonium — фисгармонь (в 4-стемной htdemucs лежит в "other": бас и перкуссия
                уже вынесены в bass/drums, поэтому "other" ≈ фисгармонь)

Дополнительно к стему фисгармони применяется мягкий band-pass, подчёркивающий
её диапазон: основной тон ~110 Гц … ~2 кГц + гармоники. Это убирает остаточный
гул и высокочастотный «воздух», мешающие полифонической транскрипции.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

# Диапазон фисгармони (язычковый орган): основной тон + значимые гармоники.
HARMONIUM_BAND_HZ = (90.0, 6000.0)


def _demucs_stem_dir(out_dir: Path, model: str, stem_name: str) -> Path:
    return out_dir / model / stem_name


def separate(input_path: Path, out_dir: Path, *, model: str, harmonium_stem: str) -> dict[str, Path]:
    """Запускает Demucs и возвращает {имя_дорожки: путь_к_wav}.

    Имена в результате нормализованы: vocals, harmonium, drums, bass, other.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, "-m", "demucs", "-n", model, "-o", str(out_dir), str(input_path)],
        check=True,
    )
    stem_root = _demucs_stem_dir(out_dir, model, input_path.stem)

    stems: dict[str, Path] = {}
    for wav in stem_root.glob("*.wav"):
        stems[wav.stem] = wav

    if harmonium_stem in stems:
        harmonium_src = stems[harmonium_stem]
        harmonium_out = stem_root / "harmonium.wav"
        _emphasize_harmonium(harmonium_src, harmonium_out)
        stems["harmonium"] = harmonium_out

    return stems


def _emphasize_harmonium(src: Path, dst: Path) -> None:
    """Band-pass по диапазону фисгармони. При отсутствии scipy просто копирует."""
    try:
        import numpy as np
        import soundfile as sf
        from scipy.signal import butter, sosfiltfilt
    except ImportError:
        import shutil

        shutil.copyfile(src, dst)
        return

    audio, sr = sf.read(str(src))
    low, high = HARMONIUM_BAND_HZ
    nyq = sr / 2.0
    high = min(high, nyq * 0.99)
    sos = butter(4, [low / nyq, high / nyq], btype="band", output="sos")

    if audio.ndim == 1:
        filtered = sosfiltfilt(sos, audio)
    else:
        filtered = np.stack([sosfiltfilt(sos, audio[:, c]) for c in range(audio.shape[1])], axis=1)

    sf.write(str(dst), filtered, sr)


def stub_separate(input_path: Path, out_dir: Path, *, harmonium_stem: str) -> dict[str, Path]:
    """Без ML: копирует исходник в vocals/harmonium, чтобы прогнать пайплайн end-to-end."""
    import shutil

    stem_root = out_dir / "stub"
    stem_root.mkdir(parents=True, exist_ok=True)
    stems: dict[str, Path] = {}
    for name in ("vocals", "harmonium"):
        dst = stem_root / f"{name}.wav"
        shutil.copyfile(input_path, dst)
        stems[name] = dst
    return stems
