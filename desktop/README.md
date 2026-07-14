# Bhajan Desktop

Локальное Mac-приложение: стемы, MIDI, аудиоредактор с секциями, Synthesia-плеер,
обучалка «без повторов». См. [PRODUCT.md](PRODUCT.md).

## Требования

- **macOS** (Windows/Linux пока не полируем)
- **Rust** ≥ 1.77 — https://rustup.rs
- **Node** ≥ 20 (для UI-бандлера)
- **Python** 3.10–3.11 (для Python-sidecar с ML-зависимостями)
- **Xcode Command Line Tools**: `xcode-select --install`

## Первый запуск (dev)

```bash
cd desktop
npm install
npm run tauri dev
```

Приложение стартует с локальным Python-сервисом внутри — тем же
[`../audio-service`](../audio-service). Первый запуск дольше: Cargo компилит
Rust-shell.

## Что работает сейчас

- **Этап 0 — скелет**: окно приложения показывает наш существующий веб-UI.
  Загрузка mp3 / YouTube и MIDI-детекция уже работают (используется код из
  `../audio-service`). Остальные этапы из PRODUCT.md — впереди.

## Модели

Тяжёлые веса MuScriptor (`small` 103M / `medium` 307M / `large` 1.4B) кешируются
в `~/Library/Application Support/Bhajan/models/`. Перед первым использованием
надо принять лицензию на HuggingFace и залогиниться (см.
[`../audio-service/requirements-muscriptor.txt`](../audio-service/requirements-muscriptor.txt)).
Менеджер моделей в UI — Этап 5.

## Сборка релиза

```bash
npm run tauri build
# результат в src-tauri/target/release/bundle/dmg/
```
