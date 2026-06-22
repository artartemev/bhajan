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
