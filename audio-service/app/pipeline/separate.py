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

from pathlib import Path

# Диапазон фисгармони (язычковый орган): основной тон + значимые гармоники.
HARMONIUM_BAND_HZ = (90.0, 6000.0)


def _pick_device():
    import torch

    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


def separate(input_path: Path, out_dir: Path, *, model: str, harmonium_stem: str) -> dict[str, Path]:
    """Разделяет дорожки через Python-API Demucs. Возвращает {имя_дорожки: путь_к_wav}.

    Аудио читаем через librosa, стемы пишем через soundfile — так не задействуется
    torchaudio.save/load (который в новых версиях требует torchcodec). Наружу
    отдаём три дорожки: vocals, instrumental (сумма не-вокальных источников) и
    harmonium (источник harmonium_stem с band-pass).
    """
    import numpy as np
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    import librosa

    out_dir.mkdir(parents=True, exist_ok=True)
    mdl = get_model(model)
    mdl.eval()
    device = _pick_device()

    sr = mdl.samplerate
    channels = mdl.audio_channels
    wav, _ = librosa.load(str(input_path), sr=sr, mono=(channels == 1))
    wav = np.asarray(wav, dtype=np.float32)
    if wav.ndim == 1:
        wav = np.tile(wav[None, :], (channels, 1))
    elif wav.shape[0] != channels:
        wav = wav[:channels] if wav.shape[0] > channels else np.tile(wav[:1], (channels, 1))

    mix = torch.from_numpy(wav)
    ref = mix.mean(0)
    std = ref.std() + 1e-8
    mix_norm = (mix - ref.mean()) / std
    with torch.no_grad():
        out = apply_model(mdl, mix_norm[None], device=device, progress=False)[0]
    out = out * std + ref.mean()

    stem_root = out_dir / model / input_path.stem
    stem_root.mkdir(parents=True, exist_ok=True)

    # отдаём наружу только три дорожки: вокал, инструментал, фисгармонь.
    # остальные источники Demucs (drums/bass/other) суммируем в «instrumental».
    raw: dict[str, "np.ndarray"] = {name: source.cpu().numpy().T for name, source in zip(mdl.sources, out)}

    stems: dict[str, Path] = {}
    if "vocals" in raw:
        vocals_path = stem_root / "vocals.wav"
        sf.write(str(vocals_path), raw["vocals"], sr)
        stems["vocals"] = vocals_path

    accomp = None
    for name, arr in raw.items():
        if name == "vocals":
            continue
        accomp = arr.copy() if accomp is None else accomp + arr
    if accomp is not None:
        inst_path = stem_root / "instrumental.wav"
        sf.write(str(inst_path), accomp, sr)
        stems["instrumental"] = inst_path

    # фисгармонь — из источника harmonium_stem (обычно "other") с band-pass
    if harmonium_stem in raw:
        src_path = stem_root / f"_{harmonium_stem}.wav"
        sf.write(str(src_path), raw[harmonium_stem], sr)
        harmonium_out = stem_root / "harmonium.wav"
        _emphasize_harmonium(src_path, harmonium_out)
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
    for name in ("vocals", "instrumental", "harmonium"):
        dst = stem_root / f"{name}.wav"
        shutil.copyfile(input_path, dst)
        stems[name] = dst
    return stems
