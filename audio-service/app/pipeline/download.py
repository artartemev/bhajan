"""Получение исходного аудио: загрузка файла или скачивание с YouTube (yt-dlp)."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def fetch_youtube(url: str, dest_dir: Path) -> Path:
    """Скачивает аудиодорожку с YouTube в MP3. Требует установленный yt-dlp и ffmpeg."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out_template = str(dest_dir / "source.%(ext)s")
    subprocess.run(
        [
            sys.executable, "-m", "yt_dlp",
            "-x", "--audio-format", "mp3", "--audio-quality", "0",
            "-o", out_template,
            url,
        ],
        check=True,
    )
    mp3 = dest_dir / "source.mp3"
    if not mp3.exists():
        # yt-dlp мог сохранить с другим расширением — берём первый найденный
        candidates = list(dest_dir.glob("source.*"))
        if not candidates:
            raise FileNotFoundError("yt-dlp не создал аудиофайл")
        candidates[0].rename(mp3)
    return mp3


def save_upload(tmp_path: Path, dest_dir: Path) -> Path:
    """Перекладывает загруженный файл в папку задачи под именем source.<ext>."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    suffix = tmp_path.suffix.lower() or ".mp3"
    dest = dest_dir / f"source{suffix}"
    shutil.copyfile(tmp_path, dest)
    return dest
