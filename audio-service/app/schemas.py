"""Pydantic-схемы для API и манифеста результата."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    queued = "queued"
    downloading = "downloading"
    separating = "separating"
    transcribing = "transcribing"
    chords = "chords"
    aligning = "aligning"
    done = "done"
    error = "error"


class WordChord(BaseModel):
    text: str
    chords: list[str] = Field(default_factory=list)  # аккорды, меняющиеся на этом слове


class LyricLine(BaseModel):
    text: str
    start: Optional[float] = None
    end: Optional[float] = None
    aligned: bool = False  # True — есть тайминги от Whisper; False — без привязки
    interpolated: bool = False  # тайминги получены интерполяцией между распознанными строками
    chords: list[str] = Field(default_factory=list)  # все аккорды строки (для сводки)
    words: list[WordChord] = Field(default_factory=list)  # слова с привязкой смены аккорда


class LyricTimeline(BaseModel):
    """Один спетый фрагмент в порядке исполнения (с повторами). line — индекс в lyrics_lines."""

    start: float
    end: float
    line: int
    chords: list[str] = Field(default_factory=list)
    word_starts: list[float] = Field(default_factory=list)  # тайминги слов Whisper в этом фрагменте


class CreateJobRequest(BaseModel):
    """Тело запроса, когда источник — ссылка на YouTube (а не файл)."""

    youtube_url: Optional[str] = Field(default=None, description="Ссылка на YouTube")
    title: Optional[str] = Field(default=None, description="Название трека")


class ChordSpan(BaseModel):
    start: float
    end: float
    label: str


class JobResult(BaseModel):
    """Манифест результата. Пути — относительные имена файлов внутри папки задачи."""

    stems: dict[str, str] = Field(default_factory=dict)
    midi: dict[str, str] = Field(default_factory=dict)
    chords_file: Optional[str] = None
    chords: list[ChordSpan] = Field(default_factory=list)
    key: Optional[str] = None  # тональность песни, напр. "Bm" / "D"
    lyrics_file: Optional[str] = None
    lyrics_lines: list[LyricLine] = Field(default_factory=list)
    lyrics_timeline: list[LyricTimeline] = Field(default_factory=list)
    lyrics_language: Optional[str] = None
    stub: bool = False
    warnings: list[str] = Field(default_factory=list)


class JobView(BaseModel):
    id: str
    status: JobStatus
    progress: float = 0.0
    title: Optional[str] = None
    source_type: Optional[str] = None
    source_ref: Optional[str] = None
    lyrics: Optional[str] = None
    language: Optional[str] = None  # язык для ASR-выравнивания (bn/hi/sa/en/ru/auto)
    error: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    result: Optional[JobResult] = None
