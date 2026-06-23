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


def test_timeline_handles_repeats():
    # одна и та же строка спета дважды → в таймлайне две записи на ту же строку
    lines = ["Shri Ram Jai Ram", "Hare Krishna"]
    segments = [
        {"text": "shri ram jai ram", "start": 0.0, "end": 2.0},
        {"text": "hare krishna",     "start": 2.0, "end": 4.0},
        {"text": "shri ram jai ram", "start": 4.0, "end": 6.0},  # повтор
    ]
    tl = align._match_segments_to_lines(segments, lines)
    assert [e.line for e in tl] == [0, 1, 0]
    assert tl[0].start == 0.0 and tl[2].start == 4.0


def test_lines_first_occurrence():
    lines = ["Shri Ram Jai Ram", "Hare Krishna"]
    from app.schemas import LyricTimeline
    tl = [
        LyricTimeline(start=0.0, end=2.0, line=0),
        LyricTimeline(start=4.0, end=6.0, line=0),  # второй повтор не должен сдвинуть start
        LyricTimeline(start=2.0, end=4.0, line=1),
    ]
    out = align._lines_with_first_occurrence(lines, tl)
    assert out[0].aligned and out[0].start == 0.0  # первое появление
    assert out[1].aligned and out[1].start == 2.0


def test_fill_missing_lines_interpolates_between_anchors():
    from app.schemas import LyricLine, LyricTimeline
    # строки 0 и 2 распознаны, строка 1 — нет; интерполируем её между ними
    lines = [
        LyricLine(text="first", start=0.0, end=2.0, aligned=True),
        LyricLine(text="middle"),                                   # пропущена Whisper
        LyricLine(text="last", start=6.0, end=8.0, aligned=True),
    ]
    timeline = [
        LyricTimeline(start=0.0, end=2.0, line=0),
        LyricTimeline(start=6.0, end=8.0, line=2),
    ]
    out_lines, out_tl = align.fill_missing_lines(lines, timeline, audio_end=10.0)
    mid = out_lines[1]
    assert mid.start is not None and mid.interpolated
    assert 2.0 <= mid.start < 6.0          # попала в промежуток между якорями
    # в таймлайне появилась запись для строки 1 → будет подсветка
    assert any(e.line == 1 for e in out_tl)


def test_fill_missing_lines_trailing_uses_audio_end():
    from app.schemas import LyricLine, LyricTimeline
    lines = [
        LyricLine(text="sung", start=0.0, end=2.0, aligned=True),
        LyricLine(text="tail one"),
        LyricLine(text="tail two"),
    ]
    timeline = [LyricTimeline(start=0.0, end=2.0, line=0)]
    out_lines, _ = align.fill_missing_lines(lines, timeline, audio_end=8.0)
    assert all(out_lines[i].start is not None for i in (1, 2))
    assert out_lines[2].end <= 8.0 + 1e-6


def test_segments_ignore_unmatched():
    lines = ["знакомая строка"]
    segments = [{"text": "completely unrelated noise", "start": 0.0, "end": 1.0}]
    tl = align._match_segments_to_lines(segments, lines)
    assert tl == []


def test_romanize_passthrough_without_lib():
    # на латинице транслитерация ничего не меняет (и не требует библиотеки)
    assert align._match_key("āmāra jīvana") == "amara jivana"


def test_cross_script_match():
    # Деванагари из Whisper ↔ романизированный текст пользователя
    pytest = __import__("pytest")
    pytest.importorskip("indic_transliteration")
    lines = ["āmāra jīvana sadā pāpe rata"]
    segments = [{"text": "आमार जीवन सदा पापे रत", "start": 0.0, "end": 2.0}]
    tl = align._match_segments_to_lines(segments, lines)
    assert len(tl) == 1 and tl[0].line == 0
