"""Распознавание аккордовой дорожки.

Для киртана гармонию удобнее всего снимать со стема фисгармони (other): там нет
вокального вибрато и перкуссии, поэтому хрома-вектор чище. Используем madmom
(DeepChroma + CRF-распознаватель). Результат — список (start, end, label).
"""
from __future__ import annotations

from pathlib import Path

from ..schemas import ChordSpan


def detect_chords(audio_path: Path) -> list[ChordSpan]:
    """Распознаёт аккорды через madmom. Возвращает список аккордовых интервалов."""
    from madmom.audio.chroma import DeepChromaProcessor
    from madmom.features.chords import DeepChromaChordRecognitionProcessor

    chroma = DeepChromaProcessor()(str(audio_path))
    decoded = DeepChromaChordRecognitionProcessor()(chroma)
    # decoded: массив записей (start, end, label)
    spans = [
        ChordSpan(start=float(start), end=float(end), label=str(label))
        for (start, end, label) in decoded
        if str(label) != "N"  # "N" = нет аккорда
    ]
    return spans


def stub_chords() -> list[ChordSpan]:
    """Без ML: типовая для бхаджанов последовательность как заглушка."""
    seq = ["C:maj", "G:maj", "A:min", "F:maj"]
    return [ChordSpan(start=i * 2.0, end=i * 2.0 + 2.0, label=lab) for i, lab in enumerate(seq)]


# --- Облегчённый детектор на librosa (без madmom, работает на Python 3.13) ---

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
_MIN_CHORD_S = 0.3
_MATCH_THRESHOLD = 0.5  # минимальная похожесть на шаблон, иначе «нет аккорда»


def _templates():
    """24 шаблона трезвучий (мажор/минор) как нормированные бинарные маски хромы."""
    import numpy as np

    maj = np.array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], dtype=float)  # тоника, б.терция, квинта
    minr = np.array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], dtype=float)  # тоника, м.терция, квинта
    temps, labels = [], []
    for i in range(12):
        temps.append(np.roll(maj, i))
        labels.append(f"{_NOTE_NAMES[i]}:maj")
        temps.append(np.roll(minr, i))
        labels.append(f"{_NOTE_NAMES[i]}:min")
    t = np.array(temps)
    t /= np.linalg.norm(t, axis=1, keepdims=True)
    return t, labels


def detect_chords_librosa(audio_path: Path) -> list[ChordSpan]:
    """Аккорды через хрому librosa + сопоставление с шаблонами трезвучий."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), mono=True)
    y_harm = librosa.effects.harmonic(y, margin=4)  # убираем перкуссию
    hop = 4096
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop)
    # сглаживаем по времени, чтобы аккорды не «дёргались»
    kernel = np.ones(5) / 5.0
    chroma = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode="same"), 1, chroma)

    times = librosa.times_like(chroma, sr=sr, hop_length=hop)
    frame_dur = hop / sr
    templates, labels = _templates()
    cn = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    scores = templates @ cn  # (24, n_frames)
    idx = scores.argmax(axis=0)
    best = scores.max(axis=0)

    spans: list[ChordSpan] = []
    i, n = 0, len(idx)
    while i < n:
        if best[i] < _MATCH_THRESHOLD:
            i += 1
            continue
        j = i + 1
        while j < n and idx[j] == idx[i] and best[j] >= _MATCH_THRESHOLD:
            j += 1
        start = float(times[i])
        end = float(times[j - 1] + frame_dur)
        if end - start >= _MIN_CHORD_S:
            spans.append(ChordSpan(start=start, end=end, label=labels[idx[i]]))
        i = j
    return spans
