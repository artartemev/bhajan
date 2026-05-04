#!/usr/bin/env python3
"""
mp3_to_midi.py — Extract melody from bhajan MP3 via Demucs + librosa → MIDI.

Steps:
  1. Demucs separates vocals (skip if vocals WAV already exists)
  2. librosa pyin detects pitch from monophonic vocals
  3. Writes standard MIDI file (.mid)

Usage:
    python scripts/mp3_to_midi.py input.mp3 --title "Шри Рам"
    python scripts/mp3_to_midi.py vocals.wav --skip-separation --title "Шри Рам"

Install:
    pip install demucs librosa soundfile mido
"""

import argparse
import subprocess
import sys
from pathlib import Path

import librosa
import mido
import numpy as np

MIN_NOTE_DURATION_S = 0.08
MERGE_GAP_S = 0.05
MIDI_TEMPO = 500_000  # 120 BPM
TICKS_PER_BEAT = 480


def hz_to_midi(freq_hz: float) -> int:
    return int(round(librosa.hz_to_midi(freq_hz)))


def find_demucs_vocals(mp3_path: Path) -> Path | None:
    stem = mp3_path.stem
    for candidate in [
        mp3_path.parent / 'separated' / 'htdemucs' / stem / 'vocals.wav',
        mp3_path.parent / 'htdemucs' / stem / 'vocals.wav',
    ]:
        if candidate.exists():
            return candidate
    return None


def separate_vocals(input_path: Path, output_dir: Path) -> Path:
    existing = find_demucs_vocals(input_path)
    if existing:
        print(f"[1/3] Demucs уже запускался — найден {existing}")
        return existing

    print(f"[1/3] Demucs: выделяем вокал из {input_path.name} ...")
    subprocess.run(
        [sys.executable, '-m', 'demucs', '--two-stems=vocals', '-o', str(output_dir), str(input_path)],
        check=True,
    )
    vocals = output_dir / 'htdemucs' / input_path.stem / 'vocals.wav'
    if not vocals.exists():
        raise FileNotFoundError(f"Demucs не создал файл: {vocals}")
    return vocals


def extract_note_events(audio_path: Path) -> list[tuple[float, float, int]]:
    """Returns list of (start_s, end_s, midi_pitch)."""
    print(f"[2/3] librosa pyin: распознаём высоту тона ...")
    y, sr = librosa.load(str(audio_path), sr=None, mono=True)

    f0, voiced_flag, _ = librosa.pyin(
        y, sr=sr,
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'),
        frame_length=2048,
    )

    hop_length = 512
    frame_duration = hop_length / sr
    times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

    events = []
    i = 0
    n = len(f0)
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

    print(f"    Найдено {len(events)} нот")
    return events


def seconds_to_ticks(seconds: float) -> int:
    beats = seconds / (MIDI_TEMPO / 1_000_000)
    return int(beats * TICKS_PER_BEAT)


def write_midi(events: list[tuple[float, float, int]], output_path: Path, title: str) -> None:
    mid = mido.MidiFile(ticks_per_beat=TICKS_PER_BEAT)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    track.append(mido.MetaMessage('set_tempo', tempo=MIDI_TEMPO, time=0))
    track.append(mido.MetaMessage('track_name', name=title, time=0))

    # Build flat list of (tick, type, pitch)
    messages = []
    for start_s, end_s, pitch in events:
        messages.append((seconds_to_ticks(start_s), 'on', pitch))
        messages.append((seconds_to_ticks(end_s), 'off', pitch))

    messages.sort(key=lambda m: m[0])

    current_tick = 0
    for tick, msg_type, pitch in messages:
        delta = tick - current_tick
        current_tick = tick
        if msg_type == 'on':
            track.append(mido.Message('note_on', note=pitch, velocity=80, time=delta))
        else:
            track.append(mido.Message('note_off', note=pitch, velocity=0, time=delta))

    mid.save(str(output_path))


def main():
    parser = argparse.ArgumentParser(description="MP3 → MIDI (Demucs + librosa pyin)")
    parser.add_argument("input", help="MP3 файл (или vocals.wav с --skip-separation)")
    parser.add_argument("--title", default="", help="Название бхаджана")
    parser.add_argument("--output", default="", help="Выходной MIDI (по умолчанию рядом с входным)")
    parser.add_argument("--skip-separation", action="store_true",
                        help="Не запускать Demucs, передать файл напрямую")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        print(f"Ошибка: файл не найден: {input_path}")
        sys.exit(1)

    title = args.title or input_path.stem
    output_path = Path(args.output).resolve() if args.output else input_path.with_suffix(".mid")
    demucs_out = input_path.parent / "separated"

    if args.skip_separation:
        audio_path = input_path
    else:
        audio_path = separate_vocals(input_path, demucs_out)

    events = extract_note_events(audio_path)

    print(f"[3/3] Записываем MIDI → {output_path}")
    write_midi(events, output_path, title)
    print(f"\nГотово! {len(events)} нот в {output_path.name}")


if __name__ == "__main__":
    main()
