# 12 · Окружение разработки и инструменты агентов

Состояние на 25.09.2026. `.claude/` лежит в репозитории; `.mcp.json` и `.claude/settings.local.json` — локальные.

## Пути и репозитории

| Что | Где |
|---|---|
| Наш фронт | этот репозиторий (`IT-AUL/frontend_lct`, публичный) |
| Бэкенд DeckDNA | https://github.com/Ranel435/LCT-prezi-2026; срез нужных файлов — `.claude/backend-snapshot/` |
| Шаблоны организаторов, шаблон питча (слайды 7–11 обязательны), «невиданные» шаблоны | в репозитории бэка: `dop-data/`, `tests/fixtures/pptx/`; у автора проекта есть локально |
| Первоисточники ТЗ / Q&A / чат | `.claude/sources/` |
| Scratchpad сессии | `/private/tmp/claude-501/...` — временный, не хранить там важное |

Машина: macOS, Node v22, zsh. Бэкенд поднимается `docker compose up --build`
(API :8000, их UI :8080). Без Docker нужны Python 3.12 + LibreOffice + poppler.

## Скиллы (`.claude/skills/`, вызов `/имя`)

| Скилл | Когда |
|---|---|
| `frontend-design` | перед созданием или переделкой экранов: визуальное направление, типографика |
| `vercel-react-best-practices` | при написании и ревью React-кода: данные, бандл, ререндеры |
| `vercel-composition-patterns` | при проектировании API компонентов и UI-кита |
| `web-design-guidelines` | ревью готового UI: доступность, фокус, формы, анимации |
| `react-doctor` | перед коммитом и после фичи: скан проблем, health score |
| `tz-check` (команда) + агент `tz-compliance-reviewer` | сверка с ТЗ |

## Плагины (`.claude/settings.json → enabledPlugins`, маркетплейс `claude-plugins-official`)

`superpowers` (brainstorming, writing-plans, TDD, systematic-debugging, verification…),
`feature-dev`, `code-review`, `pr-review-toolkit`. Подключаются **при старте сессии**; если
не подключились — `/plugin install <имя>@claude-plugins-official` в интерактивном `claude`.
Superpowers задаёт жёсткий порядок работы; если мешает на вёрстке — выключить в settings.

## Прочее в `.claude/settings.json`

- `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — Agent Teams. Дорого по токенам, только для
  крупных параллельных фич.
- **Хук `TaskCompleted`** → `.claude/hooks/task-quality-gate.sh`: задачу нельзя закрыть,
  пока `npm run lint` / `typecheck` / `test -- --run` не зелёные. Отсутствующие скрипты
  пропускаются. Нет `package.json` — хук пропускает. Если нет `node_modules` — блокирует.
  **Поэтому при создании каркаса скрипты должны называться именно `lint`, `typecheck`, `test`.**

## MCP (`.mcp.json` в корне, в git не хранится; у облачного агента его нет)

- `playwright` — Chromium; `playwright-webkit` — WebKit (≈ Safari, требование ТЗ по браузерам).
- Браузеры ставятся командой `npx playwright install chromium webkit` (ещё не установлены).
- Плюс встроенный браузер приложения (`mcp__Claude_Browser__*`) — для быстрых проверок UI.

## Память ассистента

`~/.claude/projects/-Users-renat-dev-frontend-lct/memory/` — роль пользователя (фронтенд),
факты о кейсе. Это дополнение: главный источник — `.claude/STATUS.md`.
