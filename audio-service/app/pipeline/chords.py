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
    """Аккорды через хрому librosa — beat-синхронно и с учётом тональности.

    Идея «как у музыканта»: оцениваем тональность, делим звук по долям (beat
    tracking), на каждом отрезке берём усреднённую хрому и подбираем трезвучие со
    смещением в сторону диатоники тональности (убирает дрожание maj↔min на дроне).
    Затем сливаем соседние одинаковые и короткие → короткая честная
    последовательность ≈ аккорд на такт.
    """
    import librosa
    import numpy as np

    from ..config import settings

    y, sr = librosa.load(str(audio_path), mono=True)
    y_harm = librosa.effects.harmonic(y, margin=4)  # убираем перкуссию
    hop = 2048
    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr, hop_length=hop)

    tonic, is_minor = _estimate_key(chroma)
    templates, labels = _templates()
    in_key = _diatonic_labels(tonic, is_minor)
    bonus = np.array([0.12 if labels[k] in in_key else 0.0 for k in range(len(labels))])

    try:
        _tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop)
    except Exception:
        beats = np.array([], dtype=int)

    if len(beats) >= 4:
        bounds = [0, *np.asarray(beats).tolist(), chroma.shape[1]]
        seg_chroma, seg_times = [], []
        for a, b in zip(bounds, bounds[1:]):
            if b <= a:
                continue
            seg_chroma.append(np.median(chroma[:, a:b], axis=1))
            seg_times.append((
                float(librosa.frames_to_time(a, sr=sr, hop_length=hop)),
                float(librosa.frames_to_time(b, sr=sr, hop_length=hop)),
            ))
        cn = np.stack(seg_chroma, axis=1)
        cn = cn / (np.linalg.norm(cn, axis=0, keepdims=True) + 1e-9)
        scores = templates @ cn + bonus[:, None]
        idx = scores.argmax(axis=0)
        best = scores.max(axis=0)
        raw = [
            (seg_times[i][0], seg_times[i][1], int(idx[i]))
            for i in range(len(seg_times))
            if best[i] >= _MATCH_THRESHOLD
        ]
        collapsed: list[tuple[float, float, int]] = []
        for s, e, k in raw:
            if collapsed and collapsed[-1][2] == k:
                collapsed[-1] = (collapsed[-1][0], e, k)
            else:
                collapsed.append((s, e, k))
        merged = _merge_short(collapsed, settings.chord_min_duration)
        return [ChordSpan(start=s, end=e, label=labels[k]) for (s, e, k) in merged]

    # запасной вариант без долей — по кадрам со сглаживанием
    return _detect_chords_frame_based(chroma, sr, hop, templates, labels, bonus, settings)


def _detect_chords_frame_based(chroma, sr, hop, templates, labels, bonus, settings) -> list[ChordSpan]:
    import librosa
    import numpy as np

    try:
        from scipy.ndimage import median_filter

        chroma = median_filter(chroma, size=(1, 9))
    except ImportError:
        kernel = np.ones(9) / 9.0
        chroma = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode="same"), 1, chroma)

    times = librosa.times_like(chroma, sr=sr, hop_length=hop)
    frame_dur = hop / sr
    cn = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-9)
    scores = templates @ cn + bonus[:, None]
    idx = scores.argmax(axis=0)
    best = scores.max(axis=0)
    idx = np.where(best >= _MATCH_THRESHOLD, idx, -1)
    win = max(3, int(round(settings.chord_min_duration / frame_dur)) | 1)
    idx = _mode_filter(idx, win)

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


def _estimate_key(chroma) -> tuple[int, bool]:
    """Оценка тональности (профили Крумхансла). Возвращает (тоника 0-11, минор?)."""
    import numpy as np

    prof = chroma.mean(axis=1)
    p = prof - prof.mean()
    maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minp = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    maj = maj - maj.mean()
    minp = minp - minp.mean()

    def corr(a, b):
        denom = (np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
        return float(np.dot(a, b) / denom)

    best = (-1e9, 0, False)
    for t in range(12):
        cm = corr(np.roll(maj, t), p)
        ci = corr(np.roll(minp, t), p)
        if cm > best[0]:
            best = (cm, t, False)
        if ci > best[0]:
            best = (ci, t, True)
    return best[1], best[2]


def _diatonic_labels(tonic: int, is_minor: bool) -> set[str]:
    """Диатонические трезвучия тональности (без уменьшённых — их нет в шаблонах)."""
    if is_minor:
        steps = [(0, "min"), (3, "maj"), (5, "min"), (7, "min"), (7, "maj"), (8, "maj"), (10, "maj")]
    else:
        steps = [(0, "maj"), (2, "min"), (4, "min"), (5, "maj"), (7, "maj"), (9, "min")]
    return {f"{_NOTE_NAMES[(tonic + s) % 12]}:{q}" for s, q in steps}


def estimate_key(audio_path: Path) -> str:
    """Тональность трека как читаемая строка, напр. 'Bm' или 'D'."""
    import librosa

    y, sr = librosa.load(str(audio_path), mono=True)
    chroma = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(y), sr=sr)
    tonic, is_minor = _estimate_key(chroma)
    return f"{_NOTE_NAMES[tonic]}{'m' if is_minor else ''}"


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
