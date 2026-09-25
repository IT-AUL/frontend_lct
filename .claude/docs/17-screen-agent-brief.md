# 17 · Бриф для агентов-экранов (волна 2)

Общие правила для каждого агента, который реализует экран. Прочитай целиком.

## Старт

1. Твой worktree создан от `origin/main` — он **старый**. Первой командой:
   `git merge --ff-only new/festive-newton-hlnl7c` (ветка оркестратора в этом же репозитории).
   Потом `npm ci`.
2. Прочитай: `.claude/CLAUDE.md`, `.claude/STATUS.md`, `.claude/docs/15-design-v1-review.md`
   (токены, расхождения R1–R11), `.claude/docs/10-backend-integration.md` (реальный API),
   `.claude/docs/16-backend-requests.md` (баги бэка), раздел своего экрана в
   `.claude/docs/13-design-brief.md` и `.claude/docs/11-frontend-plan.md`.
3. Дизайн: `.claude/design/claude-design-v1/DeckDNA.dc.html`. Разметка экранов (номера строк
   файла): оболочка 15–90 · проекты 91–136 · шаблон/ДНК 137–362 · бриф 363–472 · план 473–535 ·
   генерация 536–612 · варианты 613–671 · аудит 672–865 · экспорт 866–962 · drawer'ы
   «Провайдер моделей»/«О системе» 963–1013. Логика и тексты — `<script>` 1018–1381
   (`valsProjects`, `valsTemplate`, `valsBrief`, `valsPlan`, `valsGen`, `valsVariants`, `valsAudit`,
   `valsExport`, `valsDrawers`). Демо-данные — `deckdna-data.js` (только как образец формы,
   **в UI идут только реальные данные API**).

## Что уже есть (используй, не дублируй)

- `src/app` — роутер (`src/app/router/router.tsx`), `ProjectLayout` с рельсом шагов и
  «цепочкой доказательств», `AppFrame` с шапкой и drawer'ами. Маршруты — `@/shared/config`
  (`routes.template(projectId)`, `routes.run(projectId, runId)`, `routes.audit(projectId, runId, variantId?)`…).
  Страница читает параметры через `useParams()` (`projectId`, `runId`, `variantId`).
- Заглушки страниц: `src/pages/<slug>/ui/<Name>Page.tsx` — **заменяешь содержимое своей**.
- `src/shared/ui` — Button, Badge, Segmented, Card, PageHeader, Meter, Mono, Skeleton,
  EmptyState, Drawer (Radix), Toast (`useToast`), Field/TextInput/TextArea, Switch, Checkbox,
  StepperInput, TagInput, **PdfPage** (ленивый рендер страницы PDF + слот для оверлея).
- `src/shared/lib` — format, storage, time (`useNow`), pdf, theme.
- `src/shared/api` — `api` (openapi-fetch), `unwrap`, `ApiError`, `uploadWithProgress`, `artifactUrl`.
- Сущности `src/entities/*`: **project** (+ `markEvidence(projectId, 'generated'|'repaired'|'exported'|'reaudited')`,
  `rememberRun`, `latestRunId`), **template** (`buildDesignSystem`), **content-pack**, **audit**
  (фильтры, группировки, словарь правил, repair/dismiss хуки, бейджи D/N и severity),
  **generation** (`startGeneration` + `useGenerationTracker` для синхронного и async POST,
  бюджет 5:00, стадии), **variant** (`STRATEGIES`, `resolveDeckFiles`, `variantMetrics`),
  **passport** (экспорты, паспорт, `isNotImplemented` для 501), **provider-session**,
  **system** (capabilities/version/manifest/health). Смотри их `index.ts`.
- Mock-режим (MSW, `npm run dev:mock`) вливается параллельно; оркестратор пришлёт сообщение —
  тогда снова сделай `git merge new/festive-newton-hlnl7c`. До этого проверяй логику тестами
  на фикстурах `src/shared/api/mocks/fixtures/*.json`.

## Правила кода (обязательно)

- **Никаких комментариев в коде.** Никакой атрибуции/водяных знаков; коммиты на английском,
  **без трейлеров Co-Authored-By**.
- FSD: `pages` → `widgets` → `features` → `entities` → `shared`; импорт только вниз, между
  слайсами — только через `index.ts` и алиас `@/`. Слайсы одного слоя друг друга не импортируют.
- Стили — CSS Modules + CSS-переменные из `src/app/styles/tokens.css`
  (`--bg --surface --surface-2 --sunken --line --line-2 --ink --ink-2 --ink-3 --inv --stage`,
  семантика `--ok/--blocker/--error/--warn/--info` и `-bg`, `--font-mono`, радиусы `--radius-*`).
  Пиксели — как в макете. Инлайн-стили только для данных (цвета палитры шаблона, bbox).
- Никакой доменной логики, которой нет у бэка. Чего нет в API — не рисуем цифрами из макета:
  честное «скоро»/скрытие (см. R1–R11 в `docs/15`). Модели в UI — только ≤ 35B.
- Доступность: семантические кнопки/ссылки, `aria-*`, фокус видим, клавиатура.
- Тексты интерфейса — русские, как в макете.

## Владение файлами

Трогай только свои слайсы (перечислены в задании). Нужен новый общий компонент в `shared/ui` —
сначала подумай, нельзя ли держать его в своём слайсе; если очень нужен, добавь с уникальным
именем и допиши export в `src/shared/ui/index.ts` одной строкой (конфликты мёржа разрулит оркестратор).
`src/app/**` не трогай, если в задании не сказано иное.

## Проверка перед сдачей

- `npm run lint`, `npm run typecheck`, `CI=1 npx vitest run`, `npm run build` — зелёные;
  `npm run lint:fsd` — без новых ошибок в твоих слайсах.
- Тесты: чистая логика (маппинги, выборки, форматирование) — unit-тесты; ключевой UI —
  Testing Library на фикстурах.
- Визуально: подними `npx vite --port <свой порт 5174–5179>` (в mock-режиме, когда он придёт) и сними
  скриншоты своего экрана в светлой и тёмной теме через Playwright с
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })`
  (1440×900; тема — `localStorage['deckdna.theme.v1'] = '"dark"'`). Сравни с разметкой макета.
  Скриншоты клади в scratchpad, не в репозиторий.
- Коммит в своей ветке worktree, **не пушить**. Отчёт оркестратору ≤ 250 слов: что сделано,
  какие файлы вне своих слайсов тронуты, что осталось/заблокировано бэком.
