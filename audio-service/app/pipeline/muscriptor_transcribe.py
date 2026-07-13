"""Транскрипция через MuScriptor (Kyutai/Mirelo, https://github.com/muscriptor/muscriptor).

MuScriptor — мультиинструментальная transformer-модель, обученная на 170k песен;
берёт исходник целиком и сама разделяет ноты по инструментам, поэтому Demucs для
MIDI больше не нужен. Мы просим только те инструменты, которые нам нужны для
бхаджанов: `voice` (вокал) и `organ` (ближайшее к фисгармони в MT3-словаре).

Лицензия весов: CC BY-NC 4.0 (некоммерческое использование). Веса гейтированы за
HuggingFace — до первого прогона надо принять лицензию на странице модели и
залогиниться (`hf auth login` или `HF_TOKEN=...`).

Модуль спроектирован как ОПЦИЯ: если пакет не установлен, импорт мягко падает,
и runner откатывается на текущий PYIN/basic-pitch пайплайн.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Iterable

from .midi_io import write_midi

# соответствие «наше имя стема» → «имя инструмента в MuScriptor»
INSTRUMENT_MAP = {
    "vocals": "voice",
    "harmonium": "organ",  # ближайшее к язычковому органу
}

_model_lock = threading.Lock()
_model = None


def is_available() -> bool:
    """Установлен ли пакет muscriptor + torch."""
    import importlib.util

    return all(importlib.util.find_spec(m) for m in ("muscriptor", "torch"))


def _get_model(size: str):
    """Ленивая загрузка модели: держим один экземпляр на процесс."""
    global _model
    with _model_lock:
        if _model is not None:
            return _model
        from muscriptor import TranscriptionModel

        _model = TranscriptionModel.load_model(size)
        return _model


def transcribe(
    audio_path: Path,
    out_dir: Path,
    *,
    stems: Iterable[str] = ("vocals", "harmonium"),
    model_size: str = "small",
) -> dict[str, Path]:
    """Прогоняет исходник через MuScriptor и пишет отдельный MIDI на каждый стем.

    Возвращает `{имя_стема: путь_к_.mid}`. Инструменты, для которых модель ничего
    не сгенерировала, в результат не попадают (runner тогда решает как быть).
    """
    instruments = [INSTRUMENT_MAP[s] for s in stems if s in INSTRUMENT_MAP]
    if not instruments:
        return {}

    model = _get_model(model_size)

    # собираем ноты по инструменту: pending{index: NoteStartEvent}, notes[instrument]=[(s,e,pitch)]
    from muscriptor.events import NoteEndEvent, NoteStartEvent

    pending: dict[int, NoteStartEvent] = {}
    notes: dict[str, list[tuple[float, float, int]]] = {inst: [] for inst in instruments}

    for ev in model.transcribe(str(audio_path), instruments=instruments):
        if isinstance(ev, NoteStartEvent):
            pending[ev.index] = ev
        elif isinstance(ev, NoteEndEvent):
            start = pending.pop(ev.start_event_index, None)
            if start is None:
                continue
            bucket = notes.get(start.instrument)
            if bucket is not None:
                bucket.append((float(start.start_time), float(ev.end_time), int(start.pitch)))

    # обратное отображение muscriptor-instrument → наше имя стема
    reverse = {v: k for k, v in INSTRUMENT_MAP.items()}
    out_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for inst, events in notes.items():
        if not events:
            continue
        stem_name = reverse.get(inst, inst)
        events.sort(key=lambda n: (n[0], n[2]))
        path = out_dir / f"{stem_name}.mid"
        write_midi(events, path)
        written[stem_name] = path
    return written
