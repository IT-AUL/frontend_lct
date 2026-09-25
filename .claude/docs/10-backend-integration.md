# 10 · Бэкенд команды (DeckDNA) — что нужно фронту

Состояние на **25.09.2026**, `main` @ `f3d199f`. Репозиторий: https://github.com/Ranel435/LCT-prezi-2026
(срез нужных файлов — `.claude/backend-snapshot/`; там же README; у автора проекта есть локальный клон).
Авторы: Ranel, tremoda2 + агенты Devin/Codex (~150 веток, почти все PR уже в main).

**Мы — фронтенд.** Бэк/ML делают они. Наш репо `frontend_lct` — отдельный «крутой фронт» поверх их API.
Никакой доменной логики во фронте (правила аудита, метрики, планирование) — только отображение.

## Где читать у них

| Файл | Зачем |
|---|---|
| `docs/frontend/FRONTEND_SPEC.md` | **спека фронта**: 8 экранов, поведение, компоненты, Playwright happy path |
| `docs/contracts/API.md` | контракт API (местами опережает код — сверять с `backend/deckdna/api/app.py`) |
| `backend/deckdna/api/app.py` | **истина по API** (2331 строк, FastAPI, in-memory STORE) |
| `schemas/*.schema.json` | JSON-схемы: design-dna, audit-issue, deck-plan, quality-passport, variant-spec… |
| `frontend/src/api/schema.d.ts` | сгенерированные TS-типы (openapi-typescript) — можно переиспользовать |
| `docs/pitch/DEMO_RUNBOOK_RU.md` | сценарий живого демо — определяет, какие экраны критичны |
| `PROJECT_CONTEXT.md` | их источник истины (огромный, 1682 строк; §19–20 — статус волн) |
| `docs/AUDIT.md` | 24 детерминированных правила + VLM-слой |

## Их продукт

**DeckDNA**: PPTX/POTX-шаблон + контент (md/txt/json/docx/pdf/xlsx) + бриф → 3 варианта
(стратегии **faithful / balanced / visual**) → аудит (24 D-правила + 11 VLM-вопросов) → repair
выбранных issues → экспорт PPTX/PDF(/HTML) + **Quality Passport** (метрики, provenance, версии).
Стек: Python 3.12 + FastAPI + Pydantic; LibreOffice для рендера; модели через OpenAI-compatible
gateway (по умолчанию `mock_provider` — детерминированный, без LLM). Запуск: `docker compose up --build`
→ API :8000 (`/api/v1`, OpenAPI `/openapi.json`), их UI :8080.

Замер: 1.9–7 с на колоду без LLM; с `use_llm` — минуты (12 VLM-вызовов на вариант).

## Их текущий фронт (`frontend/`) — MVP, это наша база/конкурент

React 18 + TS strict + Vite 5 + TanStack Query 5 + react-router 6 + zustand, без UI-кита,
стили через CSS-токены `--dd-*` (`src/styles/tokens.css`), строки в `src/i18n/ru.ts`.
Nginx-прокси `/api/` → `api:8000` (client_max_body_size 200m, read timeout 1800s).

Есть 3 экрана: `/` проекты · `/projects/:id/inputs` мастер (шаблон → контент+бриф → 3 стратегии,
use_llm, provider session) · `/projects/:id/runs/:runId` (polling job 2.5с, 3 карточки вариантов,
список issues, скачивание). **Нет** (по спеке нужно): Template analysis / Design DNA, Variant
comparison, Audit workspace с bbox-оверлеем, Repair UI + diff, Export / Quality Passport, SSE.

## API — реальное поведение (main)

Base `/api/v1`. Ошибки: `{error:{code,message,stage,retryable,request_id,details}}`.
Списки: `{items, next_cursor}` (cursor фактически не реализован, есть `limit`).
Mutating-запросы принимают `Idempotency-Key`.

| Метод | Путь | Заметки |
|---|---|---|
| POST | `/provider-sessions` | `{label, base_url, api_token, models{text,vision,embedding?,image?}, capabilities, timeout_seconds, max_concurrency, ttl_seconds, project_id?}`; токен не возвращается никогда. **GET-списка нет** → хранить id на клиенте (в памяти/sessionStorage, токен — никогда) |
| POST | `/provider-sessions/{id}/test` | живые пробы: results[{capability, status ok/fail/skip, detail}] |
| DELETE | `/provider-sessions/{id}` | 204 |
| POST/GET/PATCH/DELETE | `/projects[/{id}]` | create `{name, default_language='ru', target_slide_count=12 (3..40)}`; Project несёт `template_id`, `content_pack_id` |
| POST | `/projects/{id}/templates` | multipart `file` (.pptx/.potx, ≤200MB) → TemplateAsset (sha256, size, validation_status) |
| POST | `/templates/{id}/analyze` | 202, но **синхронно** (job сразу completed) → `{job_id, analysis_id}` |
| GET | `/templates/{id}` / `/design-dna` / `/slides` | DesignDNA: slide_size, declared{themes(major/minor font, colors), masters, layouts}, observed{fonts, font_sizes, colors, spacing, backgrounds}, anchors, slide_roles, exemplars… **превью слайдов шаблона нет** (`preview_artifact_id` пустой) |
| POST | `/projects/{id}/content-packs` | multipart `files[]` + form `brief` (JSON-строка); парсится **только первый** поддерживаемый файл; 202 → `{content_pack, job}` |
| GET | `/content-packs/{id}`, `/evidence-graph` | |
| POST | `/projects/{id}/generations` | `{template_id, content_pack_id, provider_session_id?, brief, variants[{strategy}] (1..3), use_llm}` → `{generation_id, job_id, variant_ids}`. **В main — синхронно**: ответ приходит после генерации всех вариантов (секунды без LLM, минуты с LLM) |
| GET | `/generations/{id}` | state, deck_plan, variants[VariantSummary] |
| POST | `/generations/{id}/cancel`, `/retry` | cancel в main косметический |
| GET | `/jobs/{id}` | `{state, stage, progress 0..1, error, result_ids}` |
| GET | `/jobs/{id}/events` | SSE — **заглушка** (4 фейковых события). Использовать polling |
| GET | `/generations/{id}/variants`, `/variants/{id}`, `/variants/{id}/slides` | VariantSummary: strategy, status, deck_artifact_id, metrics{validity, editability_pei, issues_total}, audit_status, export_ids, planner, contextual_issues. SlideInfo: index, purpose, title (из плана) |
| GET | `/slides/{id}/preview` | **всегда 404** — PNG-превью не генерируются |
| POST | `/variants/{id}/audits` | идемпотентен: отдаёт аудит из генерации; с `provider_session_id` дозапускает VLM |
| GET | `/audits/{id}`, `/audits/{id}/issues?slide&severity&deterministic&status&repairable&limit` | AuditRun: summary_by_severity/type, deterministic_status, contextual_status |
| POST | `/audits/{id}/repairs` | `{selected_issue_ids[], max_iterations, provider_session_id?}` → `{job_id, audit_id, deck_revision}`; новая ревизия колоды |
| POST | `/issues/{id}/dismiss` | `{reason}` обязателен |
| POST | `/variants/{id}/exports` | `{formats: pptx|pdf|html|quality_passport}`; **html → 501 not_implemented** |
| GET | `/exports/{id}`, `/artifacts/{id}/download` | download с Content-Disposition |
| GET | `/health/live`, `/health/ready`, `/version`, `/capabilities`, `/skill/manifest` | |

**AuditIssue**: `id, rule_code, deterministic (D/N!), severity info|warning|error|blocker, slide_index,
slide_id, shape_ids, bbox{x,y,w,h} — нормализованные [0,1] от размера слайда, message,
measured_value, threshold, evidence[{kind, ref, detail}], confidence, status
open|selected|fixed|dismissed|unresolved, repairable, proposed_actions[], provenance{rule_version, model_id, prompt_version}`.

Детерминированные rule_code (24): text.overflow, text.slide_clip, text.font_floor, layout.out_of_bounds,
layout.unintended_overlap, layout.edge_margin, image.aspect_ratio, template.font_family,
template.font_scale, template.color_palette, template.anchor_position, template.layout_origin,
accessibility.contrast, density.bullet_count, density.bullet_length, density.table_size,
density.chart_series, density.occupancy, integrity.empty_slide, integrity.duplicate_slide,
integrity.placeholder_text, integrity.package, editability.raster_only, chart.metadata.
Repair покрывает 12 из них (остальные → честный `unresolved`).

**Brief** (`schemas/deck-plan.schema.json`): purpose, audience, language, target_slide_count, tone,
mandatory_sections (сверить точные поля в schema.d.ts).

## Неслитая ветка: `devin/async-job-lifecycle` (ADR-010)

POST /generations → 202 **сразу**, run/job/варианты в `queued` → `running` → `completed/failed/canceled`,
статус каждого варианта обновляется по мере готовности, кооперативный cancel, `409 state_conflict`.
Фронт должен работать в обоих режимах: после POST всегда поллить `GET /generations/{id}` + `GET /jobs/{id}`.

## Разрывы бэка, которые бьют по фронту (просить у бэкендеров)

1. **PNG-превью слайдов** (варианты и шаблон) — без них нет audit-оверлея, сравнения вариантов,
   montage. Функция уже есть: `pptx/exporting/render.py::render_slides_png` — надо вызвать в
   генерации/анализе и проставить `preview_artifact_id` / `montage_artifact_id`.
2. **HTML-экспорт через API** — `render_html` есть (index.html + slide-*.png), но в API → 501.
   Обязателен по ТЗ.
3. **Async-генерация** — влить `devin/async-job-lifecycle`, иначе UI висит на POST минуты (с LLM).
4. **SSE** — сейчас фейк; polling достаточно, но прогресс по стадиям (`job.stage`) пригодится.
5. **Превью ревизии после repair** (до/после) — для diff-вида.
6. `GET /provider-sessions` отсутствует — ок, держим на клиенте.
7. Нет ручки «только план» и приёма отредактированного DeckPlan в `POST /generations`
   (нужно для шага «сначала план, потом вёрстка» — лучшая практика рынка, см. `docs/14`).
8. Нет dry-run repair (превью действий до применения) и авто-переаудита новой ревизии.

## Фикстуры для локальной разработки

`dop-data/Датасет/` — 3 шаблона организаторов (VK Tech 20MB, VK WorkSpace 13MB, VK Education 24MB);
`dop-data/Презентация/ЛЦТ2026 Шаблон презентации.pptx` — шаблон питча (слайды 7–11 обязательны);
`tests/fixtures/pptx/synthetic_unseen*.pptx` — «невиданные» шаблоны; `tests/fixtures/content/*.md` — контент/бриф.

## Сценарий демо (их DEMO_RUNBOOK) → что должен уметь UI

1. Загрузить unseen-шаблон → анализ. 2. **Design DNA панель** (палитра, шрифты declared vs observed —
«Arial заявлен / Play фактически» на VK Tech). 3. Generate → стадии. 4. **Три варианта + montage**.
5. Открыть PPTX. 6. **Audit workspace → выбрать 2 issue → repair → revision 2, diff**.
7. **Export PPTX/PDF/HTML + Passport**.
