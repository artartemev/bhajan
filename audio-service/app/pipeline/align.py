"""Forced alignment: известный текст ↔ аудио вокала.

Логика:
  1. ASR через faster-whisper по vocals.wav на выбранном языке (hi/sa/bn/en/...).
     Берём word-level таймстампы. Whisper-у НЕ доверяем как тексту — только времени.
  2. Сопоставляем НАШИ строки текста с потоком слов Whisper через difflib (по
     нормализованной строке). Каждая строка получает start/end по тем словам
     Whisper, на которые она «легла».
  3. Если для строки совпадения нет — отдаём её без таймингов (aligned=False).

Фоллбэк: если faster-whisper не установлен/упал — равномерно распределяем строки
по длительности трека. Это грубо, но не валит пайплайн.
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

from ..config import settings
from ..schemas import LyricLine

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


def _is_structural(line: str) -> bool:
    """Строки вида [Припев], (Mantra ×4) — структурные, не выравниваем."""
    return bool(re.match(r"^[\[\(].+[\]\)]$", line.strip()))


def align_lyrics(audio_path: Path, lyrics: str, *, language: Optional[str] = None) -> list[LyricLine]:
    """Главная функция. Бросает RuntimeError только если совсем нет аудио."""
    lines = split_lines(lyrics)
    if not lines:
        return []

    lang = language or settings.asr_language
    try:
        words, _audio_duration = _whisper_words(audio_path, lang)
        return _match_lines_to_words(lines, words)
    except Exception:
        # фоллбэк: равномерное распределение
        return _equal_split(lines, audio_path)


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

    word_texts_norm = [_normalize(w["text"]) for w in words]
    cursor = 0
    result: list[LyricLine] = []

    for idx, line in enumerate(lines):
        if _is_structural(line):
            result.append(LyricLine(text=line))
            continue

        line_norm = _normalize(line)
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
