# Content Ingestion and Evidence Graph

Owner: Agent 3.

> **Implementation status (срез по репозиторию на сентябрь 2026):**
> реализованы парсеры `.json`/`.md`/`.txt`/`.docx`/`.pdf`/`.xlsx` в
> валидированный `ContentPack` (`ingestion/content_parsers.py::_PARSERS`)
> и `POST /api/v1/projects/{id}/content-packs` возвращает **реальный**
> распарсенный пак. `EvidenceGraph` строится детерминированно
> (`planning/evidence.py::build_evidence_graph`, см. §4). Парсер
> image-файлов и полная нормализация чисел (unit-инференция) — **не
> реализованы**. Таблицы ниже помечены ✅ (есть) / ⏳ (специфицировано,
> кода нет).

## 1. Goal

Normalize any supported office content package into a `ContentPack` plus `EvidenceGraph` that downstream stages can cite. Every claim and number used on a slide must trace to a source location.

Текущий срез: `ContentPack` + `EvidenceGraph` (детерминированный,
без LLM). `source_ref` у блоков прокидывается в узлы графа;
`GET /content-packs/{pack_id}/evidence-graph` отдаёт реальный граф.
Честная оговорка: `SlidePlan.evidence_ids` пока ссылаются на
id секций/блоков ContentPack, а не на узлы графа.

## 2. Supported inputs (v1)

| Format | Parser | Extracted | Status |
|---|---|---|---|
| TXT | direct read | одна секция, один paragraph-блок | ✅ `parse_txt` |
| Markdown | markdown-it AST (preset `default`) | заголовки → sections (+ heading_path в source_ref), параграфы/списки/цитаты/код/картинки → blocks, GFM-таблицы → `Table(headers, rows)` (числа — float, пустые ячейки — None; `units`/`title` не выводятся) | ✅ `parse_markdown` |
| JSON | schema-flexible normalizer | валидированный `ContentPack` 1-в-1 по схеме | ✅ `parse_json_content` (invalid JSON / несоответствие схеме → `invalid_input`) |
| PDF | pdfplumber | параграфы, pdfplumber-таблицы → `Table` + `table_ref` | ✅ `parse_pdf` |
| DOCX | python-docx (`iter_inner_content`) | `Heading N` стили → sections (+ heading_path), абзацы → blocks, `List *` стили/numPr → list-блоки, docx-таблицы → `Table` (первая строка — headers) | ✅ `parse_docx` |
| XLSX | openpyxl | листы → sections/`Table` с типизированными числами | ✅ `parse_xlsx` |
| PNG/JPEG/SVG | PIL + header parse | — | ⏳ не реализован |

Диспетчер `parse_file(path)` выбирает парсер по суффиксу
(`.json/.md/.markdown/.txt` — text-режим, `.docx/.pdf/.xlsx` — binary);
неизвестный суффикс → typed `invalid_input`
со списком поддерживаемых. `POST /content-packs` принимает мульти-файлы,
парсит **первый файл с поддерживаемым суффиксом**, остальные сохраняет
артефактами; без ни одного поддерживаемого → 422 `invalid_input`.
Детерминированный id пака — `pack-<sha8>` от содержимого; `language`
— грубая эвристика (кириллица → `ru`, иначе `en`) или override из brief.

`GET /capabilities` отдаёт список parsers, производный от `_PARSERS`
(синхронизировано автоматически).

## 3. Normalization rules

Реализовано:
- `heading_path` сохраняется в `source_ref` каждого markdown-блока ✅
- `source_ref` (artifact_id + heading_path) у каждого блока и каждой таблицы ✅
- GFM-таблицы → `Table(headers, rows)`; чисто-числовые ячейки → float, пустые → None ✅
- language detection per document (эвристика) ✅
- `ContentPack` валидируется контрактом; кривой JSON → `invalid_input` ✅

Специфицировано, не реализовано:
- page/sheet/range/char-span в source_ref (пока только artifact+heading_path);
- numbers (raw string / normalized / unit) — в таблицах числа уже float, но без unit-инференции и вне-табличных чисел;
- docx quote/code-блоки, `Title`-стиль, локализованные имена стилей (мэтчится `Heading N`/`List *`) — docx-картинки уже извлекаются (`artifact_id` → `word/media/…`);
- table `title`/`units` (перенос таблиц в слайды `a:tbl` реализован — `pptx/composing/table_fill.py`);
- image extraction/artifact store/dedupe/EXIF;
- mixed-language warning.

## 4. EvidenceGraph construction — реализовано (детерминированно)

`planning/evidence.py::build_evidence_graph(pack)` — без LLM: каждый
content-блок (paragraph/quote/note/code и каждый item списка) и каждая
непустая ячейка таблицы → узел (claim/number), секции и таблицы —
узлы-рамки (section/table), assets — visual-узлы; рёбра `belongs_to`;
id детерминированные позиционные; confidence=1.0 (verbatim-извлечение,
оценка достоверности не входит). Вызывается в `generate()` на стадии
planning и используется `plan_deck_llm` и contextual-аудитом
(evidence_excerpt). Остаётся roadmap: рёбра `supports`/`derived_from`/
`illustrates`/`contrasts` и `evidence_ids` → узлы графа (сейчас —
id секций/блоков пака).

## 5. Canonical synthetic fixture

Фактически в репо: `tests/fixtures/content/poc_article.md` (русская
статья с секциями — главный e2e вход), `sample_brief.md`,
`poc_deck_plan.json`. Каталога `canonical_product_pack/` нет — описанная
ниже сборка остаётся планом:

- `brief.md` — product description with sections;
- `metrics.xlsx` — ≥2 sheets with typed numbers and units;
- `report.pdf` — multi-page prose + one table;
- `notes.docx` — headings, lists;
- `data.json` — explicit sections/metrics;
- `assets/` — 3+ local images.

This fixture exercises every parser and produces a non-trivial EvidenceGraph. Replace for final claims once official pack arrives.

## 6. Provenance rules

- `ContentPack` фиксирует `schema_version`; версия парсера — константа
  `PARSER_VERSION = "content-ingestion/0.1.0"` в модуле (в контракт
  пака не сериализуется, версия покрыта на уровне pipeline provenance).
- Downstream SlidePlan `evidence_ids` must resolve in the referenced graph revision — ⏳ (граф строится, но evidence_ids пока ссылаются на id секций/блоков пака, не на узлы).
- Audit stage `content.source_support` uses these edges; unsupported numeric claim = blocker — ⏳ как deterministic-правило нет (реализован как contextual-код VLM-слоя); грубый прокси content_support считается в Quality Passport из runs_replaced/runs_skipped + dropped_units, см. EVALUATION.md).

## 7. Failure handling

Реализовано:
- Corrupt/invalid JSON, несоответствие схеме → `invalid_input` (422) ✅
- Неподдерживаемый суффикс → `invalid_input` со списком `supported` ✅
- Пак без поддерживаемых файлов (API) → `invalid_input` ✅

Специфицировано, не реализовано:
- scanned PDF → `ocr_required` warning;
- encoding issues → UTF-8 replace + warning;
- пустой пакет → `invalid_input` (пустой `.txt` даёт пустую секцию, не ошибку).

## 8. Acceptance tests

Реально зелёные:
- `tests/ingestion/test_content_parsers.py` — json/md/txt → ContentPack,
  включая GFM-таблицу → `Table` и сохранение контента вокруг неё;
- `tests/api/test_content_pack.py` — e2e через TestClient: реальные
  секции/язык/`source_ref`, multi-file выбор поддерживаемого файла,
  422 на неподдерживаемом, generate() работает на распарсенном паке.

Плановые:
- XLSX typed values, PDF/DOCX структуры — появятся вместе с парсерами;
- EvidenceGraph валидируется по схеме и инвариантам;
- детерминизм node IDs при повторном разборе.
