"""Пост-обработка нот: убираем дробление, артефакты и гармонические «призраки».

Работает с любым источником нот (вокал/фисгармонь, librosa или Basic Pitch).
Нота описывается кортежем (start_s, end_s, pitch, salience), где salience —
относительная громкость/уверенность (для вокала просто 1.0).
"""
from __future__ import annotations

Note = tuple[float, float, int, float]

# Гармоники язычковых инструментов: 2-я (+12 полутонов) и 3-я (+19) сильнее всего
HARMONIC_INTERVALS = (12, 19, 24)


def clean_notes(
    events: list[Note],
    *,
    min_duration: float,
    merge_gap: float,
    harmonic_suppression: bool,
) -> list[tuple[float, float, int]]:
    """Возвращает очищенный список нот (start, end, pitch)."""
    if not events:
        return []

    notes = _merge_same_pitch(events, merge_gap)
    if harmonic_suppression:
        notes = _suppress_harmonics(notes)
    notes = [n for n in notes if (n[1] - n[0]) >= min_duration]
    notes.sort(key=lambda n: (n[0], n[2]))
    return [(s, e, p) for (s, e, p, _sal) in notes]


def _merge_same_pitch(events: list[Note], merge_gap: float) -> list[Note]:
    """Склеивает ноты одного тона, разделённые паузой меньше merge_gap."""
    by_pitch: dict[int, list[Note]] = {}
    for ev in events:
        by_pitch.setdefault(ev[2], []).append(ev)

    merged: list[Note] = []
    for pitch, group in by_pitch.items():
        group.sort(key=lambda n: n[0])
        cur_s, cur_e, _p, cur_sal = group[0]
        for s, e, _p2, sal in group[1:]:
            if s - cur_e <= merge_gap:  # тот же тон, зазор мал → одна нота
                cur_e = max(cur_e, e)
                cur_sal = max(cur_sal, sal)
            else:
                merged.append((cur_s, cur_e, pitch, cur_sal))
                cur_s, cur_e, cur_sal = s, e, sal
        merged.append((cur_s, cur_e, pitch, cur_sal))
    return merged


def _overlap(a: Note, b: Note) -> float:
    """Доля перекрытия по времени относительно более короткой ноты."""
    inter = min(a[1], b[1]) - max(a[0], b[0])
    if inter <= 0:
        return 0.0
    shortest = min(a[1] - a[0], b[1] - b[0])
    return inter / shortest if shortest > 0 else 0.0


def _suppress_harmonics(notes: list[Note], *, ratio: float = 0.9, overlap_thr: float = 0.5) -> list[Note]:
    """Убирает ноту, если одновременно звучит более громкий тон на октаву/квинту ниже
    (значит, верхняя — это обертон, а не отдельная нота)."""
    kept: list[Note] = []
    for n in notes:
        s, e, p, sal = n
        is_ghost = False
        for m in notes:
            if m is n:
                continue
            for interval in HARMONIC_INTERVALS:
                if m[2] == p - interval and _overlap(n, m) >= overlap_thr and m[3] * ratio >= sal:
                    is_ghost = True
                    break
            if is_ghost:
                break
        if not is_ghost:
            kept.append(n)
    return kept
