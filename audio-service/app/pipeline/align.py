"""Forced alignment: известный текст ↔ аудио вокала (с учётом повторов).

В киртане строки/куплеты поются помногу раз, есть хор и перекличка. Поэтому
логика «перевёрнута»: мы не укладываем текст на аудио один раз, а берём то, что
Whisper реально распознал ПО ВРЕМЕНИ (в порядке исполнения), и каждый его
фрагмент сопоставляем с самой похожей строкой нашего текста.

  1. ASR (faster-whisper) по vocals.wav → сегменты со start/end. Тексту Whisper
     не доверяем — только времени и грубой форме слов.
  2. Каждый сегмент → ближайшая строка текста (difflib по нормализованной форме).
     Получаем ТАЙМЛАЙН: последовательность (start, end, индекс_строки) с повторами.
  3. lyrics_lines — это исходный текст (для показа). Таймлайн ведёт подсветку:
     одна строка, спетая N раз, подсветится N раз.

Фоллбэк: если faster-whisper недоступен — равномерно делим трек по строкам.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

from ..config import settings
from ..schemas import LyricLine, LyricTimeline, WordChord

# Минимальная похожесть строки на найденный фрагмент Whisper, чтобы считать привязкой.
_MIN_RATIO = 0.35
# Хвост в секундах, добавляемый к end последней строки/слова (вокал часто тянется).
_TAIL_S = 0.25


def split_lines(lyrics: str) -> list[str]:
    """Разбивает текст на строки, выкидывая пустые и пометки в [скобках] вроде [Припев]."""
    out = []
    for raw in lyrics.splitlines():
        line = raw.strip()
        if not line:
            continue
        # пометки структуры — оставляем как есть в тексте, но не уходят на матчинг
        out.append(line)
    return out


def _normalize(s: str) -> str:
    """Грубая нормализация: NFKD, нижний регистр, без пунктуации и диакритики."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^\w\sऀ-ॿঀ-৿]", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# Романизированные схемы — их транслитерировать не нужно
_ROMAN_SCHEMES = {
    "iast", "hk", "itrans", "slp1", "velthuis", "optitrans",
    "kolkata", "wx", "titus", "iso", "latin", "roman",
}


def _has_indic(text: str) -> bool:
    """Есть ли символы индийских письменностей (деванагари…малаялам: U+0900–0D7F)."""
    return any("ऀ" <= ch <= "ൿ" for ch in text)


def _romanize(text: str) -> str:
    """Приводит индийское письмо (деванагари/бенгали/…) к латинице (IAST).

    Нужно, чтобы сравнивать вывод Whisper (часто в деванагари) с романизированным
    текстом пользователя. Кириллицу/латиницу не трогаем. Если текст не индийский
    или indic-transliteration не установлен — возвращаем как есть.
    """
    if not _has_indic(text):
        return text
    try:
        from indic_transliteration import sanscript
        from indic_transliteration.detect import detect
    except ImportError:
        return text
    try:
        scheme = detect(text)
    except Exception:
        return text
    if not scheme:
        return text
    src = scheme.lower() if isinstance(scheme, str) else scheme
    if src in _ROMAN_SCHEMES:
        return text
    try:
        return sanscript.transliterate(text, src, sanscript.IAST)
    except Exception:
        return text


def _match_key(s: str) -> str:
    """Ключ для сравнения: романизация + нормализация (кросс-скрипт устойчиво)."""
    return _normalize(_romanize(s))


def _is_structural(line: str) -> bool:
    """Строки вида [Припев], (Mantra ×4) — структурные, не выравниваем."""
    return bool(re.match(r"^[\[\(].+[\]\)]$", line.strip()))


def align_lyrics(
    audio_path: Path, lyrics: str, *, language: Optional[str] = None
) -> tuple[list[LyricLine], list[LyricTimeline]]:
    """Основной путь (ASR). Возвращает (строки_для_показа, таймлайн).

    Бросает исключение при недоступности ASR — тогда вызывающий код берёт
    fallback_align. Так в задачу попадает предупреждение.
    """
    lines = split_lines(lyrics)
    if not lines:
        return [], []

    # language=None → Whisper определит язык сам (auto)
    segments = _whisper_segments(audio_path, language)
    timeline = _match_segments_to_lines(segments, lines)
    out_lines = _lines_with_first_occurrence(lines, timeline)
    return out_lines, timeline


def fallback_align(lyrics: str, audio_path: Path) -> tuple[list[LyricLine], list[LyricTimeline]]:
    """Запасной путь без ASR: равномерное деление трека по строкам (один проход)."""
    lines_text = split_lines(lyrics)
    lines = _equal_split(lines_text, audio_path)
    timeline = [
        LyricTimeline(start=l.start, end=l.end, line=i)
        for i, l in enumerate(lines)
        if l.start is not None and l.end is not None
    ]
    return lines, timeline


# ---------- ASR ----------

def _whisper_words(audio_path: Path, language: str) -> tuple[list[dict], float]:
    """Возвращает список слов Whisper и длительность аудио.

    Каждое слово: {"text": str, "start": float, "end": float}.
    """
    from faster_whisper import WhisperModel

    device = settings.asr_device
    if device == "auto":
        device = _pick_device()

    compute_type = settings.asr_compute_type
    # на cpu int8 — самое быстрое; на mps/cuda int8 не везде поддерживается
    if device != "cpu" and compute_type == "int8":
        compute_type = "float16"

    model = WhisperModel(settings.asr_model, device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        word_timestamps=True,
        vad_filter=True,
    )
    words: list[dict] = []
    for seg in segments:
        if not seg.words:
            continue
        for w in seg.words:
            if w.start is None or w.end is None:
                continue
            words.append({"text": w.word.strip(), "start": float(w.start), "end": float(w.end)})
    return words, float(info.duration or 0.0)


def _whisper_segments(audio_path: Path, language: str) -> list[dict]:
    """Возвращает сегменты Whisper: [{"text", "start", "end"}] в порядке времени."""
    from faster_whisper import WhisperModel

    device = settings.asr_device
    if device == "auto":
        device = _pick_device()
    compute_type = settings.asr_compute_type
    if device != "cpu" and compute_type == "int8":
        compute_type = "float16"

    model = WhisperModel(settings.asr_model, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(
        str(audio_path),
        language=language,
        word_timestamps=True,       # тайминги каждого слова — для раскладки аккордов
        vad_filter=True,            # режет тишину/проигрыши между повторами
        condition_on_previous_text=False,  # повторы не «залипают» друг на друге
    )
    out: list[dict] = []
    for seg in segments:
        if seg.start is None or seg.end is None:
            continue
        text = (seg.text or "").strip()
        if not text:
            continue
        word_starts = [
            float(w.start) for w in (seg.words or [])
            if w.start is not None
        ]
        out.append({
            "text": text, "start": float(seg.start), "end": float(seg.end),
            "word_starts": word_starts,
        })
    return out


def _pick_device() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    return "cpu"


# ---------- Сопоставление ----------

def _match_lines_to_words(lines: list[str], words: list[dict]) -> list[LyricLine]:
    """Жадно сопоставляет каждую следующую строку с очередным окном слов Whisper.

    Алгоритм: для строки i ищем такое окно [a, b] в потоке слов, начиная с курсора,
    которое максимизирует похожесть склеенных нормализованных строк (SequenceMatcher).
    Курсор двигаем за b. Если похожесть ниже _MIN_RATIO — строка остаётся без тайминга.
    """
    if not words:
        return [LyricLine(text=line) for line in lines]

    word_texts_norm = [_match_key(w["text"]) for w in words]
    cursor = 0
    result: list[LyricLine] = []

    for idx, line in enumerate(lines):
        if _is_structural(line):
            result.append(LyricLine(text=line))
            continue

        line_norm = _match_key(line)
        if not line_norm:
            result.append(LyricLine(text=line))
            continue

        # эвристика длины окна: примерно столько же слов, сколько в строке, ±50%
        target = max(1, len(line_norm.split()))
        min_w = max(1, target // 2)
        max_w = min(len(words) - cursor, target * 3)
        if max_w <= 0:
            result.append(LyricLine(text=line))
            continue

        best_ratio = 0.0
        best_a, best_b = cursor, cursor + min_w
        # сдвигаем стартовую точку немного вперёд (на случай вставленных Whisper-словечек),
        # а размер окна — в указанных пределах
        max_start_offset = min(8, len(words) - cursor - 1)
        for a_off in range(0, max_start_offset + 1):
            a = cursor + a_off
            for w_size in range(min_w, max_w + 1):
                b = a + w_size
                if b > len(words):
                    break
                window = " ".join(word_texts_norm[a:b])
                if not window:
                    continue
                ratio = SequenceMatcher(None, line_norm, window).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_a, best_b = a, b
                    if ratio > 0.95:
                        break
            if best_ratio > 0.95:
                break

        if best_ratio >= _MIN_RATIO and best_b > best_a:
            start = float(words[best_a]["start"])
            end = float(words[best_b - 1]["end"]) + _TAIL_S
            result.append(LyricLine(text=line, start=start, end=end, aligned=True))
            cursor = best_b
        else:
            result.append(LyricLine(text=line))
    return result


def _match_segments_to_lines(segments: list[dict], lines: list[str]) -> list[LyricTimeline]:
    """Каждый сегмент Whisper → ближайшая строка текста. Возвращает таймлайн с повторами."""
    candidates = [
        (i, _match_key(text))
        for i, text in enumerate(lines)
        if not _is_structural(text) and _match_key(text)
    ]
    if not candidates or not segments:
        return []

    timeline: list[LyricTimeline] = []
    for seg in segments:
        seg_norm = _match_key(seg["text"])
        if not seg_norm:
            continue
        best_ratio, best_idx = 0.0, None
        for idx, line_norm in candidates:
            r = SequenceMatcher(None, seg_norm, line_norm).ratio()
            if r > best_ratio:
                best_ratio, best_idx = r, idx
        if best_idx is not None and best_ratio >= _MIN_RATIO:
            timeline.append(LyricTimeline(
                start=seg["start"], end=seg["end"] + _TAIL_S, line=best_idx,
                word_starts=seg.get("word_starts", []),
            ))
    return timeline


def _lines_with_first_occurrence(lines: list[str], timeline: list[LyricTimeline]) -> list[LyricLine]:
    """Строки для показа; каждая получает тайминг своего ПЕРВОГО появления в таймлайне."""
    out = [LyricLine(text=t) for t in lines]
    for entry in timeline:
        ln = out[entry.line]
        if not ln.aligned:
            ln.start, ln.end, ln.aligned = entry.start, entry.end, True
    return out


def _word_bounds(words, start, end, word_starts):
    """Временные границы каждого слова. Если есть тайминги слов Whisper — используем
    их реальную плотность (учитывает паузы/распевы); иначе делим по длине слов."""
    n = len(words)
    if word_starts and len(word_starts) >= 2:
        # точки времени «по словам» (монотонные), нормируем на [start, end]
        pts = [start] + sorted(t for t in word_starts if start <= t <= end) + [end]
        m = len(pts) - 1

        def frac_to_time(f: float) -> float:
            x = f * m
            i = min(int(x), m - 1)
            return pts[i] + (pts[i + 1] - pts[i]) * (x - i)

        return [(frac_to_time(i / n), frac_to_time((i + 1) / n)) for i in range(n)]

    # запасной вариант: пропорционально длине слова
    lengths = [max(1, len(w)) for w in words]
    total = sum(lengths)
    dur = end - start
    bounds, acc = [], start
    for L in lengths:
        nxt = acc + dur * L / total
        bounds.append((acc, nxt))
        acc = nxt
    return bounds


def place_chords_on_words(text: str, start, end, chord_spans, word_starts=None) -> list[WordChord]:
    """Раскладывает слова строки по времени интервала [start, end] и ставит СМЕНУ
    аккорда над тем словом, где она происходит. word_starts — тайминги слов Whisper
    (если есть, раскладка точная). Возвращает список слов."""
    words = text.split()
    out = [WordChord(text=w) for w in words]
    if not words or start is None or end is None or end <= start or not chord_spans:
        return out

    bounds = _word_bounds(words, start, end, word_starts or [])

    relevant = sorted(
        (c for c in chord_spans if c.end > start and c.start < end),
        key=lambda c: c.start,
    )
    last = None
    for c in relevant:
        if c.label == last:  # только МОМЕНТЫ смены аккорда
            continue
        t = max(c.start, start)
        wi = next((i for i, (ws, we) in enumerate(bounds) if t < we), len(words) - 1)
        out[wi].chords.append(c.label)
        last = c.label
    return out


def attach_word_chords(lines: list[LyricLine], timeline: list[LyricTimeline], chord_spans) -> list[LyricLine]:
    """Для каждой выровненной строки строит пословную раскладку аккордов по её
    первому появлению, используя тайминги слов Whisper из таймлайна."""
    first: dict[int, LyricTimeline] = {}
    for e in timeline:
        first.setdefault(e.line, e)
    for i, line in enumerate(lines):
        e = first.get(i)
        word_starts = e.word_starts if e else []
        line.words = place_chords_on_words(
            line.text, line.start, line.end, chord_spans, word_starts=word_starts,
        )
    return lines


def attach_chords_to_timeline(timeline: list[LyricTimeline], chord_spans) -> list[LyricTimeline]:
    """Аккорды, звучащие в каждом фрагменте таймлайна (без подряд идущих повторов)."""
    if not chord_spans:
        return timeline
    for entry in timeline:
        labels: list[str] = []
        for c in chord_spans:
            if c.end > entry.start and c.start < entry.end:
                if not labels or labels[-1] != c.label:
                    labels.append(c.label)
        entry.chords = labels
    return timeline


# ---------- Фоллбэк ----------

def _equal_split(lines: list[str], audio_path: Path) -> list[LyricLine]:
    """Равномерно делим длительность трека по числу нестроковых строк."""
    duration = _audio_duration(audio_path)
    real = [i for i, l in enumerate(lines) if not _is_structural(l)]
    if not real or duration <= 0:
        return [LyricLine(text=l) for l in lines]

    slot = duration / len(real)
    out: list[LyricLine] = []
    counter = 0
    for i, line in enumerate(lines):
        if _is_structural(line):
            out.append(LyricLine(text=line))
            continue
        start = counter * slot
        end = (counter + 1) * slot
        counter += 1
        out.append(LyricLine(text=line, start=start, end=end, aligned=False))
    return out


def attach_chords(lines: list[LyricLine], chord_spans) -> list[LyricLine]:
    """Для каждой строки с таймингами собирает аккорды, звучащие в её интервале
    (без подряд идущих повторов)."""
    if not chord_spans:
        return lines
    for line in lines:
        if line.start is None or line.end is None:
            continue
        labels: list[str] = []
        for c in chord_spans:
            if c.end > line.start and c.start < line.end:  # пересечение интервалов
                if not labels or labels[-1] != c.label:
                    labels.append(c.label)
        line.chords = labels
    return lines


def _audio_duration(audio_path: Path) -> float:
    try:
        import soundfile as sf

        info = sf.info(str(audio_path))
        return float(info.duration)
    except Exception:
        try:
            import librosa

            return float(librosa.get_duration(path=str(audio_path)))
        except Exception:
            return 0.0
