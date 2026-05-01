# План улучшения проекта BhajanApp

## 1) Ключевые технические риски прямо сейчас

1. **Монолитный фронтенд-файл**: `pages/index.tsx` содержит и роутинг, и бизнес-логику, и UI-компоненты, и утилиты. Это сильно усложняет тестирование и развитие.  
2. **Смешение роутинговых подходов**: в Next.js используется `react-router-dom` внутри `pages/index.tsx`, что приводит к двойному роутингу и лишней сложности для SSR/SEO.  
3. **Невалидированная/хрупкая AI-интеграция**: в разных API используются разные модели (`gemini-1.5-pro-latest` и `gemini-pro`), есть `JSON.parse` без устойчивого ретрая/санитайза, а админский endpoint может выполнять долгие фоновые задачи в request lifecycle.  
4. **Словарь загружается целиком**: `/api/dictionary` возвращает весь словарь, а клиент кэширует его целиком в IndexedDB — это плохо масштабируется по памяти/времени при росте данных.  
5. **Схема БД минималистична**: таблица `Word` не содержит нормализации, версии перевода, источника/метаданных AI, индексов для типовых фильтров/поиска.

## 2) Предлагаемая целевая архитектура (поэтапно)

### Этап A — Разделение фронтенда и упрощение роутинга

- Перейти с `react-router-dom` на нативный Next routing (`pages` или лучше `app` router при миграции).
- Разбить `pages/index.tsx` на доменные модули:
  - `features/bhajans/*` (list, detail, filters)
  - `features/audio/*`
  - `features/dictionary/*`
  - `shared/ui/*`, `shared/lib/*`
- Вынести кастомные хуки (`useFavorites`, `useTheme`, `useShareBhajan`, `useAudio`) в отдельные файлы с unit-тестами.

**Ожидаемый эффект**: быстрее онбординг, ниже риск регрессий, проще код-ревью и рефакторинг.

### Этап B — Укрепление backend/API слоя

- Ввести слой `services` между API handlers и внешними зависимостями:
  - `services/dictionary.service.ts`
  - `services/translation.service.ts`
  - `services/bhajan.service.ts`
- Для AI-ответов: строгий парсинг + retry policy + fallback model.
- Для admin задачи обновления словаря — вынести в **очередь задач** (например, BullMQ + Redis) вместо long-running запроса.
- Добавить rate limiting и idempotency key на чувствительные endpoints.

**Ожидаемый эффект**: стабильность API, предсказуемая нагрузка, меньше 500 ошибок.

### Этап C — Оптимизация работы словаря

- Перейти от “полного словаря” к **инкрементальному sync**:
  - Endpoint `/api/dictionary/changes?since=<cursor>`
  - На клиенте хранить `lastSyncAt` + применять патчи (upsert/delete).
- Добавить серверный endpoint пакетного запроса: `/api/dictionary/lookup` для N слов сразу.
- В IndexedDB хранить слова построчно (`keyPath: sourceText`) вместо одного объекта `full_dictionary`.

**Ожидаемый эффект**: кратно меньше трафик/память, быстрый офлайн-кеш даже при росте словаря.

### Этап D — Реструктуризация БД (Prisma/PostgreSQL)

Предлагаемая эволюция `Word`:

- Нормализовать поля:
  - `normalizedText` (lowercase + strip punctuation), индексируемое.
  - `language`, `confidence`, `isProperNoun` — с индексами.
- Добавить аудит/версионирование AI:
  - `modelName`, `promptVersion`, `rawResponse`, `translatedAt`.
- Добавить таблицу `WordVariant` (варианты написания), связь 1-N с `Word`.
- Добавить уникальность по `(normalizedText, sourceLanguage)` вместо только `sourceText`.

**Ожидаемый эффект**: меньше дублей, лучше quality control переводов, масштабируемость аналитики.

## 3) Улучшение UX и сценариев

- Дебаунс поиска (300–400ms) + отмена предыдущих запросов.
- Виртуализация длинных списков бхаджанов (react-virtual).
- Явная индикация состояния офлайн-словаря: "актуален / нужна синхронизация".
- Для карточки бхаджана: optimistic UI для избранного.
- В аудиоплеере: сохранение позиции воспроизведения по `trackId`.

## 4) Качество, наблюдаемость, DevEx

- Добавить:
  - ESLint + Prettier + import ordering.
  - Unit tests (vitest/jest) для утилит (transpose, parser, cleaners).
  - API integration tests (supertest).
- Observability:
  - структурированные логи (pino)
  - trace-id в каждом запросе
  - Sentry для FE/BE
- CI/CD:
  - `npm run lint`, `npm run typecheck`, `npm run test`, `prisma migrate diff` в CI.

## 5) Приоритетный roadmap (прагматичный)

### Sprint 1 (быстрые победы)
- Разнести `pages/index.tsx` на модули без смены функционала.
- Дебаунс/отмена поиска.
- Строгая обработка ошибок AI и единая модель/конфиг.

### Sprint 2
- Инкрементальный словарь + новый формат IndexedDB.
- Batch lookup endpoint.

### Sprint 3
- Очередь задач для `update-dictionary`.
- Миграции БД для `Word` + индексы + аудит полей.

## 6) Минимальные изменения схемы БД (пример)

```prisma
model Word {
  id                 String   @id @default(cuid())
  sourceText         String
  normalizedText     String
  sourceLanguage     String
  transliteration    String
  russianTranslation String
  englishTranslation String
  spiritualMeaning   String?
  isProperNoun       Boolean  @default(false)
  confidence         String
  modelName          String?
  promptVersion      String?
  rawResponse        Json?
  translatedAt       DateTime?
  createdAt          DateTime @default(now())

  @@unique([normalizedText, sourceLanguage])
  @@index([sourceLanguage])
  @@index([confidence])
}
```

> Это не нужно внедрять сразу: лучше через последовательные миграции с backfill-скриптом.

## 7) Что сделать первым делом (конкретно)

1. Создать `features/` структуру и перенести туда хуки/компоненты из `pages/index.tsx`.
2. Для словаря заменить хранение `full_dictionary` на объект-стор по `sourceText`.
3. Добавить endpoint инкрементальной синхронизации и cursor-based fetch.
4. Вынести генерацию переводов в job-queue worker.
5. После этого — миграции `Word` и индексы.

---

Если нужно, следующим шагом могу подготовить **технический RFC с целевой структурой папок и пошаговым планом миграции без остановки продакшена**.
