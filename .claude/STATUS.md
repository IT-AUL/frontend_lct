# 📍 STATUS — где мы сейчас

> **Единый источник правды о текущем состоянии.** Любой агент читает этот файл первым
> и **обновляет его в конце каждой значимой работы** (правила — внизу).
> Время — МСК. Стоп-код: **29.09.2026 23:59**.

**Обновлено:** 2026-09-25 22:34 · **Фаза:** 4 — фронт готов ко всем новым ручкам бэка (D2–D11), полировка, заморозка

---

## 0. Любой агент (локальный или удалённый) — начни здесь

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
4. **Бэкенд** — https://github.com/Ranel435/LCT-prezi-2026. Если репозиторий недоступен (нет прав), всё нужное
   лежит в `.claude/backend-snapshot/` (OpenAPI, исходник API, аудит/repair, контракты, документация; см. его README).
   Истина по API — `backend-snapshot/backend/deckdna/api.py`. Запуск живого бэка — в README среза
   (Docker Hub может отдавать 401 — там есть обход через зеркало).
5. **Команды:** `npm ci` · `npm run dev:mock` (без бэка) · `npm run dev` (прокси на `BACKEND_URL`) ·
   `npm run lint && npm run lint:fsd && npm run typecheck && npm test -- --run && npm run build` ·
   `npm run e2e` (Playwright; в облаке — `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run e2e -- --project=chromium`).
   Всё это должно быть зелёным перед каждым пушем; CI (`.github/workflows/ci.yml`) гоняет то же + Docker + e2e в 3 браузерах на push в `main`.
6. Без бэка всё равно можно работать: **реальные ответы API записаны** в
   `src/shared/api/mocks/fixtures/*.json`, PDF трёх вариантов — в `public/mocks/`.
   Mock-режим готов: `npm run dev:mock` (MSW, весь путь без бэка).

## 1. Кто мы и что делаем

- ЛЦТ 2026, задача №4 VK Tech «Цифровой дизайнер презентаций». **Мы — фронтенд.**
  Бэк и ML (продукт **DeckDNA**, FastAPI) делают коллеги.
- Репозиторий: `IT-AUL/frontend_lct` (**публичный**), ветка `main`.
- Цель: отдельный, очень удобный фронт, раскрывающий сильные стороны DeckDNA и закрывающий
  его дыры. Фронт внутри их репо (`frontend/`) игнорируем. Правки бэку копим в `docs/16`.
- Поставка: Docker-образ фронта (nginx, `BACKEND_URL` в рантайме); позже CI выкладывает
  front + back на VPS.

## 2. Текущее состояние кода

| Слой | Что есть |
|---|---|
| Инфраструктура | Vite 7 + React 19 + TS strict, ESLint, Steiger (FSD, блокирующий), Vitest, Playwright (`e2e/`, 5 сценариев), MSW mock-режим, Dockerfile + `docker/nginx.conf.template` (`BACKEND_URL` в рантайме) + compose + CI |
| `src/app` | `main.tsx` (mock-воркер + засев демо-прогона), `setup/AppProviders`, `router` (ленивые страницы, маршруты — `shared/config/routes.ts`), `layouts` (`AppFrame`, `ProjectLayout`, `runStatus`) |
| `src/pages` | projects, template (ДНК + «ДНК в JSON»), brief, generation (таймер 5:00, трекер sync/async), plan (v1, только чтение), variants (карточки + сравнение), audit (bbox, D/N, repair, журнал, до/после, повторный аудит), export (+ паспорт), not-found |
| `src/widgets` | app-header, project-rail (шаги + цепочка доказательств), provider-panel, about-panel, design-dna, project-list, generation-tracker, deck-plan, variant-board, variant-compare, audit-workspace, slide-inspector, quality-passport |
| `src/features` | variant-files, upload-template, create-project, cancel-generation, rerun-generation, request-pdf-export, repair-issues, dismiss-issue, select-issues, export-deck |
| `src/entities` | project (+ evidence, runHistory), template, content-pack, audit, generation (tracker), variant (стратегии), passport, provider-session, system |
| `src/shared` | api (openapi-fetch, ошибки, upload, `mockMode` с обходом скачиваний), mocks (MSW), config, lib (pdf.js **legacy**, theme, storage, format, time), ui-кит (+ `PdfPage`) |
| Документация | `README.md`, `ARCHITECTURE.md`, `docs/REQUIREMENTS.md`, `docs/VARIANTS.md`, `docs/AUDIT_UI.md` |

Проверено (25.09 22:30): lint, lint:fsd, typecheck, **301 unit-тест**, build, **e2e 5/5** (Chromium), **e2e:live 3/3** на VK Tech — зелёные.
CI на `main` (run #2, `0d46cd3`): все 5 jobs зелёные — проверки+build, Docker, e2e Chromium/Firefox/WebKit.
**Живой бэк (25.09, бэк `3c466d2`, контракт OpenAPI = срез, 0 расхождений):** `npm run e2e:live` проходит на **7 шаблонах** —
VK Tech, WorkSpace, Education, шаблон питча и 3 синтетических «невиданных» (4:3, sparse) — без единой 4xx/5xx и ошибок консоли.
Запуск: `E2E_TEMPLATE=/путь/к/шаблону.pptx npm run e2e:live` (нужен бэк на `BACKEND_URL`, по умолчанию `localhost:8000`).

## 3. Контрольные точки

Статусы: ⬜ не начато · 🟡 в работе · ✅ готово · ⛔ заблокировано · ⏭ отложено.

| ID | Чекпоинт | План | Статус | Критерий приёмки |
|---|---|---|---|---|
| CP-00 | Контекст собран, инструменты | 25.09 | ✅ | docs/01–16, STATUS |
| CP-01 | Решения по стеку и дизайну | 25.09 | ✅ | см. §5 |
| CP-02 | Каркас: конфиги, shared, entities, app | 25.09 | ✅ | `npm run lint/typecheck/test/build` зелёные, пустое приложение открывается |
| CP-03 | Docker: Dockerfile + nginx.conf.template (`BACKEND_URL` в рантайме) + compose с их API | 25.09 | ✅ | `docker compose up` → UI, `/api` проксируется |
| CP-04 | MSW mock-режим по фикстурам | 26.09 | ✅ | `VITE_API_MODE=mock npm run dev` проходит весь путь без бэка |
| CP-05 | Оболочка (хедер, рельс шагов, «цепочка доказательств», тема) + Проекты + Шаблон/ДНК | 26.09 | ✅ | ДНК реального VK Tech отрисована по `buildDesignSystem` |
| CP-06 | Бриф и контент (файл или текст → `brief.md`), провайдер (drawer) | 26.09 | ✅ | content-pack создаётся с UI |
| CP-07 | Генерация: трекер sync/async, таймер против 5:00 | 27.09 | ✅ | 3 варианта доходят до completed |
| CP-08 | Превью через pdf.js, варианты (карточки + «слайд N во всех трёх»), план колоды (v1, после генерации) | 27.09 | ✅ | миниатюры и сравнение работают |
| CP-09 | Аудит: bbox-оверлей, фильтры D/N, выбор, repair, dismiss, журнал, повторный аудит | 28.09 | ✅ | выбранные проблемы исправляются, журнал по сигнатурам |
| CP-10 | Экспорт + Quality Passport + «О системе» (`/capabilities`) | 28.09 | ✅ | PPTX/PDF скачиваются, HTML — «скоро» |
| CP-11 | Совместимость с живым бэком + подключение новых ручек по `docs/16` | 29.09 | 🟡 | живой путь проверен на 7 шаблонах ✅; адаптеры D2–D11 написаны и включаются сами по данным бэка (`docs/BACKEND_HANDOFF.md` §8); ждём сами ручки |
| CP-12 | E2E, браузеры, README/ARCHITECTURE для сдачи | 29.09 | ✅ | happy path в 2+ браузерах |
| CP-13 | **Заморозка** | 29.09 20:00 | ⬜ | всё запушено до 23:59 |

## 4. Открытые вопросы

| ID | Вопрос | Статус |
|---|---|---|
| Q-01 | Передать бэкендерам **`docs/BACKEND_HANDOFF.md`** (готов, самодостаточный) | ⬜ пользователь |
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
| 25.09 | pdf.js — **legacy**-сборка: современная вызывает `Map.getOrInsertComputed`, которого нет в Chromium 141 и прошлых версиях браузеров (NFR-08) |
| 25.09 | Анимации из CSS Modules — только `global(dd-pulse)` / `global(dd-fade)`, иначе имя keyframes хешируется |
| 25.09 | В mock-режиме `<a download>` на `/api/` перехватывается и качается через fetch→blob (MSW не видит навигацию) — `shared/api/mockMode.ts` |
| 25.09 | Статус в шапке и шаги рельса — из реального состояния генерации и трекера; шаги варианты/аудит/экспорт закрыты до реального run id |
| 25.09 | Аудит после repair — по `audit_id` из ответа repair; бэк сохраняет audit id, но выдаёт новые id проблем → журнал по `issueSignature` |
| 25.09 | Правило steiger `insignificant-slice` выключено (виджеты одной страницы выделены намеренно) |
| 25.09 | Параллельная работа агентов — в git worktree (`.claude/worktrees/`, в .gitignore), бриф — `docs/17-screen-agent-brief.md` |

## 6. Следующие шаги

1. Живой бэк проверен (см. §2). Повторять `npm run e2e:live` после каждого обновления бэка (`git pull` в его клоне + пересборка API).
2. Браузеры NFR-08: реальный Safari и Яндекс Браузер вручную по happy path (в CI e2e зелёные в Chromium/Firefox/WebKit).
3. Когда бэк выкатит новые ручки/поля: `npm run api:types:live`, убрать локальные расширения типов (`AuditIssue`, `VariantSummary`, `Project`, `GenerationCreate`) в пользу сгенерированных, прогнать `e2e:live`. Бэкендеры (локально, не закоммичено) уже делают `audit/catalog.py` (D8), B4, B5, Q1.
4. Заморозка к 29.09 20:00 МСК, тег сдачи.

## 7. Журнал (новые записи сверху)

- **2026-09-25 22:34** — Фронт подготовлен ко всем пунктам `BACKEND_HANDOFF` §3: каталог правил `GET /audit/rules` (D8, локальный
  словарь — запасной), исходы repair по проблемам + `fingerprint` + «Что будет сделано» по `features.repair_dry_run` (D2),
  PNG-превью слайдов и montage с откатом на PDF (D6), план до вёрстки: `POST /projects/{id}/plans`, редактор плана, сборка
  с `deck_plan` по `features.plan_only` (D7), `latest_run_id` проекта (D10), `axes`/`style_fidelity`/`started_at`/`stage`
  варианта (D11/D3/D4), паспорт: `numbers_*`, `avg_occupancy`, `auto_fixes`. 404/405/501 на новых ручках = «ещё нет»,
  UI остаётся прежним. Новый `shared/api/raw.ts` для ручек вне OpenAPI. +28 тестов. Формы, которые читаем, — в §8 handoff.

- **2026-09-25 21:58** — Бэк обновлён до `5d6844c`: влита асинхронная генерация (ADR-010), исправлен B3 (`409` при отмене
  завершённого прогона). OpenAPI не изменился; `e2e:live` зелёный на async-бэке; `POST /generations` → 202 за 0,04 с.
  На фронте закрыта гонка отмены (поздний `409` → русское сообщение и обновление данных, тест). `docs/BACKEND_HANDOFF.md`
  обновлён. Остальные пункты списка бэкендерам ещё не исправлены.

- **2026-09-25 21:38** — Подготовлен `docs/BACKEND_HANDOFF.md`: 6 багов бэка, 11 пунктов данных по экранам, 4 пункта качества,
  контракт, критерии «готово» и таблица «что включится у нас само». Найден и исправлен дефект фронта: панель
  «О системе» на живом бэке показывала всё «скоро», т.к. не знала реальную форму `/capabilities` (`exporters`);
  теперь читает её и будущий блок `features`. В `e2e:live` добавлены проверки панелей «О системе» и провайдера.
  Цифры кеглей шаблона в документе измерены по XML, а не взяты из макета.

- **2026-09-25 21:28** — Проверка совместимости с живым бэком. Бэк обновлён до `3c466d2`, схема OpenAPI идентична срезу.
  Добавлен `npm run e2e:live` (`e2e-live/`, `playwright.live.config.ts`): 7 шаблонов проходят полный путь.
  По экранам на живых данных нет ошибок консоли и 4xx/5xx; фронт честно показывает ограничения бэка
  (PDF для r1 после repair, «скоро» для стиля и HTML, «не удалось» при неэффективном repair).
  Замерена эффективность repair по правилам, найден баг B6 и уточнён B1 — `docs/16`.

- **2026-09-25 21:17** — Всё влито в `main` (fast-forward), поверх — срез бэка от локального агента; проверено:
  типы из `backend-snapshot/openapi.json` совпадают с `schema.d.ts`, lint/fsd/typecheck/269 unit/build/e2e 5/5
  зелёные. По `api.py`: repair сохраняет audit id и выдаёт новые id проблем (фронт это учитывает).
  STATUS переписан под передачу локальному агенту.

- **2026-09-25 21:10** — Волна 3 влита. Ревью: 7 багов исправлено с регрессионными тестами (аудит после repair
  по id из ответа, повторный аудит без устаревших данных, прогон запоминается сразу после принятия POST,
  сброс цепочки доказательств на новом прогоне, блок шагов рельса до реального run id, статус из трекера).
  E2E Playwright (5 сценариев, Chromium 3×3 зелёные; Firefox/WebKit — в CI-джобе `e2e`). Документация
  для сдачи: `ARCHITECTURE.md`, `docs/REQUIREMENTS.md`, `docs/VARIANTS.md`, `docs/AUDIT_UI.md`.
  Скачивание файлов в mock-режиме починено (MSW не перехватывает навигацию), «ДНК в JSON» (FR-04).
  Проверки: lint, lint:fsd, typecheck, 269 unit, build, e2e — зелёные. Доступа к репо бэка нет.

- **2026-09-25 18:13** — Волна 2 влита: все экраны CP-05…CP-10 (8 агентов, 259 тестов). Найдено и исправлено
  по ходу: pdf.js → legacy-сборка (`Map.getOrInsertComputed` нет в Chromium 141 и старых браузерах NFR-08),
  анимации в CSS Modules → `global(dd-*)`, пилюля статуса из реального состояния генерации, mock-прогон
  попадает в историю прогонов. `lint:fsd` чистый и блокирующий в CI (правило `insignificant-slice` выключено).
  Запущена волна 3: сквозное ревью с исправлениями, e2e Playwright + CI, документация для сдачи.

- **2026-09-25 17:42** — Удалённый оркестратор: `main` вмёржен в `new/festive-newton-hlnl7c`, поставлены плагины
  superpowers/feature-dev/code-review/pr-review-toolkit. Каркас приложения (роутер, `AppFrame`, шапка,
  рельс шагов + цепочка доказательств из реального состояния, тема, `routes` в `shared/config`,
  `markEvidence`), `PdfPage`, `useVariantFiles`. Волна 1 агентов влита: сущности generation/variant/
  passport/provider-session/system (68 тестов), Docker+nginx+compose+CI (проверено в dockerd).
  Волна 2 (6 агентов в worktree) делает экраны по `docs/17-screen-agent-brief.md`; MSW в работе.
  Бэкенд-репо приватный — из облака недоступен, работаем по фикстурам и `schema.d.ts`.

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
