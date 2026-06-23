"""Тесты выравнивания текста.

Whisper здесь не вызываем (его в окружении тестов нет) — проверяем чисто логику
матчинга и фоллбэк.
"""
from pathlib import Path

from app.pipeline import align
from app.schemas import LyricLine


def test_split_lines_drops_blank():
    txt = "первая\n\n  вторая  \n\n\nтретья\n"
    assert align.split_lines(txt) == ["первая", "вторая", "третья"]


def test_match_lines_greedy_window():
    # Whisper выдал поток слов; известные строки совпадают с ним поморфемно
    words = [
        {"text": "shri", "start": 0.0, "end": 0.4},
        {"text": "ram",  "start": 0.4, "end": 0.8},
        {"text": "jai",  "start": 0.8, "end": 1.2},
        {"text": "ram",  "start": 1.2, "end": 1.6},
        {"text": "shri", "start": 2.0, "end": 2.4},
        {"text": "ram",  "start": 2.4, "end": 2.8},
        {"text": "jai",  "start": 2.8, "end": 3.2},
        {"text": "ram",  "start": 3.2, "end": 3.6},
    ]
    lines = ["Shri Ram Jai Ram", "Shri Ram Jai Ram"]
    out = align._match_lines_to_words(lines, words)
    assert len(out) == 2
    assert all(l.aligned for l in out)
    assert out[0].start == 0.0
    assert out[1].start >= 2.0
    # вторая строка не должна начинаться раньше конца первой
    assert out[1].start >= out[0].end - 0.5


def test_structural_lines_pass_through():
    words = [{"text": "om", "start": 0.0, "end": 1.0}]
    lines = ["[Припев]", "om"]
    out = align._match_lines_to_words(lines, words)
    assert out[0].text == "[Припев]" and not out[0].aligned
    assert out[1].aligned


def test_no_match_leaves_unaligned():
    words = [{"text": "completely", "start": 0.0, "end": 0.5},
             {"text": "different", "start": 0.5, "end": 1.0}]
    lines = ["абвгд еёжзи"]
    out = align._match_lines_to_words(lines, words)
    assert not out[0].aligned and out[0].start is None


def test_equal_split_fallback(tmp_path):
    # без аудиофайла _audio_duration вернёт 0 → все строки без таймингов
    lines = ["a", "b", "c"]
    out = align._equal_split(lines, tmp_path / "nope.wav")
    assert len(out) == 3
    assert all(not l.aligned for l in out)
