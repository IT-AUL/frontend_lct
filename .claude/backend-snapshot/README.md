# Срез бэкенда DeckDNA (только для чтения)

Копия нужных фронту файлов из https://github.com/Ranel435/LCT-prezi-2026,
коммит `931ad6f` (25.09.2026). Лицензия оригинала — Apache-2.0 (`LICENSE`).
Нужна, когда репозиторий бэка недоступен: удалённый агент его не клонирует.
**Ничего здесь не правим** — бэк ведут коллеги. Пробелы и баги — в `../docs/16-backend-requests.md`.

## Что где

| Путь | Что это | Зачем фронту |
|---|---|---|
| `openapi.json` | схема живого API | источник типов: `npm run api:types` берёт её, если бэк не запущен |
| `backend/deckdna/api.py` | исходник всех эндпоинтов (`api/app.py`) | истина по поведению API, статусам и ошибкам |
| `backend/deckdna/audit/` | 24 детерминированных правила и контекстный аудит | коды правил, пороги, формат issue |
| `backend/deckdna/repair/` | планировщик и исполнитель исправлений | какие правила реально чинятся (`_RULE_HANDLERS`) |
| `backend/deckdna/contracts/` | Pydantic-контракты | точные формы DesignDNA, DeckPlan, AuditIssue |
| `schemas/*.json` | JSON-схемы контрактов | то же, в виде схем |
| `docs/contracts/` | API, артефакты, доменная модель | описание контракта (местами опережает код — сверять с `api.py`) |
| `docs/frontend/FRONTEND_SPEC.md` | их спека фронта | справочно, наш дизайн важнее |
| `docs/AUDIT.md`, `docs/pipeline/`, `docs/ARCHITECTURE.md`, `docs/MODELS.md` | документация пайплайна | как устроены аудит, экспорт, варианты |
| `docs/DEMO_RUNBOOK_RU.md` | сценарий демо на защите | какие экраны критичны |
| `manifest.yaml`, `SKILL.md`, `configs/`, `prompts/` | манифест скилла, конфиги, промпты | версии для паспорта и «О системе» |
| `fixtures/*.md` | примеры контента и брифа | для ручных и e2e-прогонов |

Записанные ответы работающего API лежат отдельно: `src/shared/api/mocks/fixtures/`,
PDF трёх вариантов — `public/mocks/`.

## Как запустить бэк, если есть Docker

```bash
git clone https://github.com/Ranel435/LCT-prezi-2026 && cd LCT-prezi-2026
cp .env.example .env
docker pull mirror.gcr.io/library/python:3.12-slim
docker tag mirror.gcr.io/library/python:3.12-slim python:3.12-slim
docker compose build api && docker compose up -d --no-deps api
```

API на `http://localhost:8000/api/v1`, схема — `/openapi.json`. Postgres и Redis не нужны:
хранилище в памяти, после перезапуска данные пропадают. Образ шаблона VK Tech (20 МБ) в срез не входит —
он лежит в `dop-data/` репозитория бэка.
