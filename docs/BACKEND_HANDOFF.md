# Что нужно от бэкенда DeckDNA, чтобы фронт работал на 100% и совпадал с макетами

Документ для команды бэкенда. Он самодостаточный: читать наш код не нужно.
Проверено на бэкенде `Ranel435/LCT-prezi-2026`, коммит `5d6844c`, 25.09.2026 (после слияния асинхронной генерации).
Фронт: `IT-AUL/frontend_lct`, `main`.

## 0. Как читать и как проверить, что всё готово

**Что уже хорошо.** Фронт целиком работает на текущем API: схема OpenAPI не менялась между нашим
срезом и `3c466d2`, живой сценарий проходит на 7 шаблонах (VK Tech, WorkSpace, Education, шаблон
питча и 3 синтетических «невиданных») без единого ответа 4xx/5xx. Всё, что ниже, — **не блокеры
работы**, а то, что отделяет «работает честно» от «выглядит как в макетах».

**Как фронт ведёт себя без ваших правок.** Он не выдумывает данных: там, где бэк молчит, экран
показывает «нет данных», «скоро» или «сервис пока не…». Ваши правки убирают эти заглушки.

**Как проверить свою правку за минуту.** Поднимите бэк на `http://localhost:8000` и запустите
из нашего репозитория:

```bash
git clone https://github.com/IT-AUL/frontend_lct && cd frontend_lct && npm ci
npx playwright install chromium
E2E_TEMPLATE="/путь/к/VK Tech шаблон.pptx" npm run e2e:live
```

Сценарий проходит весь путь на реальном шаблоне и **падает на любом 5xx и ошибке страницы**.
Дальше по каждому пункту ниже указан «критерий готово»: запрос и ожидаемый ответ, а в разделе 8 — что именно
у нас включится автоматически.

**Приоритеты.** P0 — баги, ломающие или искажающие результат. P1 — данные, без которых экран отличается
от макета. P2 — улучшения качества и контракта. Оценка усилий: S — часы, M — день, L — несколько дней.

## 1. Сводка

| ID | Что | Экран | Приоритет | Усилие |
|---|---|---|---|---|
| B1 | 500 на фильтре `status=` после `dismiss` | Аудит | P0 | S |
| B2 | После repair пропадают PDF и паспорт новой ревизии | Аудит, Экспорт | P0 | M |
| B3 | ~~`cancel` на завершённом прогоне переводит его в `canceled`~~ **исправлено в `5d6844c`** | Генерация | — | — |
| B4 | `deck_revision` у проблем 0, у аудита 1 | Аудит | P0 | S |
| B5 | `repairable: true` у правил без обработчика | Аудит | P0 | S |
| B6 | Исправление `text.overflow` почти не работает при «applied» | Аудит | P0 | M |
| D1 | Заполнить Design DNA | ДНК шаблона | P1 | L |
| D2 | Результат repair по каждой проблеме + стабильные id | Аудит | P1 | M |
| D3 | Метрики паспорта: `style_fidelity`, `usage`, `per_stage`, `numbers_*` | Паспорт, Варианты | P1 | M |
| D4 | ~~Слияние `devin/async-job-lifecycle`~~ **влито в `5d6844c`**; осталось `started_at`, `finished_at`, `stage` у варианта | Генерация | P1 | S |
| D5 | HTML-экспорт через API | Экспорт | P1 | S |
| D6 | PNG-превью слайдов и montage | Варианты, Аудит | P1 | S |
| D7 | Ручка «только план» и сборка по присланному плану | План | P1 | M |
| D8 | Единый каталог правил аудита и человеческое описание исправления | Аудит | P1 | M |
| D9 | Блок `features` в `/capabilities` | О системе, Экспорт | P1 | S |
| D10 | Данные прогона в списке проектов | Проекты | P2 | S |
| D11 | Данные оси различий вариантов (`rationale`, `axes`) | Варианты | P2 | S |
| Q1 | Шкала кеглей выводится неверно → 50 ложных `template.font_scale` | Аудит | P0 | M |
| Q2 | Автоисправление до показа: 124 проблемы на вариант против ~20 в макете | Аудит | P1 | L |
| Q3 | Заголовки слайдов — темы, а не выводы (детерминированный планировщик) | План | P2 | M |
| Q4 | bbox проблем выходят за пределы слайда | Аудит | P2 | S |
| C1 | Типизация ответов и контракта | Всё | P2 | S |

## 2. Баги (P0)

Все воспроизводятся на `5d6844c`, кроме отмеченных как исправленные.

### B1. 500 на фильтре `status=` после `dismiss`
```bash
# 1) создайте прогон (см. раздел 9), получите audit_id и любую issue_id
curl -s -X POST "$A/issues/$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$ISSUE_ID")/dismiss" \
  -H 'content-type: application/json' -d '{"reason":"Так задумано"}'
curl -s -o /dev/null -w '%{http_code}\n' "$A/audits/$AUDIT_ID/issues?status=open"        # ждём 200, сейчас 500
curl -s -o /dev/null -w '%{http_code}\n' "$A/audits/$AUDIT_ID/issues?status=dismissed"   # ждём 200, сейчас 500
```
Без `dismiss` те же запросы отвечают 200. Без параметра `status` после `dismiss` тоже 200.
**Готово:** оба запроса → 200, в ответе только проблемы нужного статуса.

### B2. После repair пропадают PDF и паспорт
После `POST /audits/{id}/repairs` в варианте остаётся только PPTX новой ревизии. Запросы на PDF и паспорт отвечают 501:
```bash
curl -s -X POST "$A/variants/$VARIANT_ID/exports" -H 'content-type: application/json' -d '{"formats":["pdf"]}'
# сейчас: {"error":{"code":"not_implemented","message":"export format pdf is not produced by the pipeline for this variant"}}
```
В макете после исправления показывается слайд новой ревизии, а паспорт описывает именно её.
**Готово:** после repair `POST /variants/{id}/exports {"formats":["pptx","pdf","quality_passport"]}` → 202, а в
`GET /exports/{id}` артефакты относятся к `deck_revision` ревизии после repair (`deck_revision: N`), у каждого есть
`sha256` и `size_bytes`. Рендер PDF после repair можно запускать лениво по запросу экспорта.

### B3. `cancel` на завершённом прогоне — исправлено
В `5d6844c` для `completed`, `failed`, `canceled` отвечает `409 state_conflict`. Фронт это обрабатывает.

### B4. Ревизия у проблем не совпадает с ревизией аудита
Сразу после генерации `AuditRun.deck_revision = 1`, а у каждой проблемы `deck_revision = 0`.
**Готово:** у проблем ревизия совпадает с аудитом (`1`) и растёт после repair.

### B5. `repairable: true` у правил без обработчика
Проблемы `template.font_scale`, `text.font_floor`, `density.*`, `chart.metadata`, `template.layout_origin`,
`layout.unintended_overlap`, `integrity.package` помечены `repairable: true`, но в `repair/planner.py` для них нет обработчика: выбор такой
проблемы даёт `unresolved`, число проблем не меняется.
**Готово:** `repairable = true` только если планировщик умеет чинить это правило. Или, наоборот, реализуйте
обработчики: тогда флаг остаётся как есть.

### B6. `text.overflow`: «применено», но проблемы остаются
Выбрано 5 проблем `text.overflow` → job: `applied: 6, skipped: 4, failed: 0`. Проблем этого правила было 29,
стало 28. То есть отчёт о применённых действиях не соответствует результату.
**Готово:** после repair число проблем правила падает на число реально исправленных; в job `applied` считает
только исправленное, остальное — `failed` или `skipped` с причиной (см. D2).

Эффективность repair на `VK Tech шаблон.pptx`, вариант `balanced`, до 5 проблем на правило:

| Правило | Выбрано | Было → стало | Ответ job |
|---|---|---|---|
| `template.color_palette` | 4 | 4 → 0 | applied 4 |
| `image.aspect_ratio` | 5 | 10 → 5 | applied 5 |
| `accessibility.contrast` | 5 | 21 → 16 | applied 5 |
| `text.overflow` | 5 | 29 → 28 | applied 6, skipped 4 |
| `template.font_scale` | 5 | 50 → 50 | unresolved 5 |
| `text.font_floor` | 5 | 8 → 8 | unresolved 5 |

## 3. Данные для экранов, как в макетах (P1)

### D1. Заполнить Design DNA — главный пробел
Экран «ДНК шаблона» — самый важный для жюри: он показывает, что система «поняла» незнакомый шаблон. Сейчас
`GET /templates/{id}/design-dna` возвращает почти пустую структуру; фронт строит палитру и шрифты из
`latest_analysis.package_inventory`, а остальные блоки показывает как «нет данных».

Что сейчас пусто в реальном ответе (VK Tech, 54 слайда, 39 макетов):

| Поле | Сейчас | Нужно | Что рисует фронт |
|---|---|---|---|
| `declared.layouts[*]` | `name: "unresolved"`, `type: "unresolved"`, `placeholders: []` | имя макета, тип (`title`, `content`, `section`, `blank`, …), плейсхолдеры с `type`, `idx` и `bbox` | «Макеты»: чертежи плейсхолдеров |
| `declared.masters[*].layout_parts`, `.placeholders` | `[]` | какие макеты принадлежат мастеру | «Мастер → макеты → слайды» |
| `observed.font_sizes` | `[]` | `{size_pt, frequency, roles[]}` | «Шкала кеглей» |
| `observed.spacing` | все `null` | `common_margins_emu`, `common_gaps_emu`, `alignment_lines_x/y` | «Сетка и поля» |
| `observed.colors`, `observed.fonts[*].contexts` | цвета `[]`, `contexts: null` | цвета с частотой, контекст шрифта (заголовок/текст/подпись) | сейчас цвета берём из `package_inventory.observed_colors`; `observed.colors` и `contexts` пока не читаем, но заполните их для полноты |
| `observed.backgrounds` | `null` | `{kind, value, frequency}` | пока не показываем |
| `anchors` | `[]` | логотип, колонтитул, номер: `{kind, bbox, slide_coverage}` | «Якоря» |
| `slide_roles` | `[]` | `{role, slide_ids, confidence, evidence}` | «Роли слайдов» |
| `capacities` | всё `null` | `max_title_chars`, `max_bullets`, `occupancy_range`, … | пока не показываем (нужны для будущей проверки плотности) |
| `unsupported_features` | `[]` | `{feature, location, strategy, disclosure}` (SmartArt, видео, анимации, невстроенные шрифты) | «Что система не умеет» |

Единицы: `bbox` у плейсхолдеров и якорей — доли слайда `[0, 1]` (как в `AuditIssue.bbox`); отступы — EMU, как в
`schemas/design-dna.schema.json`. Роли: `title`, `section`, `toc`, `content`, `contact`, `closing`, `blank`.

Пример фрагмента ответа (значения VK Tech):
```json
{
  "observed": {
    "font_sizes": [{"size_pt": 12, "frequency": 92, "roles": ["body"]}, {"size_pt": 9, "frequency": 106, "roles": ["caption"]}],
    "spacing": {"common_margins_emu": [503000, 731520], "alignment_lines_x": [503000, 3657600]},
    "backgrounds": [{"kind": "solid", "value": "FAFCFF", "frequency": 40}]
  },
  "anchors": [{"kind": "logo", "bbox": {"x": 0.88, "y": 0.06, "w": 0.09, "h": 0.05}, "slide_coverage": 0.94}],
  "slide_roles": [{"role": "title", "slide_ids": ["slide-1"], "confidence": 0.97, "evidence": "макет-титул, крупный заголовок"}],
  "unsupported_features": [{"feature": "smartart", "location": "slide 12", "strategy": "rasterize", "disclosure": "растрируется, в отчёте"}]
}
```
Также полезны (необязательно): `conflicts[]` — `{kind: "font"|"color", detail, resolution}` и `confidence` по группам
(`palette`, `fonts`, `sizes`, `grid`, `anchors`, `layouts`, `roles`) со значением 0–1. Сейчас фронт вычисляет конфликты
сам, сравнивая заявленное и фактическое; своё «решение» по конфликту (например, «основной шрифт — Play») может
дать только бэкенд.
**Готово:** на `VK Tech шаблон.pptx` в ответе нет `"unresolved"`; `font_sizes`, `anchors`, `slide_roles` непустые;
на `synthetic_unseen_sparse.pptx` (нет нормальных макетов) поля либо заполнены эвристикой, либо честно пусты.

### D2. Результат repair по каждой проблеме и стабильные id
Сейчас `POST /audits/{id}/repairs` возвращает `{job_id, audit_id, deck_revision}`, а job — только счётчики строками
(`"applied": "3"`). После repair список проблем заменяется новым аудитом с **новыми id**, поэтому фронту приходится
вычислять журнал самому по сигнатуре `rule_code + slide_index + shape_ids`.

Нужно:
1. В результате job — массив по выбранным проблемам:
```json
{"outcomes": [
  {"issue_id": "…", "status": "fixed", "action": "map_color", "summary": "Цвет #798492 → accent1 #0077FF"},
  {"issue_id": "…", "status": "failed", "action": "shorten_text", "reason": "Текст остался длиннее рамки"},
  {"issue_id": "…", "status": "skipped", "reason": "Нет обработчика для template.font_scale"}
]}
```
2. Стабильный идентификатор проблемы между ревизиями: `fingerprint` (хэш `rule_code + slide_index + shape_ids`)
   рядом с `id`, чтобы связывать до и после.
3. Счётчики в job — числами, а не строками (см. C1).
4. (Желательно) сухой прогон: `POST /audits/{id}/repairs?dry_run=true` → те же `outcomes` без применения. В макете кнопка
   «Что будет сделано» показывается до нажатия «Исправить».
**Готово:** после repair для каждого выбранного `issue_id` есть исход; сумма исходов равна числу выбранных.

### D3. Метрики паспорта
Сейчас паспорт содержит `validity`, `editability`, `readability` (частично), `timings.total_seconds` и
`content_support.supported_claims`. В макете есть блоки, для которых данных нет:

| Блок макета | Поле паспорта | Сейчас |
|---|---|---|
| «В стиле шаблона»: палитра, шрифты, макеты, якоря (0–1) | `metrics.style_fidelity.{palette_compliance, font_compliance, layout_origin_compliance, anchor_compliance}` | не заполняется |
| «Быстро»: время по этапам | `metrics.timings.per_stage[] = {stage, seconds, cached}` | только `total_seconds` |
| «Быстро»: токены и вызовы модели | `metrics.usage.{total_tokens, model_calls}` | не заполняется |
| «По источникам»: числа сверены | `metrics.content_support.{numbers_verified, numbers_failed, unsupported_claims}` | только `supported_claims` |
| «Читаемо»: заполненность | `metrics.readability.avg_occupancy` | не заполняется |
| «Происхождение»: промпты и модели | `provenance.prompt_versions`, `provenance.model_profiles` | пусто (LLM-путь не использован) |

Все имена уже есть в `schemas/quality-passport.schema.json`. Оценка соответствия шаблону дополнительно нужна в
`VariantSummary.metrics.style_fidelity` (одно число 0–1), чтобы карточки вариантов не открывали паспорт.
**Готово:** паспорт варианта содержит перечисленные поля; для вариантов без LLM `usage` равен нулям, а не `null`.

### D4. Асинхронная генерация — влита, осталась мелочь
В `5d6844c` (ADR-010) `POST /generations` отвечает `202` за ~0,04 с, варианты идут по очереди
`queued → running → completed`, `GET /generations/{id}` показывает статус каждого. Наш фронт работает с этим
без изменений. Осталось добавить в `VariantSummary`: `started_at`, `finished_at` и `stage`
(`content` | `plan` | `compose` | `audit` | `render` | `passport`) — тогда экран покажет время готовности каждого
варианта («Готово · 0:32») и текущий этап конвейера.
**Готово:** у варианта в `running` есть `started_at` и `stage`, у `completed` — `finished_at`.

### D5. HTML-экспорт
`render_html` есть, API отвечает 501. Требование ТЗ: HTML — разметкой, не скриншотами.
**Готово:** `POST /variants/{id}/exports {"formats":["html"]}` → 202, в `GET /exports/{id}` артефакт `format: "html"`
с `mime_type: "text/html"` (или zip с `index.html`) и ссылкой на скачивание.

### D6. PNG-превью слайдов
Сейчас `GET /slides/{id}/preview` всегда 404, `preview_artifact_id` и `montage_artifact_id` — `null`. Фронт рисует
превью из PDF через pdf.js, это работает, но браузер тратит время на загрузку всего PDF (300 КБ–2 МБ на вариант).
`render_slides_png` уже есть. **Готово:** `SlideInfo.preview_artifact_id` заполнен, `GET /slides/{id}/preview` → 200 `image/png`;
`VariantSummary.montage_artifact_id` — сетка слайдов одним файлом.

### D7. Ручка «только план» и сборка по присланному плану
Лучшая практика рынка (Gemini, SlidePoint): показать структуру до вёрстки и дать поправить. В макете это шаг «План».
Сейчас план строится внутри генерации, поэтому фронт показывает его после сборки (режим v1). Внутри бэка уже есть
`generate(deck_plan=...)` (ADR-009).

Нужно:
```
POST /projects/{id}/plans            {template_id, content_pack_id, brief, strategies:[…], provider_session_id?, use_llm?}
                                     → 200 {plan_id, plans:[{strategy, deck_plan}]}
POST /projects/{id}/generations      + поле deck_plan_id (или deck_plan) — собрать варианты по этому плану
```
**Готово:** план приходит до вёрстки за секунды; `POST /generations` с `deck_plan` использует присланный план без
повторного планирования (`planner` в `VariantSummary` отражает источник).

### D8. Каталог правил аудита и описание исправления
Фронт держит у себя словарь из 34 правил (названия по-русски, категории, что чинится). Он расходится с бэком при любом
изменении правил. Кроме того, `proposed_actions` — машинные токены (`shorten_text`, `map_color`), а в макете у каждой
проблемы есть человеческий блок «Что будет сделано» («Уменьшить кегль 18 → 14 pt»).

Нужно:
1. `GET /audit/rules` → `[{code, title_ru, category, deterministic, default_severity, repairable, fix_title_ru, threshold}]`.
   Категории: `brand`, `layout`, `text`, `density`, `integrity`, `meaning`.
2. В `AuditIssue` поле `fix_preview` — текст для пользователя (или `{action, description_ru, params}`), рассчитанный
   планировщиком для этой проблемы.
**Готово:** фронт может удалить свой словарь и брать названия и описания исправлений с бэка.

### D9. Блок `features` в `/capabilities`
Фронт определяет «есть» или «скоро» по ответу `/capabilities`. Реальный ответ сегодня:
`{parsers, exporters, audit_rules, schemas, skill}`. Мы читаем `exporters` (уже работает), но для остальных функций
нужны явные флаги. Добавьте блок и переводите значения в `true` по мере готовности — интерфейс переключится сам:
```json
{"features": {
  "html_export": false, "plan_only": false, "png_previews": false, "async_generation": false,
  "sse_progress": false, "contextual_audit": true, "pdf_after_repair": false,
  "repair_dry_run": false, "style_fidelity": false
}}
```
`contextual_audit` — `true`, если задан хотя бы один провайдер моделей или доступен серверный fallback.
**Готово:** ключи присутствуют; после включения флага соответствующая строка в панели «О системе» меняется на «есть».

### D10. Данные прогона в списке проектов (P2)
В макете строка проекта показывает статус и этап последнего прогона. `Project` не содержит информации о прогонах,
поэтому фронт хранит id прогонов в `localStorage` — это ломается при смене браузера.
**Нужно:** `Project.latest_run_id`, `latest_run_state`, `latest_run_stage` и `GET /projects/{id}/generations`.

### D11. Ось различий вариантов (P2)
В карточках вариантов макет показывает три полосы: «Текст», «Разнообразие макетов», «Визуализация» и фразу «для кого».
Названия и фразы мы держим у себя; числа `axes` (0–1) есть только в документации (`variant_spec`: fidelity, novelty,
text_density, chart_pref).
**Нужно:** `VariantSummary.axes = {text_density, layout_diversity, visualization}` и `rationale` (сейчас всегда `null`).

## 4. Качество результата (не контракт, но видно на экранах)

### Q1. Шкала кеглей выводится неверно (P0)
Правило `template.font_scale` даёт **50 из 124** проблем на вариант, и их сообщение показывает шкалу шаблона:
«вне шкалы шаблона (`[14.0, 18.0, 24.0]` pt, допуск ±10%)». При этом в исходных слайдах VK Tech явно заданные кегли (подсчёт `sz=` по `ppt/slides/*.xml`) такие:
12 pt — 188 раз, 9 pt — 124, 14 pt — 70, 16 pt — 56, 18 pt — 45, 10 pt — 25; 24 pt среди частых нет вовсе. Шкала
`[14, 18, 24]` не содержит самых частых размеров, поэтому родные слайды шаблона считаются нарушением. Правило должно
строиться из **фактически используемых** размеров с порогом частоты, а дробные размеры — следы автоподбора текста
(8.12 — 262 раза, 6.75 — 160, 14.06, 12.25, 8.48) — либо исключаться, либо округляться к ближайшей ступени.
**Готово:** на исходных слайдах VK Tech `template.font_scale` даёт 0–2 проблемы, а не десятки.

### Q2. Автоисправление до показа пользователю (P1)
Q&A организаторов и наш макет исходят из того, что безопасные проблемы сервис чинит сам и показывает отчёт «что
исправлено». Сейчас пользователь получает 74–124 проблемы на вариант (PEI 3, `native_text_ratio` 0.48), тогда как макет
показывает ~22. Самые дешёвые автоисправления по замеру выше — палитра, контраст, пропорции картинок. После них пользователю
остаётся выбор по сложным случаям.
**Готово:** конвейер выполняет безопасные исправления до сохранения ревизии 1 и фиксирует их в паспорте
(`fallbacks`/`auto_fixes`); в ревизии 1 нет проблем `template.color_palette`, `image.aspect_ratio` и
`accessibility.contrast`, которые чинятся.

### Q3. Заголовки слайдов — темы, а не выводы (P2)
Детерминированный планировщик даёт заголовки «Проблема», «Решение». Проверка `content.conclusion_title` требует вывод
(«Рынок растёт на 30% в год»). С LLM это решается; без него стоит хотя бы использовать `key_message` как заголовок.

### Q4. bbox проблем выходят за пределы слайда (P2)
Часть проблем имеет `bbox.y > 1` (например `y = 1.087`). Для `layout.out_of_bounds` это верно, для остальных правил
координаты лучше ограничивать `[0, 1]` или отдавать отдельным полем `clipped_bbox`. Фронт сейчас обрезает рамку сам.

## 5. Контракт и типы (P2)

### C1. Типизация
1. `Job.result_ids` — `dict[str, str]`; счётчики repair приходят строками. Сделайте типизированную модель результата
   (`RepairJobResult`: `applied`, `skipped`, `failed`, `unresolved`: `int`; `outcomes[]`).
2. Фильтр `status` — `Literal["open","selected","fixed","dismissed","unresolved"]` в OpenAPI, чтобы значение
   попадало в сгенерированные типы.
3. `limit` у списков ограничен 200, а `next_cursor` всегда `null`: реализуйте курсор или поднимите лимит. На больших
   шаблонах проблем может быть больше 200.
4. `deck_artifact_id` у варианта — единственный способ получить PPTX. Добавьте `pptx` в `ExportRecord` уже при
   генерации (с `sha256` и `size_bytes`), чтобы экран экспорта показывал размер и контрольную сумму сразу, а не после
   отдельного запроса.
5. `Accept-Ranges` и `ETag` на `GET /artifacts/{id}/download`: pdf.js быстрее показывает большие PDF по диапазонам.
6. Типизированные коды ошибок (`state_conflict`, `time_budget_exceeded`, `provider_unavailable`, …) фронт уже разбирает
   из конверта `{error:{code, message, stage, retryable}}`; сохраняйте их набор стабильным.

## 6. Что не нужно менять

Эти вещи работают и нужны фронту как есть: конверт ошибок; идемпотентность `POST /variants/{id}/audits`; формат
`AuditIssue` (`rule_code`, `severity`, `bbox` в долях слайда, `measured_value`, `threshold`, `evidence`, `confidence`,
`deterministic`, `repairable`); `GET /audits/{id}/issues` с текущими фильтрами (кроме B1); повторная проверка
внутри `POST /audits/{id}/repairs` (ревизия растёт, проблемы пересчитываются); проверка провайдера
`POST /provider-sessions/{id}/test`; токен не возвращается ни одним эндпоинтом.

## 7. Порядок работы, который даст максимум за минимум

1. **B1–B6 и Q1** (день): убирают всё, что мы вынуждены показывать как ошибки сервиса.
2. **D9, D5, D6** и хвост **D4** (день): переключают строки «скоро» на «есть» без изменений на фронте.
3. **D1** (основная работа): превращает экран «ДНК шаблона» в то, что показано в макете.
4. **D3, D2, D8** (день-два): доводят паспорт, журнал исправлений и карточки проблем.
5. **D7, Q2** (последними): план до вёрстки и меньше проблем на входе.

## 8. Что включится у нас само, а что потребует нашей доработки

| Ваша правка | У нас |
|---|---|
| B1–B6, Q1, Q4 | сработает сразу, без изменений |
| D1 (`font_sizes`, `spacing`, `anchors`, `slide_roles`, `declared.layouts`, `unsupported_features`) | блоки уже написаны и читают эти поля: заглушки «нет данных» исчезнут сами |
| D3 (`style_fidelity`, `usage`, `per_stage`, `numbers_*`) | паспорт и карточки вариантов читают эти поля: «скоро» исчезнет сама (кроме `style_fidelity` в карточке варианта, там нужна правка в 1 месте) |
| D4 (async) | **уже проверено на `5d6844c`**: трекер работает в обоих режимах; `started_at/finished_at` — правка в 1 месте |
| D5 (HTML) | включится по `features.html_export` или `exporters: [..., "html"]` |
| D9 (`features`) | строки панели «О системе» и кнопка HTML переключатся сами |
| D2 (`outcomes`, `fingerprint`) | нужна наша правка (~2 часа): сейчас журнал строится по сигнатуре |
| D6 (PNG) | нужна наша правка (~1 час): сейчас превью строятся из PDF |
| D7 (plan-only) | нужна наша правка (~полдня): экран «План» сейчас только читает |
| D8 (каталог правил) | нужна наша правка (~2 часа): убрать локальный словарь |
| D10, D11 | нужна наша правка (~1 час каждая) |

После каждой вашей правки запускайте `npm run e2e:live` — сценарий подтверждает, что ничего не сломано, а мы после
слияния обновим типы командой `npm run api:types:live`.

## 9. Приложение: воспроизведение прогона одним скриптом

```bash
A=http://localhost:8000/api/v1
PID=$(curl -s -X POST $A/projects -H 'content-type: application/json' -d '{"name":"probe"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
TID=$(curl -s -X POST $A/projects/$PID/templates -F "file=@dop-data/Датасет/VK Tech шаблон.pptx;filename=t.pptx" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X POST $A/templates/$TID/analyze -H 'content-type: application/json' -d '{}' >/dev/null
CP=$(curl -s -X POST $A/projects/$PID/content-packs -F "files=@tests/fixtures/content/deckdna_pitch_rich.md" -F 'brief={"language":"ru"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["content_pack"]["id"])')
curl -s -X POST $A/projects/$PID/generations -H 'content-type: application/json' \
  -d "{\"template_id\":\"$TID\",\"content_pack_id\":\"$CP\",\"brief\":{\"purpose\":\"product\",\"audience\":\"руководство\",\"language\":\"ru\",\"target_slide_count\":12},\"variants\":[{\"strategy\":\"faithful\"},{\"strategy\":\"balanced\"},{\"strategy\":\"visual\"}]}"
```
Ответ содержит `generation_id` и `variant_ids`. Дальше: `POST $A/variants/{id}/audits` → `audit_id`, затем `GET $A/audits/{id}/issues?limit=200`.

## 10. Контакты и артефакты

- Макеты (HTML-прототип): `.claude/design/claude-design-v1/DeckDNA.dc.html` в нашем репозитории.
- Записанные ответы вашего API, по которым идут наши тесты: `src/shared/api/mocks/fixtures/`.
- Разбор расхождений макета и бэка: `.claude/docs/15-design-v1-review.md`.
- Ваш срез, которым пользуется наш облачный агент: `.claude/backend-snapshot/`.
