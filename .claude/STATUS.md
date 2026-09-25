# 📍 STATUS — где мы сейчас

> **Единый источник правды о текущем состоянии.** Любой агент читает этот файл первым
> и **обновляет его в конце каждой значимой работы** (правила — внизу).
> Время — МСК. Стоп-код: **29.09.2026 23:59**.

**Обновлено:** 2026-09-25 17:15 · **Фаза:** 1 — каркас фронта (CP-02 в работе) · **Передано удалённому агенту**

---

## 0. Если ты удалённый агент — начни здесь

1. Прочитай `.claude/CLAUDE.md` (суть кейса) → этот файл → `docs/15-design-v1-review.md` (дизайн)
   → `docs/10-backend-integration.md` + `docs/16-backend-requests.md` (реальный API и его дыры)
   → `docs/11-frontend-plan.md` (план экранов).
2. **Дизайн, который реализуем:** `.claude/design/claude-design-v1/DeckDNA.dc.html` (прототип,
   все стили инлайн), `deckdna-data.js` (демо-данные), `Slide.dc.html`. Воспроизвести
   **пиксель в пиксель на React**, структуру прототипа не копировать. Расхождения макета
   с бэком (R1–R11) — в `docs/15`; **в UI показываем только то, что реально отдаёт бэк**.
3. **Правила кода (обязательно):** без комментариев в коде; никаких водяных знаков и атрибуции
   ассистента (ни в коде, ни в коммитах — **без** трейлеров Co-Authored-By); прод-качество как для
   open source; архитектура **FSD** (app / pages / widgets / features / entities / shared);
   импорт между слайсами только через `index.ts` (public API) и алиас `@/`.
4. **Бэкенд** — https://github.com/Ranel435/LCT-prezi-2026 (не правим, только читаем; истина API —
   `backend/deckdna/api/app.py`). Поднять локально:
   `docker pull mirror.gcr.io/library/python:3.12-slim && docker tag mirror.gcr.io/library/python:3.12-slim python:3.12-slim`
   (Docker Hub может отдавать 401), затем в клоне бэка `cp .env.example .env && docker compose build api && docker compose up -d --no-deps api`
   → API на :8000. Postgres/Redis не нужны (хранилище в памяти).
5. Без бэка всё равно можно работать: **реальные ответы API записаны** в
   `src/shared/api/mocks/fixtures/*.json`, PDF трёх вариантов — в `public/mocks/`.
   Режим `VITE_API_MODE=mock` предусмотрен в `shared/config`, но **MSW-хендлеры ещё не написаны**.

## 1. Кто мы и что делаем

- ЛЦТ 2026, задача №4 VK Tech «Цифровой дизайнер презентаций». **Мы — фронтенд.**
  Бэк и ML (продукт **DeckDNA**, FastAPI) делают коллеги.
- Репозиторий: `IT-AUL/frontend_lct` (**публичный**), ветка `main`.
- Цель: отдельный, очень удобный фронт, раскрывающий сильные стороны DeckDNA и закрывающий
  его дыры. Фронт внутри их репо (`frontend/`) игнорируем. Правки бэку копим в `docs/16`.
- Поставка: Docker-образ фронта (nginx, `BACKEND_URL` в рантайме); позже CI выкладывает
  front + back на VPS.

## 2. Текущее состояние кода

| Слой | Что готово | Что дальше |
|---|---|---|
| Инфраструктура | `package.json` (React 19.3, React Router 7, TanStack Query 5, TS 5.9, Vite 7, Vitest 3, ESLint 10, Steiger, MSW, Playwright, pdfjs-dist 6, openapi-fetch), tsconfig (strict, алиас `@/`), vite.config (прокси `/api` → `BACKEND_URL`, vitest jsdom), eslint.config, steiger.config, index.html, favicon | `npm run lint` и `lint:fsd` ещё не прогонялись; Dockerfile + nginx.conf.template + compose (CP-03); README |
| `src/app/styles` | `tokens.css` (токены дизайна 1:1, светлая + тёмная), `global.css` (шрифты Onest/JetBrains Mono через @fontsource, анимации) | `app/`: main.tsx, providers (QueryClient, Toast, theme), router, layout |
| `src/shared` | `api` (schema.d.ts из живого OpenAPI, openapi-fetch клиент + `unwrap`, `ApiError` из error envelope, upload с прогрессом через XHR, `artifactUrl`); `config`; `lib` (format + тесты, storage, useNow, pdf: loadPdf/renderPdfPage/usePdfDocument); `ui` (Button, Badge, Segmented, Card, PageHeader, Meter, Mono, Skeleton, EmptyState, Drawer (Radix), Toast, Field/TextInput/TextArea, Switch (Radix), Checkbox, StepperInput, TagInput) | `mocks/` MSW-хендлеры по фикстурам |
| `src/entities` | **audit** (типы, SEVERITY, словарь 24 D + 10 N правил с категориями и реальным покрытием автоисправления, фильтры/группировки/сигнатуры + тесты на реальных данных, хуки useVariantAudit/useAuditIssues/useRepairIssues/useDismissIssue/useContextualAudit, SeverityBadge, CheckKindBadge); **project** (хуки, runHistory в localStorage); **template** (хуки, upload/analyze, `buildDesignSystem` из package_inventory + тесты); **content-pack** (хук, upload, summarize) | **generation**, **variant** (каталог стратегий faithful/balanced/visual), **provider-session**, **passport** |
| features / widgets / pages | — | всё по `docs/11` и дизайну |

Проверено: `tsc --noEmit` чистый, `vitest run` — 14 тестов зелёные.

## 3. Контрольные точки

Статусы: ⬜ не начато · 🟡 в работе · ✅ готово · ⛔ заблокировано · ⏭ отложено.

| ID | Чекпоинт | План | Статус | Критерий приёмки |
|---|---|---|---|---|
| CP-00 | Контекст собран, инструменты | 25.09 | ✅ | docs/01–16, STATUS |
| CP-01 | Решения по стеку и дизайну | 25.09 | ✅ | см. §5 |
| CP-02 | Каркас: конфиги, shared, entities, app | 25.09 | 🟡 | `npm run lint/typecheck/test/build` зелёные, пустое приложение открывается |
| CP-03 | Docker: Dockerfile + nginx.conf.template (`BACKEND_URL` в рантайме) + compose с их API | 25.09 | ⬜ | `docker compose up` → UI, `/api` проксируется |
| CP-04 | MSW mock-режим по фикстурам | 26.09 | ⬜ | `VITE_API_MODE=mock npm run dev` проходит весь путь без бэка |
| CP-05 | Оболочка (хедер, рельс шагов, «цепочка доказательств», тема) + Проекты + Шаблон/ДНК | 26.09 | ⬜ | ДНК реального VK Tech отрисована по `buildDesignSystem` |
| CP-06 | Бриф и контент (файл или текст → `brief.md`), провайдер (drawer) | 26.09 | ⬜ | content-pack создаётся с UI |
| CP-07 | Генерация: трекер sync/async, таймер против 5:00 | 27.09 | ⬜ | 3 варианта доходят до completed |
| CP-08 | Превью через pdf.js, варианты (карточки + «слайд N во всех трёх»), план колоды (v1, после генерации) | 27.09 | ⬜ | миниатюры и сравнение работают |
| CP-09 | Аудит: bbox-оверлей, фильтры D/N, выбор, repair, dismiss, журнал, повторный аудит | 28.09 | ⬜ | выбранные проблемы исправляются, журнал по сигнатурам |
| CP-10 | Экспорт + Quality Passport + «О системе» (`/capabilities`) | 28.09 | ⬜ | PPTX/PDF скачиваются, HTML — «скоро» |
| CP-11 | Подключение новых ручек бэка по `docs/16` | 29.09 | ⬜ | адаптеры переключены |
| CP-12 | E2E, браузеры, README/ARCHITECTURE для сдачи | 29.09 | ⬜ | happy path в 2+ браузерах |
| CP-13 | **Заморозка** | 29.09 20:00 | ⬜ | всё запушено до 23:59 |

## 4. Открытые вопросы

| ID | Вопрос | Статус |
|---|---|---|
| Q-01 | Передать бэкендерам `docs/16-backend-requests.md` | ⬜ пользователь |
| Q-02 | Как фронт попадает в сдачу (ссылка из их README / общий compose) | ⬜ позже |
| Q-03 | VPS, домен, HTTPS, CI | ⬜ позже |

## 5. Принятые решения (не пересматривать без причины)

| Дата | Решение |
|---|---|
| 25.09 | Мы — только фронт; их `frontend/` игнорируем; бэк не правим, пробелы — в `docs/16` |
| 25.09 | Позиционирование — «компилятор корпоративных презентаций»; принцип «доказательства, а не обещания» (`docs/14`) |
| 25.09 | Дизайн — Claude Design v1 (`design/claude-design-v1`), реализуем 1:1, но данные только реальные |
| 25.09 | Стек: React 19 + TS strict + Vite + React Router 7 + TanStack Query + openapi-fetch (типы из OpenAPI бэка); **CSS Modules + CSS-переменные** из дизайна + Radix-примитивы; FSD; без комментариев и атрибуции |
| 25.09 | Превью слайдов — pdf.js из PDF варианта (PNG бэк не отдаёт); статус — polling (SSE заглушка) |
| 25.09 | Автоисправимость = `repairable` **и** правило есть в словаре с `autoFix` (зеркало `repair/planner.py`) |
| 25.09 | Журнал исправлений строим на фронте: снимок выбранных проблем vs повторный аудит по `issueSignature` |
| 25.09 | ДНК шаблона строим из `latest_analysis.package_inventory` (DNA почти пустая) — `buildDesignSystem` |
| 25.09 | id прогонов проекта храним в localStorage (`runHistory`) — у бэка нет списка прогонов |
| 25.09 | Модели в UI — только ≤ 35B (в дизайне были 120B/72B — нарушение ТЗ) |

## 6. Следующие шаги

1. `npm install` → `npm run lint`, `npm run lint:fsd`, `npm run typecheck`, `npm test -- --run` — починить, если что-то падает.
2. Дописать entities: generation, variant, provider-session, passport.
3. `src/app`: main.tsx, providers, router (маршруты в `docs/11`), layout-оболочка по дизайну.
4. Docker (CP-03), затем экраны по порядку CP-05 → CP-10.
5. После каждого шага обновлять этот файл.

## 7. Журнал (новые записи сверху)

- **2026-09-25 17:15** — Проект передан удалённому агенту: `.claude/` теперь в репозитории
  (пароль организаторов вычищен), каркас фронта запушен. Реальный прогон API записан в фикстуры:
  3 варианта за 8,2 с без LLM, 74–108 проблем на вариант, PEI 3; найдены баги бэка B1–B5 (`docs/16`).

- **2026-09-25 16:46** — Получен handoff дизайна из Claude Design (17 состояний экранов, светлая и тёмная темы, токены).
  Сохранён в `design/claude-design-v1/`, разбор и 11 расхождений с бэком — в `docs/15`. Критичное: в макете
  модели > 35B (нарушение ТЗ), `style_fidelity` и `usage` бэк не считает. D-02 закрыт.

- **2026-09-25 16:12** — Анализ конкурентов (пользователь) сохранён в `sources/competitive-landscape.md`,
  выжимка — `docs/14`. Бриф (`docs/13`), план (`docs/11`) и просьбы к бэку (`docs/10`) выровнены
  под лучшие практики рынка: план до вёрстки, отчёт «что поняли», панель аудита в духе empower
  и Prezent, доказанная редактируемость. Новые просьбы к бэку: ручка «только план», dry-run repair,
  переаудит ревизии.

- **2026-09-25 16:05** — Написан текстовый бриф на UI/UX для Claude Design: `docs/13-design-brief.md`
  (дизайн не запускали). Он влияет на D-02: дизайн делает пользователь по этому брифу.

- **2026-09-25 15:57** — Установлены плагины superpowers 6.4.1, feature-dev, code-review, pr-review-toolkit
  (CLI `claude` не в PATH — ставили бинарником из `~/Library/Application Support/Claude/claude-code/<ver>/`).

- **2026-09-25 15:56** — Проверка окружения после перезапуска: 5 проектных скиллов, `tz-check`,
  агент `tz-compliance-reviewer`, MCP `playwright` и `playwright-webkit` доступны. Плагины
  superpowers/feature-dev/code-review/pr-review-toolkit **не установлены** (`installed_plugins.json` пуст).
  Chromium для Playwright есть, WebKit — нет. Docker daemon не запущен. Бэк без новых коммитов (`f3d199f`).

- **2026-09-25 15:51** — Собран контекст по кейсу и бэкенду, план фронта, настроены
  инструменты (5 скиллов, 4 плагина, Agent Teams, хук TaskCompleted, Playwright MCP).
  Создан этот файл. CP-00 ✅.

---

## Правила ведения этого файла

1. **В начале работы** прочитай §0–§6. Если задача противоречит §5, спроси пользователя.
2. **После значимого шага** обнови «Обновлено», таблицы §2–§5, §6 и добавь запись в §7 (МСК, `date`).
3. Закрывая чекпоинт, проверь критерий приёмки делом (команда, браузер), а не на словах.
4. Детали сюда не копируем — ставим ссылку на `docs/…`. Файл должен читаться за 2–3 минуты.
