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
    """Аккорды через хрому librosa + шаблоны трезвучий.

    Против «стены» дрожащих аккордов: сильное сглаживание хромы, mode-фильтр
    подписей по кадрам (убирает мерцание maj↔min) и слияние коротких аккордов в
    соседние до минимальной длительности из конфига.
    """
    import librosa
    import numpy as np

    from ..config import settings

    y, sr = librosa.load(str(audio_path), mono=True)
    y_harm = librosa.effects.harmonic(y, margin=4)  # убираем перкуссию
    hop = 2048
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop)

    # сильное сглаживание хромы по времени (медиана убирает короткие всплески)
    try:
        from scipy.ndimage import median_filter

        chroma = median_filter(chroma, size=(1, 9))
    except ImportError:
        kernel = np.ones(9) / 9.0
        chroma = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode="same"), 1, chroma)

    times = librosa.times_like(chroma, sr=sr, hop_length=hop)
    frame_dur = hop / sr
    templates, labels = _templates()
    cn = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    scores = templates @ cn  # (24, n_frames)
    idx = scores.argmax(axis=0)
    best = scores.max(axis=0)
    idx = np.where(best >= _MATCH_THRESHOLD, idx, -1)  # -1 = «нет аккорда»

    # mode-фильтр подписей: окно ≈ минимальная длительность аккорда
    win = max(3, int(round(settings.chord_min_duration / frame_dur)) | 1)
    idx = _mode_filter(idx, win)

    # собираем непрерывные участки одинаковой подписи
    raw: list[tuple[float, float, int]] = []
    i, n = 0, len(idx)
    while i < n:
        if idx[i] < 0:
            i += 1
            continue
        j = i + 1
        while j < n and idx[j] == idx[i]:
            j += 1
        raw.append((float(times[i]), float(times[j - 1] + frame_dur), int(idx[i])))
        i = j

    merged = _merge_short(raw, settings.chord_min_duration)
    return [ChordSpan(start=s, end=e, label=labels[k]) for (s, e, k) in merged]


def _mode_filter(idx, win: int):
    """Скользящее голосование большинством: убирает одиночные перескоки подписи."""
    import numpy as np

    n = len(idx)
    out = idx.copy()
    half = win // 2
    for i in range(n):
        a, b = max(0, i - half), min(n, i + half + 1)
        window = idx[a:b]
        vals, counts = np.unique(window, return_counts=True)
        out[i] = vals[counts.argmax()]
    return out


def _merge_short(spans: list[tuple[float, float, int]], min_dur: float) -> list[tuple[float, float, int]]:
    """Сливает короткие аккорды: участок < min_dur поглощается соседним. Затем
    объединяет соседние одинаковые подписи."""
    if not spans:
        return []
    # 1) поглощаем короткие участки соседями
    changed = True
    work = list(spans)
    while changed and len(work) > 1:
        changed = False
        for i, (s, e, k) in enumerate(work):
            if (e - s) >= min_dur:
                continue
            prev_len = (work[i - 1][1] - work[i - 1][0]) if i > 0 else -1
            next_len = (work[i + 1][1] - work[i + 1][0]) if i + 1 < len(work) else -1
            if prev_len < 0 and next_len < 0:
                break
            if next_len > prev_len:  # отдаём время следующему
                ns, ne, nk = work[i + 1]
                work[i + 1] = (s, ne, nk)
            else:  # предыдущему
                ps, pe, pk = work[i - 1]
                work[i - 1] = (ps, e, pk)
            work.pop(i)
            changed = True
            break
    # 2) склейка соседних одинаковых
    out: list[tuple[float, float, int]] = []
    for s, e, k in work:
        if out and out[-1][2] == k:
            out[-1] = (out[-1][0], e, k)
        else:
            out.append((s, e, k))
    return out
