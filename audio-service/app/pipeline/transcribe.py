"""Транскрипция аудио в MIDI.

  • Вокал — монофонический: librosa.pyin (один чёткий голос, чистая мелодия).
  • Фисгармонь — полифонический: Spotify Basic Pitch или CQT-фоллбэк на librosa.

Сырые ноты любого метода прогоняются через postprocess.clean_notes:
склейка обрывков, выброс коротких артефактов, подавление обертонов.
"""
from __future__ import annotations

from pathlib import Path

from ..config import settings
from .midi_io import write_midi
from .postprocess import clean_notes

MIN_NOTE_DURATION_S = 0.08


def _clean(events, *, harmonic_suppression: bool):
    """Очистка нот общими параметрами из конфига."""
    return clean_notes(
        events,
        min_duration=settings.note_min_duration,
        merge_gap=settings.note_merge_gap,
        harmonic_suppression=harmonic_suppression,
    )


def vocals_to_midi(audio_path: Path, output_path: Path) -> int:
    """Монофоническая транскрипция вокала через librosa.pyin.

    Идея: пишем только **явно слышимые** ноты. Тихие кадры (дыхание, послезвучие,
    транзиенты между нотами) отсекаются по громкости, даже если PYIN на них
    уверенно даёт тон. Оставшиеся ноты сглаживаются и притягиваются к ладу.
    """
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), sr=None, mono=True)
    hop_length = 512
    f0, voiced_flag, voiced_prob = librosa.pyin(
        y, sr=sr,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        frame_length=2048,
        hop_length=hop_length,
    )

    # 1) громкость вокала покадрово (RMS в dB) — стробируем по ней
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop_length)[0]
    # выравниваем длину с f0 (у pyin и rms она обычно совпадает, но подстрахуемся)
    n = min(len(f0), len(rms))
    f0 = f0[:n]; voiced_flag = voiced_flag[:n]; voiced_prob = voiced_prob[:n]; rms = rms[:n]
    rms_db = librosa.amplitude_to_db(rms + 1e-9)
    # порог: -35 dB от пика вокала → тише пропускаем
    loud_thr_db = float(rms_db.max()) - settings.vocal_loudness_db
    is_loud = rms_db >= loud_thr_db

    # 2) f0 → медианное сглаживание (гасит вибрато/глиссандо)
    try:
        from scipy.ndimage import median_filter
        pitch_hz = np.where(np.isfinite(f0), f0, 0.0)
        pitch_hz = median_filter(pitch_hz, size=7)
    except ImportError:
        pitch_hz = np.nan_to_num(f0, nan=0.0)

    frame_dur = hop_length / sr
    times = librosa.times_like(pitch_hz, sr=sr, hop_length=hop_length)

    # 3) снап к ладу
    from . import chords as chords_mod
    chroma_key = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(y), sr=sr)
    tonic, is_minor = chords_mod._estimate_key(chroma_key)
    scale = _scale_pcs(tonic, is_minor)

    # 4) НОТЫ ПО ONSET-ДЕТЕКТОРУ.
    #    Одна нота = отрезок «атака → следующая атака», высота = медиана f0
    #    внутри, громкость = средний RMS. Так одна спетая нота остаётся одной
    #    нотой, а не режется PYIN на 2-3 куска.
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr, hop_length=hop_length, backtrack=True,
    )
    # добавляем начало и конец
    bounds = sorted(set([0, *onset_frames.tolist(), n]))

    raw_notes = []
    for a, b in zip(bounds, bounds[1:]):
        if b - a < 2:
            continue
        seg_pitch = pitch_hz[a:b]
        seg_loud = rms_db[a:b]
        seg_voiced = voiced_flag[a:b]
        # берём только «озвученные и громкие» кадры внутри сегмента
        mask = seg_voiced & (seg_pitch > 0) & (seg_loud >= loud_thr_db)
        if mask.sum() < 3:  # меньше ~35мс полезного тона → это не нота
            continue
        vals = np.log2(seg_pitch[mask])
        pitch = int(round(librosa.hz_to_midi(2.0 ** np.median(vals))))
        pitch = _snap_to_scale(pitch, scale)
        s = float(times[a])
        e = float(times[b - 1] + frame_dur)
        # salience = средняя относительная громкость (0..1) сегмента
        rel_loud = float((seg_loud[mask].mean() - loud_thr_db)
                         / max(1e-6, rms_db.max() - loud_thr_db))
        raw_notes.append((s, e, pitch, max(0.0, rel_loud)))

    # склейка соседних одинаковых + отсев коротких по общему пост-процессору
    notes = _clean(raw_notes, harmonic_suppression=False)

    # 4a) агрессивный отсев коротких нот вокала (украшения, глиссандо):
    #     остаются длинные + короткие, стоящие отдельно (не проходящие)
    notes = _drop_short_ornaments(notes, min_dur=settings.vocal_note_min_duration)

    # 5) квантизация к сетке 8-ых
    try:
        _tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
        if len(beats) >= 4:
            beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=hop_length)
            grid = _subdivide(beat_times, subdivisions=2)
            notes = _quantize_to_grid(notes, grid, min_dur=settings.note_min_duration)
    except Exception:
        pass

    write_midi(notes, output_path)
    return len(notes)


def _drop_short_ornaments(notes, *, min_dur: float):
    """Убирает короткие проходящие ноты между двумя длинными.

    Оставляем длинные (≥ min_dur) и границы фраз (когда до/после — пауза).
    Короткая нота вылетает, если она «прожата» с обеих сторон длинными
    соседями — это типичное украшение, а не самостоятельная нота мелодии.
    """
    if not notes:
        return notes
    kept = []
    for i, (s, e, p) in enumerate(notes):
        if e - s >= min_dur:
            kept.append((s, e, p))
            continue
        # короткая: смотрим соседей
        prev_long = i > 0 and (notes[i - 1][1] - notes[i - 1][0]) >= min_dur
        next_long = i + 1 < len(notes) and (notes[i + 1][1] - notes[i + 1][0]) >= min_dur
        if prev_long and next_long:
            continue  # проходящее украшение
        kept.append((s, e, p))
    # растягиваем длинных «глотнувших» соседей на освободившееся место
    for i in range(len(kept) - 1):
        s0, e0, p0 = kept[i]; s1, e1, p1 = kept[i + 1]
        if e0 < s1:
            mid = (e0 + s1) / 2
            kept[i] = (s0, mid, p0)
            kept[i + 1] = (mid, e1, p1)
    return kept


def _scale_pcs(tonic: int, is_minor: bool) -> set[int]:
    """Классы высот (0-11) диатонического лада. Для минора — гармонический (с VII↑)."""
    if is_minor:
        steps = (0, 2, 3, 5, 7, 8, 10, 11)  # + повышенная VII (11)
    else:
        steps = (0, 2, 4, 5, 7, 9, 11)
    return {(tonic + s) % 12 for s in steps}


def _snap_to_scale(pitch: int, scale: set[int]) -> int:
    """Возвращает ближайшую ноту лада (в пределах ±2 полутонов); иначе — как есть."""
    for delta in (0, -1, 1, -2, 2):
        if (pitch + delta) % 12 in scale:
            return pitch + delta
    return pitch


def _subdivide(beat_times, *, subdivisions: int):
    """Даёт сетку subdivisions на долю (2 → 8-ые, 4 → 16-ые)."""
    import numpy as np
    beat_times = list(beat_times)
    grid = []
    for a, b in zip(beat_times, beat_times[1:]):
        step = (b - a) / subdivisions
        for k in range(subdivisions):
            grid.append(a + k * step)
    grid.append(beat_times[-1])
    return np.asarray(grid)


def _quantize_to_grid(notes, grid, *, min_dur: float):
    """Прижимает onset и offset нот к ближайшей точке сетки; отбрасывает короткие."""
    import numpy as np
    if not len(grid):
        return notes
    out = []
    for s, e, p in notes:
        qs = float(grid[int(np.argmin(np.abs(grid - s)))])
        qe = float(grid[int(np.argmin(np.abs(grid - e)))])
        if qe - qs < min_dur:
            continue
        out.append((qs, qe, p))
    # склейка соседних нот того же тона, оказавшихся вплотную после квантизации
    merged = []
    for s, e, p in out:
        if merged and merged[-1][2] == p and abs(s - merged[-1][1]) < 1e-6:
            merged[-1] = (merged[-1][0], e, p)
        else:
            merged.append((s, e, p))
    return merged


def harmonium_to_midi(audio_path: Path, output_path: Path) -> int:
    """Полифоническая транскрипция фисгармони через Basic Pitch. Возвращает число нот."""
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    _, _, note_events = predict(str(audio_path), ICASSP_2022_MODEL_PATH)
    # note_events: (start_s, end_s, pitch_midi, amplitude, pitch_bends)
    events = [
        (float(s), float(e), int(p), float(amp) if amp is not None else 1.0)
        for (s, e, p, amp, *_rest) in note_events
    ]
    notes = _clean(events, harmonic_suppression=settings.harmonic_suppression)
    write_midi(notes, output_path)
    return len(notes)


def harmonium_to_midi_librosa(audio_path: Path, output_path: Path) -> int:
    """Облегчённая полифоническая транскрипция фисгармони через CQT librosa.

    Без TensorFlow/Basic Pitch (работает на Python 3.13). Ключевое против дробления —
    гистерезис: нота зажигается по высокому порогу onset_thr, а гаснет только ниже
    offset_thr, поэтому колебания громкости не рвут её на куски. Дальше clean_notes
    склеивает остатки и подавляет обертоны.
    """
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), mono=True)
    hop = 512
    n_bins = 60  # 5 октав по 12 полутонов, начиная с C2
    fmin = librosa.note_to_hz("C2")
    midi_base = int(round(librosa.note_to_midi("C2")))
    cqt = np.abs(librosa.cqt(y, sr=sr, fmin=fmin, n_bins=n_bins, bins_per_octave=12, hop_length=hop))

    # Сглаживаем по времени, чтобы убрать мерцание (меньше ложных пере-зажиганий)
    try:
        from scipy.ndimage import median_filter

        cqt = median_filter(cqt, size=(1, 3))
    except ImportError:
        pass

    cmax = float(cqt.max()) or 1.0
    cn = cqt / cmax
    times = librosa.times_like(cqt, sr=sr, hop_length=hop)
    frame_dur = hop / sr
    onset_thr = settings.harmonium_onset_thr
    offset_thr = settings.harmonium_offset_thr
    max_poly = settings.max_polyphony

    events = []
    ongoing: dict[int, tuple[int, float]] = {}  # bin -> (стартовый кадр, макс. salience)
    n_frames = cn.shape[1]
    for f in range(n_frames):
        col = cn[:, f]
        peaks = [b for b in range(1, n_bins - 1) if col[b] >= col[b - 1] and col[b] >= col[b + 1]]
        sustain = {b for b in peaks if col[b] >= offset_thr}
        onset = [b for b in peaks if col[b] >= onset_thr]
        onset.sort(key=lambda b: col[b], reverse=True)
        onset = set(onset[:max_poly])  # ограничиваем полифонию по громкости

        # гасим ноты, упавшие ниже offset_thr
        for b in list(ongoing):
            if b not in sustain:
                start_f, sal = ongoing.pop(b)
                events.append((float(times[start_f]), float(times[f]), midi_base + b, sal))
        # зажигаем новые
        for b in onset:
            if b not in ongoing:
                ongoing[b] = (f, float(col[b]))
        # обновляем громкость удерживаемых
        for b in list(ongoing):
            start_f, sal = ongoing[b]
            ongoing[b] = (start_f, max(sal, float(col[b])))

    for b, (start_f, sal) in ongoing.items():
        events.append((float(times[start_f]), float(times[-1] + frame_dur), midi_base + b, sal))

    notes = _clean(events, harmonic_suppression=settings.harmonic_suppression)
    write_midi(notes, output_path)
    return len(notes)


def stub_to_midi(output_path: Path, *, polyphonic: bool) -> int:
    """Без ML: пишет короткую гамму/аккорды, чтобы файл MIDI существовал."""
    if polyphonic:
        # До-мажорное трезвучие, повторённое
        events = [
            (t, t + 0.9, p)
            for t in (0.0, 1.0, 2.0, 3.0)
            for p in (60, 64, 67)
        ]
    else:
        events = [(i * 0.5, i * 0.5 + 0.45, 60 + n) for i, n in enumerate([0, 2, 4, 5, 7])]
    write_midi(events, output_path)
    return len(events)
