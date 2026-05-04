#!/usr/bin/env python3
"""
mp3_to_lesson.py — Convert bhajan MP3 to lesson JSON via Demucs + librosa.

Steps:
  1. Demucs separates vocals from the MP3 (skip if vocals WAV already exists)
  2. librosa pyin detects pitch frame-by-frame from vocals
  3. Consecutive frames with the same note are merged into steps
  4. Writes lesson JSON ready to load in admin panel

Usage:
    python scripts/mp3_to_lesson.py input.mp3 --title "Шри Рам"

    # Demucs already ran — pass vocals WAV directly:
    python scripts/mp3_to_lesson.py vocals.wav --skip-separation --title "Шри Рам"

    # Or point to the folder Demucs created:
    python scripts/mp3_to_lesson.py separated/htdemucs/song/vocals.wav --skip-separation

Install:
    pip install demucs librosa soundfile
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np

NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

# Ignore notes shorter than this (filter out blips)
MIN_NOTE_DURATION_S = 0.08
# Merge gaps shorter than this between same-pitch notes
MERGE_GAP_S = 0.05


def hz_to_note(freq_hz: float) -> str:
    midi = round(librosa.hz_to_midi(freq_hz))
    octave = (midi // 12) - 1
    name = NOTE_NAMES[midi % 12]
    return f"{name}{octave}"


def find_demucs_vocals(mp3_path: Path) -> Path | None:
    """Look for vocals.wav that Demucs already created next to the MP3."""
    stem = mp3_path.stem
    candidates = [
        mp3_path.parent / 'separated' / 'htdemucs' / stem / 'vocals.wav',
        mp3_path.parent / 'htdemucs' / stem / 'vocals.wav',
    ]
    for c in candidates:
        if c.exists():
            return c
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
    print(f"    Вокал: {vocals}")
    return vocals


def extract_notes(audio_path: Path) -> list[dict]:
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

    # Group voiced frames into note events
    events = []
    i = 0
    n = len(f0)
    while i < n:
        if not voiced_flag[i] or np.isnan(f0[i]):
            i += 1
            continue

        note = hz_to_note(f0[i])
        start = times[i]
        j = i + 1

        while j < n:
            if not voiced_flag[j] or np.isnan(f0[j]):
                # Allow short silence gaps within same note
                gap_end = j
                while gap_end < n and (not voiced_flag[gap_end] or np.isnan(f0[gap_end])):
                    gap_end += 1
                gap_s = (gap_end - j) * frame_duration
                if gap_s <= MERGE_GAP_S and gap_end < n and hz_to_note(f0[gap_end]) == note:
                    j = gap_end
                    continue
                break
            if hz_to_note(f0[j]) != note:
                break
            j += 1

        end = times[j - 1] + frame_duration
        duration_s = end - start
        if duration_s >= MIN_NOTE_DURATION_S:
            events.append({
                "note": note,
                "startTime": round(float(start), 3),
                "duration": max(80, int(duration_s * 1000)),
            })
        i = j

    print(f"    Найдено {len(events)} нот")
    return events


def build_lesson(events: list[dict], title: str) -> dict:
    steps = [
        {
            "part": "",
            "beat": 0,
            "swara": "",
            "note": e["note"],
            "lyric": "",
            "duration": e["duration"],
            "wordBreak": False,
            "startTime": e["startTime"],
        }
        for e in events
    ]
    return {
        "title": title,
        "confidence": "medium",
        "warnings": ["Ноты распознаны автоматически — проверьте и добавьте слоги вручную"],
        "steps": steps,
    }


def main():
    parser = argparse.ArgumentParser(description="MP3 → lesson JSON (Demucs + librosa)")
    parser.add_argument("input", help="MP3 файл (или vocals.wav с --skip-separation)")
    parser.add_argument("--title", default="", help="Название бхаджана")
    parser.add_argument("--output", default="", help="Выходной JSON (по умолчанию рядом с входным файлом)")
    parser.add_argument("--skip-separation", action="store_true",
                        help="Не запускать Demucs, передать файл напрямую в librosa")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        print(f"Ошибка: файл не найден: {input_path}")
        sys.exit(1)

    title = args.title or input_path.stem
    output_path = Path(args.output).resolve() if args.output else input_path.with_suffix(".json")
    demucs_out = input_path.parent / "separated"

    if args.skip_separation:
        audio_path = input_path
    else:
        audio_path = separate_vocals(input_path, demucs_out)

    events = extract_notes(audio_path)
    lesson = build_lesson(events, title)

    print(f"[3/3] Записываем {len(lesson['steps'])} нот → {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(lesson, f, ensure_ascii=False, indent=2)

    print("\nГотово!")
    print("  1. Загрузи JSON в админку (поле «Готовый lesson JSON»)")
    print("  2. Нажми «Предпросмотр из JSON» и добавь слоги вручную")
    print("  3. Сохрани урок")


if __name__ == "__main__":
    main()
