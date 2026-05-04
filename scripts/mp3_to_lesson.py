#!/usr/bin/env python3
"""
mp3_to_lesson.py — Convert bhajan MP3 to lesson JSON via Demucs + Basic Pitch.

Steps:
  1. Demucs separates vocals from the MP3
  2. Basic Pitch converts vocals to MIDI note events
  3. Script writes lesson JSON ready to load in admin panel

Usage:
    python scripts/mp3_to_lesson.py input.mp3 --title "Шри Рам"
    python scripts/mp3_to_lesson.py input.mp3 --title "Шри Рам" --output my_lesson.json

    # Skip Demucs if you already have a vocals WAV
    python scripts/mp3_to_lesson.py vocals.wav --skip-separation --title "Шри Рам"

Install:
    pip install demucs basic-pitch
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def midi_to_note(midi_pitch: int) -> str:
    octave = (midi_pitch // 12) - 1
    name = NOTE_NAMES[midi_pitch % 12]
    return f"{name}{octave}"


def separate_vocals(input_path: str, output_dir: str) -> str:
    print(f"[1/3] Demucs: выделяем вокал из {Path(input_path).name} ...")
    subprocess.run(
        [sys.executable, '-m', 'demucs', '--two-stems=vocals', '-o', output_dir, input_path],
        check=True,
    )
    stem = Path(input_path).stem
    vocals = Path(output_dir) / 'htdemucs' / stem / 'vocals.wav'
    if not vocals.exists():
        raise FileNotFoundError(f"Demucs не создал файл: {vocals}")
    print(f"    Вокал сохранён: {vocals}")
    return str(vocals)


def extract_notes(audio_path: str) -> list:
    print(f"[2/3] Basic Pitch: распознаём ноты ...")
    from basic_pitch.inference import predict  # type: ignore
    _, _, note_events = predict(audio_path)
    # note_events: [(start_s, end_s, pitch_midi, amplitude, pitch_bends), ...]
    return note_events


def build_lesson(note_events: list, title: str) -> dict:
    steps = []
    for start_s, end_s, pitch_midi, _amp, _bends in note_events:
        duration_ms = max(80, int((end_s - start_s) * 1000))
        steps.append({
            "part": "",
            "beat": 0,
            "swara": "",
            "note": midi_to_note(int(pitch_midi)),
            "lyric": "",
            "duration": duration_ms,
            "wordBreak": False,
            "startTime": round(float(start_s), 3),
        })

    steps.sort(key=lambda s: s["startTime"])

    return {
        "title": title,
        "confidence": "medium",
        "warnings": [
            "Ноты распознаны автоматически из аудио — проверьте и добавьте слоги вручную"
        ],
        "steps": steps,
    }


def main():
    parser = argparse.ArgumentParser(description="MP3 → lesson JSON (Demucs + Basic Pitch)")
    parser.add_argument("input", help="Входной MP3 (или WAV если --skip-separation)")
    parser.add_argument("--title", default="", help="Название бхаджана")
    parser.add_argument("--output", default="", help="Выходной JSON (по умолчанию рядом с MP3)")
    parser.add_argument("--skip-separation", action="store_true",
                        help="Не запускать Demucs, использовать файл напрямую")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    if not input_path.exists():
        print(f"Ошибка: файл не найден: {input_path}")
        sys.exit(1)

    title = args.title or input_path.stem
    output_path = Path(args.output) if args.output else input_path.with_suffix(".json")

    with tempfile.TemporaryDirectory() as tmp_dir:
        if args.skip_separation:
            audio_path = str(input_path)
        else:
            audio_path = separate_vocals(str(input_path), tmp_dir)

        note_events = extract_notes(audio_path)
        lesson = build_lesson(note_events, title)

    print(f"[3/3] Записываем {len(lesson['steps'])} нот → {output_path}")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(lesson, f, ensure_ascii=False, indent=2)

    print("\nГотово! Дальше:")
    print("  1. Загрузи JSON в админку (поле «Готовый lesson JSON»)")
    print("  2. Добавь слоги к нотам вручную в редакторе")
    print("  3. Сохрани урок")


if __name__ == "__main__":
    main()
