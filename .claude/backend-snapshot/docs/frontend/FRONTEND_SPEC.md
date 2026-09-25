# Frontend Technical Specification (RU)

Цель: рабочий thin UI для полного цикла «шаблон → три варианта → аудит → repair → export». Визуальная полировка делается отдельным дизайнером — этот документ фиксирует **поведение, структуру и данные**, а не финальный стиль.

## 1. Технические рамки

- React 18 + TypeScript strict + Vite.
- Сетевой слой: только сгенерированный клиент из `/openapi.json` (openapi-typescript/orval) + TanStack Query.
- Состояние: TanStack Query для server state; локальный UI state — zustand или useState. Никакой доменной логики в TS.
- Стили: CSS custom properties (`--dd-*`) для цветов/отступов/радиусов/теней — дизайнер меняет токены, не компоненты. Без CSS-in-JS, без тяжёлых UI-kit зависимостей (нативные элементы + минимальные утилиты).
- Desktop-only: min-width 1280px; target Chrome/Firefox/Safari/Яндекс current+previous на macOS/Windows.
- Язык интерфейса: русский. Все строки в одном `ru.ts` словаре для будущей локализации.
- Доступность: семантические landmark'и, keyboard navigation, focus states, aria-labels на иконках.

## 2. Карта экранов и роутинг

```text
/                         → Projects (список)
/projects/new             → мастер создания
/projects/:id             → Project dashboard
/projects/:id/inputs      → Input wizard
/projects/:id/template    → Template analysis
/projects/:id/runs/:runId → Generation progress
/runs/:runId/variants     → Variant comparison
/variants/:variantId/audit   → Audit workspace
/variants/:variantId/export  → Export + Quality Passport
/settings/provider        → Provider settings (также drawer из любого экрана)
```

## 3. Экраны подробно

### 3.1 Projects `/`

- Заголовок «Проекты», кнопка «Новый проект».
- Таблица/карточки: имя, шаблон (имя файла + thumbnail), последний run + статус бейджем, дата обновления.
- Статусы: `queued`, `running` (с stage), `awaiting_user` (ждёт выбора fixes — выделить цветом), `completed`, `failed`, `canceled`.
- Пустой state: иллюстрация-заглушка + кнопка «Создать первый проект».

### 3.2 Provider settings (drawer + `/settings/provider`)

Поля:
- Название профиля;
- Base URL (OpenAI-compatible);
- API token (password input; после submit не отображается, показывается «сохранён на сессию»);
- Model IDs: text / vision / embedding / image (optional);
- Capability checkboxes: structured output, tool calls, image input, embeddings;
- Timeout, max concurrency.

Действия:
- «Проверить подключение» → `POST /provider-sessions/{id}/test`, показать результат по каждой capability (ok/fail/skip);
- «Сохранить» → создаёт session; «Отозвать» → DELETE.
- Плашка-предупреждение: «Токен хранится только в памяти сессии и удаляется после завершения работ».

Edge cases: base_url без схемы → подсказка; test fail → показать typed error message.

### 3.3 Input wizard `/projects/:id/inputs`

Три шага с progress indicator, state сохраняется между шагами:

**Шаг 1 — Шаблон:**
- drag&drop зона + file picker (`.pptx`, `.potx`);
- после upload: имя, размер, sha256 (коротко), статус валидации;
- кнопка «Анализировать шаблон» → analysis job; прогресс inline.

**Шаг 2 — Контент и brief:**
- мультизагрузка файлов контента (список с типами и статусами парсинга);
- поля: цель (select: продукт/проект/отчёт/инициатива/custom), аудитория, язык (ru/en), количество слайдов (slider 10–15, default 12, плюс custom number input — ТЗ разрешает пользовательскую длину вне 10–15), тон (optional), обязательные разделы (tag input);
- превью parsed sections count после ingest.

**Шаг 3 — Варианты и запуск:**
- три карточки стратегий с описанием оси (faithful/balanced/visual) — включены по умолчанию, official mode фиксирует 3;
- advanced: config version select, seed;
- кнопка «Сгенерировать» → `POST /generations` → redirect на progress.

Валидация на каждом шаге с inline-сообщениями; нельзя пройти дальше без обязательных данных.

### 3.4 Template analysis `/projects/:id/template`

- Слева: montage превью слайдов шаблона (grid, lazy-load).
- Справа панель Design DNA:
  - палитра (swatches с hex);
  - шрифты declared vs observed (таблица «заявлено/фактически» — ключевая фича, показываем расхождение Arial vs Play);
  - шкала размеров;
  - якоря (лого/футер/номера);
  - список ролей слайдов с количеством;
  - unsupported features — отдельная секция с badge.
- Confidence badges на inferred rules.
- CTA «Перейти к генерации».

### 3.5 Generation progress `/projects/:id/runs/:runId`

- Таймлайн стадий слева (вертикальный stepper): текущая стадия пульсирует, завершённые — галка + duration, failed — крестик + retry.
- Центр: три карточки вариантов; у каждой: название стратегии, статус, по мере готовности — montage thumbnail; клик → детальный preview.
- Справа: event log (scrollable, monospace, автоскролл, кнопка «скопировать»), elapsed timer, кнопка «Отменить».
- SSE reconnect с Last-Event-ID; при обрыве — баннер «переподключение…», без потери состояния.
- По `job.awaiting_user` → CTA «Перейти к аудиту».

### 3.6 Variant comparison `/runs/:runId/variants`

- Три колонки: стратегия + ось различия текстом, montage, сводные метрики (validity/editability/issues count), кнопки «Открыть», «Экспорт», «Аудит».
- Режим «сравнить слайды»: выбор slide index → три preview рядом, sync scroll.
- Под каждым вариантом — статус аудита и число issues по severity.

### 3.7 Audit workspace `/variants/:variantId/audit`

Главный экран качества:

- Центр: текущий слайд в виде PNG + overlay-слой с bbox прямоугольниками issues (цвет по severity: blocker=красный, error=оранжевый, warning=жёлтый, info=серый); hover → tooltip; click → фокус в списке.
- Слева: filmstrip слайдов с бейджами количества issues.
- Справа: список issues, группировка по слайду или по типу (переключатель), фильтры: deterministic/contextual, severity, repairable, status.
- Карточка issue: rule code, сообщение, measured vs threshold, evidence (например «contrast 3.2 < 4.5»), proposed fix описанием, checkbox «исправить».
- Панель действий внизу: «Выбрано N» + «Исправить выбранное» (disabled если 0) + «Пропустить и экспортировать».
- После repair: diff view — слайд до/после рядом, список выполненных actions, статусы issues (fixed/unresolved остаются видимыми, unresolved нельзя скрыть).
- Dismiss issue → обязательная причина (input), статус `dismissed` с отметкой.

### 3.8 Export `/variants/:variantId/export`

- Карточки форматов: PPTX (badge «editable»), PDF, HTML — размер, sha256 коротко, кнопка скачивания.
- Quality Passport: сводка метрик (validity/style/content/readability/editability), unresolved issues count, fallbacks disclosure, provenance (версии, модели, config hashes).
- Кнопка «Скопировать команду воспроизведения» (CLI command).
- Ссылка «Вернуться к сравнению вариантов».

## 4. Общие компоненты

- `<StageStepper>` — таймлайн стадий;
- `<JobStatusBadge>` — статус → цвет/иконка;
- `<SlideThumb>` — lazy preview + номер;
- `<IssueCard>`, `<IssueOverlay>` — bbox overlay на scaled image (пересчёт normalized→px);
- `<EmptyState>`, `<ErrorBanner>` (typed error → человекочитаемое сообщение + retry);
- `<ConfirmDialog>` для cancel/delete/dismiss;
- `<SecretField>` — password input + «saved» indicator;
- `<FileDrop>` — drag&drop с валидацией типа/размера.

## 5. Обработка состояний

- Loading: skeleton'ы на списках, спиннеры на кнопках (без блокировки всей страницы).
- Errors: typed error envelope → локализованное сообщение + кнопка retry если retryable.
- Refresh resilience: весь progress/state берётся из API — обновление страницы в любой момент безопасно.
- SSE fallback: если EventSource не работает (proxy), polling `GET /jobs/{id}` каждые 3с.

## 6. Нефункциональные требования

- Time to interactive < 3s на локальном запуске; montage lazy-loading.
- Никаких утечек токена в DOM/network/localStorage (только memory).
- Bundle: без тяжёлых визуальных библиотек; slide previews — обычные `<img>`.

## 7. Playwright happy path

1. Открыть `/`, создать проект.
2. Настроить provider (mock), проверить connection.
3. Загрузить template fixture → дождаться Design DNA.
4. Загрузить canonical content pack + brief → запустить генерацию.
5. Progress: увидеть 3 варианта завершёнными.
6. Comparison: открыть вариант.
7. Audit: увидеть issues, выбрать 1–2 repairable, запустить repair, увидеть revision 2.
8. Export: скачать PPTX — проверить non-empty response.
9. Обновить страницу на шаге 5 — состояние восстановлено.

## 8. Что НЕ делать в v1

- Ручной редактор слайдов/drag-and-drop объектов;
- auth/login;
- mobile layout;
- комментарии/коллаборация;
- inline text editing на preview.
