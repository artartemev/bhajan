"""Утилиты записи MIDI (общие для вокала и фисгармони)."""
from __future__ import annotations

from pathlib import Path

MIDI_TEMPO = 500_000  # 120 BPM
TICKS_PER_BEAT = 480


def seconds_to_ticks(seconds: float) -> int:
    beats = seconds / (MIDI_TEMPO / 1_000_000)
    return int(beats * TICKS_PER_BEAT)


def write_midi(events: list[tuple[float, float, int]], output_path: Path) -> None:
    """events: список (start_s, end_s, midi_pitch). Полифония поддерживается."""
    import mido

    mid = mido.MidiFile(ticks_per_beat=TICKS_PER_BEAT)
    track = mido.MidiTrack()
    mid.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=MIDI_TEMPO, time=0))

    messages: list[tuple[int, str, int]] = []
    for start_s, end_s, pitch in events:
        messages.append((seconds_to_ticks(start_s), "on", pitch))
        messages.append((seconds_to_ticks(end_s), "off", pitch))
    # note_off раньше note_on при равном тике, чтобы не глушить новую ноту
    messages.sort(key=lambda m: (m[0], 0 if m[1] == "off" else 1))

    current = 0
    for tick, kind, pitch in messages:
        delta = tick - current
        current = tick
        if kind == "on":
            track.append(mido.Message("note_on", note=pitch, velocity=80, time=delta))
        else:
            track.append(mido.Message("note_off", note=pitch, velocity=0, time=delta))

    mid.save(str(output_path))
