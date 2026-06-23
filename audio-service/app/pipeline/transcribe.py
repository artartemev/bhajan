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
    """Монофоническая транскрипция вокала через librosa.pyin. Возвращает число нот."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), sr=None, mono=True)
    f0, voiced_flag, voiced_prob = librosa.pyin(
        y, sr=sr,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        frame_length=2048,
    )
    hop_length = 512
    frame_dur = hop_length / sr
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

    # По-кадровые ноты; склейку соседних кадров одного тона делает clean_notes
    events = []
    for i in range(len(f0)):
        if not voiced_flag[i] or np.isnan(f0[i]):
            continue
        pitch = int(round(librosa.hz_to_midi(f0[i])))
        sal = float(voiced_prob[i]) if voiced_prob is not None else 1.0
        events.append((float(times[i]), float(times[i] + frame_dur), pitch, sal))

    notes = _clean(events, harmonic_suppression=False)
    write_midi(notes, output_path)
    return len(notes)


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
