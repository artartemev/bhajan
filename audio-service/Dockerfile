FROM python:3.11-slim

# ffmpeg нужен для yt-dlp и чтения mp3
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Раскомментируйте для реального ML-режима (образ станет крупным):
# RUN pip install --no-cache-dir -r requirements-ml.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
