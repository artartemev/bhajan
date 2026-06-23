"""Юнит-тесты очистки нот (без librosa — чистая логика)."""
from app.pipeline.postprocess import clean_notes


def test_merges_fragmented_note():
    # Один тон, разорванный на три куска маленькими паузами → одна нота
    events = [
        (0.0, 0.30, 60, 1.0),
        (0.34, 0.60, 60, 1.0),
        (0.63, 1.00, 60, 1.0),
    ]
    notes = clean_notes(events, min_duration=0.12, merge_gap=0.1, harmonic_suppression=False)
    assert len(notes) == 1
    assert notes[0][0] == 0.0
    assert abs(notes[0][1] - 1.0) < 1e-9
    assert notes[0][2] == 60


def test_drops_short_artifacts():
    events = [
        (0.0, 1.0, 62, 1.0),     # настоящая нота
        (0.5, 0.53, 80, 0.2),    # короткий артефакт
    ]
    notes = clean_notes(events, min_duration=0.12, merge_gap=0.1, harmonic_suppression=False)
    pitches = [p for (_s, _e, p) in notes]
    assert 62 in pitches
    assert 80 not in pitches


def test_suppresses_octave_harmonic():
    # Громкая нота C4(60) и одновременный тихий обертон C5(72, +12) → обертон убираем
    events = [
        (0.0, 1.0, 60, 1.0),
        (0.0, 1.0, 72, 0.3),
    ]
    notes = clean_notes(events, min_duration=0.12, merge_gap=0.1, harmonic_suppression=True)
    pitches = [p for (_s, _e, p) in notes]
    assert 60 in pitches
    assert 72 not in pitches


def test_keeps_loud_octave_as_real_note():
    # Если верхняя нота сопоставима по громкости — это реальная нота, не призрак
    events = [
        (0.0, 1.0, 60, 1.0),
        (0.0, 1.0, 72, 1.0),
    ]
    notes = clean_notes(events, min_duration=0.12, merge_gap=0.1, harmonic_suppression=True)
    pitches = [p for (_s, _e, p) in notes]
    assert 60 in pitches and 72 in pitches
