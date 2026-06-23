"""Транскрипция аудио в MIDI.

  • Вокал — монофонический: librosa.pyin (один чёткий голос, чистая мелодия).
  • Фисгармонь — полифонический: Spotify Basic Pitch (аккорды/несколько голосов).
"""
from __future__ import annotations

from pathlib import Path

from .midi_io import write_midi

MIN_NOTE_DURATION_S = 0.08
MERGE_GAP_S = 0.05


def vocals_to_midi(audio_path: Path, output_path: Path) -> int:
    """Монофоническая транскрипция вокала через librosa.pyin. Возвращает число нот."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), sr=None, mono=True)
    f0, voiced_flag, _ = librosa.pyin(
        y, sr=sr,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        frame_length=2048,
    )
    hop_length = 512
    frame_duration = hop_length / sr
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

    def hz_to_midi(freq: float) -> int:
        return int(round(librosa.hz_to_midi(freq)))

    events: list[tuple[float, float, int]] = []
    i, n = 0, len(f0)
    while i < n:
        if not voiced_flag[i] or np.isnan(f0[i]):
            i += 1
            continue
        pitch = hz_to_midi(f0[i])
        start = times[i]
        j = i + 1
        while j < n:
            if not voiced_flag[j] or np.isnan(f0[j]):
                gap_end = j
                while gap_end < n and (not voiced_flag[gap_end] or np.isnan(f0[gap_end])):
                    gap_end += 1
                gap_s = (gap_end - j) * frame_duration
                if gap_s <= MERGE_GAP_S and gap_end < n and hz_to_midi(f0[gap_end]) == pitch:
                    j = gap_end
                    continue
                break
            if hz_to_midi(f0[j]) != pitch:
                break
            j += 1
        end = times[j - 1] + frame_duration
        if (end - start) >= MIN_NOTE_DURATION_S:
            events.append((float(start), float(end), pitch))
        i = j

    write_midi(events, output_path)
    return len(events)


def harmonium_to_midi(audio_path: Path, output_path: Path) -> int:
    """Полифоническая транскрипция фисгармони через Basic Pitch. Возвращает число нот."""
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    _, _, note_events = predict(str(audio_path), ICASSP_2022_MODEL_PATH)
    # note_events: список (start_s, end_s, pitch_midi, amplitude, pitch_bends)
    events = [(float(s), float(e), int(p)) for (s, e, p, *_rest) in note_events]
    write_midi(events, output_path)
    return len(events)


def harmonium_to_midi_librosa(audio_path: Path, output_path: Path) -> int:
    """Облегчённая полифоническая транскрипция фисгармони через CQT librosa.

    Без TensorFlow/Basic Pitch (работает на Python 3.13). Грубее, чем Basic Pitch:
    берём CQT в диапазоне фисгармони, по каждому кадру оставляем локальные пики
    спектра выше относительного порога (до 6 одновременных нот) и склеиваем их в
    ноты по непрерывности во времени.
    """
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), mono=True)
    hop = 512
    n_bins = 60  # 5 октав по 12 полутонов, начиная с C2
    fmin = librosa.note_to_hz("C2")
    midi_base = int(round(librosa.note_to_midi("C2")))
    cqt = np.abs(librosa.cqt(y, sr=sr, fmin=fmin, n_bins=n_bins, bins_per_octave=12, hop_length=hop))
    times = librosa.times_like(cqt, sr=sr, hop_length=hop)
    frame_dur = hop / sr

    events: list[tuple[float, float, int]] = []
    ongoing: dict[int, int] = {}  # bin -> стартовый кадр
    n_frames = cqt.shape[1]
    for f in range(n_frames):
        col = cqt[:, f]
        peak = float(col.max())
        thr = peak * 0.25
        present: set[int] = set()
        if peak > 0:
            for b in range(1, n_bins - 1):
                if col[b] >= thr and col[b] >= col[b - 1] and col[b] >= col[b + 1]:
                    present.add(b)
            if len(present) > 6:  # ограничиваем полифонию
                present = set(sorted(present, key=lambda b: col[b], reverse=True)[:6])

        for b in list(ongoing):
            if b not in present:
                start = times[ongoing.pop(b)]
                end = times[f]
                if end - start >= MIN_NOTE_DURATION_S:
                    events.append((float(start), float(end), midi_base + b))
        for b in present:
            ongoing.setdefault(b, f)

    for b, start_f in ongoing.items():
        start = times[start_f]
        end = times[-1] + frame_dur
        if end - start >= MIN_NOTE_DURATION_S:
            events.append((float(start), float(end), midi_base + b))

    write_midi(events, output_path)
    return len(events)


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
