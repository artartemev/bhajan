"""Тесты пост-обработки аккордов и привязки к строкам."""
from app.pipeline.chords import _merge_short
from app.pipeline.align import attach_chords
from app.schemas import ChordSpan, LyricLine


def _labels(spans, names):
    return [names[k] for (_s, _e, k) in spans]


def test_merge_absorbs_short_into_neighbor():
    # короткий участок (0.1с) между двумя длинными → исчезает
    spans = [(0.0, 2.0, 0), (2.0, 2.1, 1), (2.1, 4.0, 0)]
    out = _merge_short(spans, min_dur=0.8)
    assert len(out) == 1          # всё слилось в один аккорд 0
    assert out[0][2] == 0
    assert out[0][0] == 0.0 and out[0][1] == 4.0


def test_merge_keeps_real_changes():
    spans = [(0.0, 2.0, 0), (2.0, 4.0, 1), (4.0, 6.0, 2)]
    out = _merge_short(spans, min_dur=0.8)
    assert [k for (_s, _e, k) in out] == [0, 1, 2]


def test_merge_collapses_adjacent_duplicates():
    spans = [(0.0, 1.0, 5), (1.0, 2.0, 5)]
    out = _merge_short(spans, min_dur=0.5)
    assert len(out) == 1 and out[0] == (0.0, 2.0, 5)


def test_attach_chords_to_lines():
    lines = [
        LyricLine(text="первая", start=0.0, end=2.0, aligned=True),
        LyricLine(text="вторая", start=2.0, end=4.0, aligned=True),
        LyricLine(text="без тайминга"),
    ]
    chords = [
        ChordSpan(start=0.0, end=1.0, label="C:maj"),
        ChordSpan(start=1.0, end=2.5, label="G:maj"),
        ChordSpan(start=2.5, end=4.0, label="A:min"),
    ]
    out = attach_chords(lines, chords)
    assert out[0].chords == ["C:maj", "G:maj"]   # обе пересекают 0..2
    assert out[1].chords == ["G:maj", "A:min"]   # обе пересекают 2..4
    assert out[2].chords == []                   # нет таймингов — нет привязки


def test_place_chords_on_words():
    from app.pipeline.align import place_chords_on_words
    # строка из 4 слов на интервале 0..4с; смены аккорда в начале и на 2с
    chords = [
        ChordSpan(start=0.0, end=2.0, label="C:maj"),
        ChordSpan(start=2.0, end=4.0, label="G:maj"),
    ]
    words = place_chords_on_words("один два три четыре", 0.0, 4.0, chords)
    assert [w.text for w in words] == ["один", "два", "три", "четыре"]
    # первый аккорд — на первом слове
    assert words[0].chords == ["C:maj"]
    # смена на G:maj — где-то во второй половине строки
    g_positions = [i for i, w in enumerate(words) if "G:maj" in w.chords]
    assert g_positions and g_positions[0] >= 2


def test_place_chords_skips_repeats():
    from app.pipeline.align import place_chords_on_words
    chords = [
        ChordSpan(start=0.0, end=1.0, label="C:maj"),
        ChordSpan(start=1.0, end=2.0, label="C:maj"),  # тот же — не дублируем
        ChordSpan(start=2.0, end=3.0, label="F:maj"),
    ]
    words = place_chords_on_words("a b c d e f", 0.0, 3.0, chords)
    flat = [c for w in words for c in w.chords]
    assert flat == ["C:maj", "F:maj"]


def test_place_chords_no_timing_returns_plain_words():
    from app.pipeline.align import place_chords_on_words
    words = place_chords_on_words("раз два", None, None, [ChordSpan(start=0, end=1, label="C:maj")])
    assert [w.text for w in words] == ["раз", "два"]
    assert all(not w.chords for w in words)


def test_attach_chords_dedupes_consecutive():
    lines = [LyricLine(text="строка", start=0.0, end=3.0, aligned=True)]
    chords = [
        ChordSpan(start=0.0, end=1.0, label="C:maj"),
        ChordSpan(start=1.0, end=2.0, label="C:maj"),
        ChordSpan(start=2.0, end=3.0, label="F:maj"),
    ]
    out = attach_chords(lines, chords)
    assert out[0].chords == ["C:maj", "F:maj"]
