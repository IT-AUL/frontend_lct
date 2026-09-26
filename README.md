# DeckDNA Web

Веб-интерфейс DeckDNA — сервиса, который по произвольному PPTX-шаблону и брифу собирает
презентацию в трёх вариантах вёрстки, проводит аудит и экспортирует результат.
Стек: Vite 7, React 19, TypeScript, TanStack Query. Бэкенд (FastAPI) — отдельный репозиторий,
фронтенд обращается к нему по относительному пути `/api/v1`.

## Документация

- [ARCHITECTURE.md](ARCHITECTURE.md): место фронтенда в системе, слои FSD, поток данных, mock-режим, поставка, тесты, браузеры.
- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md): трассировка требований кейса (FR, NFR, DOC, SUB) на экраны и их статус.
- [docs/VARIANTS.md](docs/VARIANTS.md): ось различий трёх вариантов вёрстки и её обоснование.
- [docs/AUDIT_UI.md](docs/AUDIT_UI.md): как интерфейс показывает аудит (D и N), выбор исправлений, журнал и повторный аудит.

## Быстрый старт

Нужен Node.js 22 (минимум 20.19).

```bash
npm ci
cp .env.example .env.local   # BACKEND_URL — адрес бэкенда для dev-прокси
npm run dev                  # http://localhost:5173, /api проксируется на BACKEND_URL
```

Без бэкенда — mock-режим на фикстурах (MSW), весь путь проходит в браузере:

```bash
npm run dev:mock             # то же, что VITE_API_MODE=mock npm run dev
```

## Переменные окружения

| Переменная | Где | По умолчанию | Назначение |
|---|---|---|---|
| `BACKEND_URL` | dev-сервер Vite, контейнер `web` (рантайм) | `http://localhost:8000` (dev), `http://api:8000` (образ) | куда проксировать `/api`; только `scheme://host[:port]`, без пути |
| `VITE_API_MODE` | сборка | `live` | `live` — реальный API, `mock` — встроенные фикстуры |
| `WEB_PORT` | compose | `8080` | порт веб-интерфейса на хосте |
| `WEB_BACKEND_URL` | compose | `http://api:8000` | значение `BACKEND_URL` для контейнера `web` |
| `BACKEND_DIR` | compose | `../LCT-prezi-2026` | путь к клону бэкенда (контекст сборки `api`) |
| `BACKEND_DOCKERFILE` | compose | `Dockerfile` | Dockerfile бэкенда относительно `BACKEND_DIR` |
| `API_PORT` | compose | `8000` | порт API на хосте (профиль `backend`) |

Переменные compose читаются из `.env` рядом с `docker-compose.yml`, Vite — из `.env.local`.

## Docker

Один образ на все окружения: статика собирается в `node:22-alpine`, отдаётся nginx; адрес
бэкенда подставляется при старте контейнера (`BACKEND_URL`), пересборка не нужна.

```bash
# только фронтенд, бэкенд где угодно
docker build -t deckdna-web .
docker run -p 8080:80 --add-host=host.docker.internal:host-gateway \
  -e BACKEND_URL=http://host.docker.internal:8000 deckdna-web

# фронтенд + бэкенд из соседнего клона (../LCT-prezi-2026 или BACKEND_DIR)
docker compose --profile backend up --build
# фронтенд против уже запущенного бэкенда
WEB_BACKEND_URL=http://host.docker.internal:8000 docker compose up --build web

# образ на записанных ответах API — для тестов без бэкенда
docker build --build-arg VITE_API_MODE=mock -t deckdna-web:mock .
```

UI — http://localhost:8080, проверка живости — `/healthz`. nginx проксирует `/api/` на бэкенд
с сохранением пути, принимает загрузки до 200 МБ без буферизации, держит запросы до 30 минут
(синхронная генерация), отдаёт SSE `/api/v1/jobs/{id}/events` без буферизации, для SPA
делает fallback на `index.html`, кэширует хэшированные `/assets/` навсегда, `index.html` — без кэша,
выставляет CSP и базовые security-заголовки. Конфиг — `docker/nginx.conf.template`.

## Проверки

```bash
npm run lint        # ESLint
npm run lint:fsd    # Steiger, границы слоёв Feature-Sliced Design
npm run typecheck
npm test -- --run   # Vitest
npm run e2e         # Playwright: сквозные сценарии в Chromium, Firefox, WebKit
npm run build
```

E2E (`e2e/`) сами собирают приложение в mock-режиме (`dist-e2e/`) и поднимают `vite preview` на
порту 4317 (`E2E_PORT`), бэкенд не нужен. Сценарии: демо-путь от ДНК шаблона до скачивания PPTX,
новый проект с загрузкой шаблона, тема и панели. Браузеры ставятся один раз:
`npx playwright install --with-deps chromium firefox webkit`; один браузер —
`npm run e2e -- --project=chromium`; свой бинарник Chromium — `PW_CHROMIUM_PATH=/path/to/chrome`.
Отчёт — `npx playwright show-report`.

Проверка совместимости с настоящим бэкендом (`e2e-live/`): сценарий проходит весь путь на реальном
шаблоне — загрузка, разбор, три варианта, PDF-превью, исправление, скачивание PPTX — и падает при любом
ответе 5xx или ошибке страницы. Нужен запущенный DeckDNA (`BACKEND_URL`, по умолчанию `http://localhost:8000`):

```bash
E2E_TEMPLATE=/path/to/template.pptx npm run e2e:live
```

CI (GitHub Actions, `.github/workflows/ci.yml`) на push и PR в `main`: lint, typecheck, тесты,
сборка; e2e в Chromium, Firefox и WebKit (при падении HTML-отчёт в артефактах); отдельно
собирается Docker-образ (без публикации). `lint:fsd` блокирует сборку.

## Ограничения

- Только десктопные браузеры: актуальная и предыдущая версии Chrome, Firefox, Safari, Яндекс Браузер.
- Без бэкенда работает только mock-режим.
- `BACKEND_URL` задаётся без пути и завершающего слэша: `/api/...` передаётся бэкенду как есть.
- Контейнер nginx запускается стандартно (мастер-процесс от root, воркеры от `nginx`); TLS
  терминируется снаружи (обратный прокси или балансировщик).
- Профиль `backend` предполагает Dockerfile в корне клона бэкенда; иначе задайте `BACKEND_DOCKERFILE`,
  а переменные бэкенда положите в `$BACKEND_DIR/.env`.


[`docs/BACKEND_HANDOFF.md`](docs/BACKEND_HANDOFF.md) — что нужно от бэкенда DeckDNA, чтобы интерфейс совпал с макетами.
