"""RQ-воркер. Запуск (нужен только при QUEUE_BACKEND=rq):

    python worker.py
"""
from __future__ import annotations

from redis import Redis
from rq import Queue, Worker

from app.config import settings


def main() -> None:
    conn = Redis.from_url(settings.redis_url)
    worker = Worker([Queue("audio", connection=conn)], connection=conn)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
