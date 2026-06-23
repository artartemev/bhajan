# Kirtan Audio Service

Отдельный сервис: на вход — **MP3 или ссылка на YouTube**, на выход —
**разделённые дорожки** (вокал и фисгармонь), **MIDI** для каждой и
**аккордовая дорожка**. Сфокусирован на киртанах/бхаджанах (особое внимание
диапазону фисгармони), но архитектура универсальна для любых треков.

## Конвейер

```
источник (MP3 / YouTube)
   │  yt-dlp
   ▼
Demucs ──► vocals.wav · harmonium.wav (стем "other" + band-pass) · drums · bass
   │                         │
   │ librosa.pyin            │ Basic Pitch (полифония)
   ▼                         ▼
vocals.mid               harmonium.mid
                             │
                             ▼  madmom (DeepChroma + CRF)
                         chords.json
```

Почему так:
- **Фисгармонь** в 4-стемной модели `htdemucs` лежит в стеме `other` (бас и
  перкуссия уже вынесены), плюс мягкий band-pass ~90 Гц…6 кГц подчёркивает её
  диапазон. Альтернатива — `htdemucs_6s` с отдельным стемом `piano`.
- **Вокал** — монофонический, поэтому `librosa.pyin` (чистая мелодия).
- **Фисгармонь** — полифоническая (аккорды), поэтому `Basic Pitch`.
- **Аккорды** снимаются со стема фисгармони — там нет вокального вибрато и
  перкуссии, хрома-вектор чище.

## Режимы и качество

Каждый шаг пробует методы по очереди: **топовый → облегчённый (librosa) → заглушка**.

| Шаг | Топовый метод | Облегчённый (librosa) | Заглушка |
|-----|---------------|------------------------|----------|
| Разделение | Demucs | Demucs | копия исходника |
| Вокал → MIDI | librosa.pyin | — | демо-гамма |
| Фисгармонь → MIDI | Basic Pitch (TF) | CQT + пик-пикинг | демо-аккорд |
| Аккорды | madmom (TF) | хрома + шаблоны трезвучий | демо-цепочка |

- **stub** — без ML-зависимостей (заглушки). Включается автоматически, если нет
  librosa/demucs, или через `FORCE_STUB=1`. Для разработки UI/API.
- **light** — `requirements-light.txt`. **Работает на Python 3.13**, без
  TensorFlow/madmom. Реальные стемы, MIDI и аккорды алгоритмами librosa.
- **full** — `requirements-ml.txt` + Basic Pitch и madmom. Лучшее качество, но
  TensorFlow требует **Python 3.10–3.11** (на 3.12+ не собирается).

Этапы устойчивы по отдельности: если метод недоступен или падает, шаг откатывается
на следующий уровень, остальные отрабатывают, а в задачу пишется предупреждение
(`warnings`). Так первый прогон всегда что-то выдаёт.

## Запуск (разработка, stub или ML)

```bash
cd audio-service
pip install -r requirements.txt          # ядро (stub-режим заработает сразу)
cp .env.example .env
uvicorn app.main:app --reload            # http://localhost:8000
```

UI открывается на `http://localhost:8000`.

### Реальная обработка на Python 3.13 (light, без TensorFlow)

```bash
brew install ffmpeg                      # macOS (Ubuntu: sudo apt install ffmpeg)
pip install -r requirements-light.txt
uvicorn app.main:app --reload
```

### Лучшее качество (full: Basic Pitch + madmom, нужен Python 3.10–3.11)

TensorFlow/madmom/basic-pitch **не ставятся на Python 3.12+** (ошибка сборки
numpy/`pkgutil.ImpImporter`). Заведите отдельное окружение с Python 3.11:

```bash
# через conda
conda create -n kirtan python=3.11 -y
conda activate kirtan
brew install ffmpeg
pip install -r requirements-ml.txt
uvicorn app.main:app --reload

# либо через pyenv + venv
pyenv install 3.11.9 && pyenv local 3.11.9
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-ml.txt
```

В UI бейдж вверху покажет режим (`stub` / `ML`). Если какой-то метод недоступен,
шаг сам откатится на librosa или заглушку и допишет предупреждение в задачу.

## Запуск с очередью (продакшен, Redis + воркер)

```bash
docker compose up --build
# api    → http://localhost:8000
# worker → обрабатывает задачи из очереди rq
```

Чтобы worker реально считал ML, раскомментируйте установку `requirements-ml.txt`
в `Dockerfile`.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| `GET`  | `/api/health` | статус, режим (stub/ML), бэкенд очереди |
| `POST` | `/api/jobs` | создать задачу: `file` (multipart) **или** `youtube_url`; опц. `title` |
| `GET`  | `/api/jobs` | список задач |
| `GET`  | `/api/jobs/{id}` | статус + манифест результата |
| `GET`  | `/api/jobs/{id}/files/{name}` | скачать артефакт (wav/mid/json) |

Пример:

```bash
curl -F "file=@kirtan.mp3" -F "title=Шри Рам" http://localhost:8000/api/jobs
curl -F "youtube_url=https://youtu.be/XXXX"     http://localhost:8000/api/jobs
```

## Тесты

```bash
FORCE_STUB=1 pytest tests -q
```

## Конфигурация (.env)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `DATA_DIR` | `data` | где хранятся задачи и артефакты |
| `QUEUE_BACKEND` | `inline` | `inline` (в процессе) или `rq` (Redis) |
| `REDIS_URL` | `redis://localhost:6379/0` | адрес Redis для `rq` |
| `DEMUCS_MODEL` | `htdemucs` | `htdemucs` (4 стема) или `htdemucs_6s` |
| `HARMONIUM_STEM` | `other` | стем-источник фисгармони |
| `FORCE_STUB` | `0` | принудительный stub-режим |
| `MAX_UPLOAD_MB` | `100` | лимит загрузки |

## Дальше по плану

- [ ] Калибровка разделения фисгармони на реальных киртанах (`other` vs `piano`)
- [ ] Определение тоники/рага и нормализация аккордов под индийскую гармонию
- [ ] Темп/доли (beat tracking) для квантизации MIDI
- [ ] Интеграция результата в основное приложение Bhajan Sangam (аккорды на клавиатуре/уроки)
- [ ] Аутентификация и история задач пользователя
```
