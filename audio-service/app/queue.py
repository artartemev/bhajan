"""Очередь задач. Два бэкенда:

  • inline — ThreadPoolExecutor в процессе API (для разработки, без Redis)
  • rq     — Redis Queue (для продакшена; воркер запускается отдельно: worker.py)
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from .config import settings

_executor = ThreadPoolExecutor(max_workers=2)


def enqueue(job_id: str) -> None:
    if settings.queue_backend == "rq":
        _enqueue_rq(job_id)
    else:
        _executor.submit(_safe_inline, job_id)


def _safe_inline(job_id: str) -> None:
    # Импорт здесь, чтобы не тянуть пайплайн в момент импорта модуля
    from .pipeline.runner import run_job

    run_job(job_id)


def _enqueue_rq(job_id: str) -> None:
    from redis import Redis
    from rq import Queue

    q = Queue("audio", connection=Redis.from_url(settings.redis_url))
    # Тяжёлые задачи: даём щедрый таймаут
    q.enqueue("app.pipeline.runner.run_job", job_id, job_timeout=3600)
