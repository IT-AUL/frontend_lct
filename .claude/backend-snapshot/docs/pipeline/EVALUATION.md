# Evaluation and Benchmark Harness

Owner: Agent 3 + Agent 4 (runner/CLI).

> **Implementation status (срез по репозиторию на сентябрь 2026):**
> реализован `evaluation/quality_passport.py:assemble_quality_passport` —
> сборка QualityPassport из реальных измерений (PEI, audit_deck,
> compose_report); в API паспорт — артефакт `quality-passport.json`
> варианта (скачивается через `/artifacts/{id}/download`, формат
> `quality_passport` принимается в `/exports`); `deckdna benchmark` — реальный
> прогон по фикстурам. Не реализованы: LLM/VLM-замеры, QuizBank/
> numbers_verified, метрики вариантности, human-eval протокол, CI для
> benchmark-отчётов. Поля помечены ✅ (реально считаются) /
> ⏳ (специфицированы, кода нет).

## 1. Goals

Prove — not claim — template adaptation, content fidelity, editability and speed. Every number on a pitch slide must come from this harness.

## 2. Benchmark suites

```text
organizer:    3 supplied templates × canonical content × 3 variants = 9 decks
unseen:       ≥2 public templates + synthetic edge cases × same content
edge:         multi-master, non-16:9, sparse template (masters only),
              dense template, missing fonts, unsupported parts
baselines:    single-layout filler, image-only deck, direct-LLM PPTX
ablations:    no DesignDNA, no visual audit, no repair, no EvidenceGraph
```

Фактический срез: organizer suite ✅ (`deckdna benchmark` по трём
органайзер-шаблонам), unseen — synthetic_unseen.pptx ✅ (один
синтетический 4-й шаблон, не organizer). Baselines/ablations/edge —
⏳ не собраны.

## 3. Metrics (separate dimensions, never one opaque score)

### Validity
- ✅ `opens_cleanly` — пакет открылся как OPC zip (из PEI).
- ⏳ `ooxml_errors`, `round_trip_ok` — OOXML-валидатора и round-trip
  теста нет.

### Template fidelity
- ⏳ palette compliance rate; font compliance rate; typography-scale fit;
  anchor preservation; layout-origin rate — весь блок `style_fidelity`
  в паспорте = **null** (нет DesignDNA-замера на выходе).
- ⏳ exemplar-similarity; no-logo attribution test.

### Content fidelity
- ✅ `content_support.supported_claims` / `unsupported_claims` —
  **грубый прокси**, не support-граф: `runs_replaced` vs
  `runs_skipped` + `dropped_units` из отчёта компиляции (контент
  запрошен планом, но не влез в слоты или тип юнита не компонуется —
  table/chart/image drop'ы честно складываются в unsupported).
- ✅ `fallbacks` — disclosure по каждому dropped-unit kind
  (strategy="drop") + агрегированная запись по остаточным
  `integrity.placeholder_text` (strategy="retain"; в unsupported_claims
  НЕ складываются — двойной счёт со runs_skipped непроверяем).
- ⏳ `% numbers exactly matching EvidenceGraph`, `% claims with support
  edge`, coverage, VLM contradiction check — EvidenceGraph и
  `numbers_verified`/QuizBank не существуют.

### Readability
- ✅ `overflow_count` — количество issues `text.overflow` из audit_deck.
- ⏳ contrast failures; occupancy distribution; min font size; bullets
  stats — правила контраста/occupancy не написаны (минимальный кегль и
  буллеты частично видны как issues, но в метрики не собраны).

### Editability
- ✅ `pei_level` — `pptx/validation/pei.assess_pptx` (рубрика ниже).
- ✅ `raster_only_slides` — кол-во issues `editability.raster_only`.
- ✅ `native_text_ratio` — text_shapes / (text+vector+pictures) по PEI.
- ⏳ `preserved_unsupported_objects` — компиляция v0 не трекает.

PEI rubric (implementation: `backend/deckdna/pptx/validation/pei.py`,
tests `tests/pptx/test_pei.py`):
- L0 — package unopenable or every slide raster-only;
- L1 — some native editable text exists;
- L2 — text AND vector shapes native;
- L3 — all primary elements native incl. groups; zero raster-only slides;
- L4 — L3 + native tables/charts;
- L5 — L4 + semantic structure: placeholders bound to template layouts.

Each gate maps to a measured package fact (OPC openability, per-slide
shape census `p:sp`/`p:pic`/`p:grpSp`/`a:tbl`/`c:chart`, placeholder
usage, layout rels) — the same facts export validation collects, so the
reported level is reproducible and not model-judged.

### Variants
- ⏳ pairwise structural distance; perceptual distance; evidence-set
  equality — не считаются (текущий пайплайн — один вариант per run).

### Process
- ✅ `timings.total_seconds` — замеренное время прогона pipeline.
- ⏳ per-stage times в паспорт не собираются; tokens/model calls/cost —
  `usage` = null (LLM-звонков в пайплайне v0 нет).
- ✅ `issues_summary` — audit issues по severity + unresolved;
  `exports` — sha256/size/format каждого артефакта вывода;
  `provenance.pipeline_version`, `inputs.brief_hash`/`content_pack_id`.

### Human evaluation
- ⏳ A/B pairwise preference vs baselines, blind template attribution,
  SUS-like usability — протокол не проводился.

## 4. Harness interface

```bash
deckdna benchmark --suite organizer --out artifacts/benchmarks/<ts>/
```

Outputs per run: QualityPassport JSONs; suite-level `report.json` +
`report.md` + `raw.csv` (проверено на organizer suite).
Environment disclosure (OS, LibreOffice version, provider, model IDs,
commit hash, config hashes) — ⏳ частично: `provenance` несёт
`pipeline_version`; model/config хэши — пустые (контрактные поля есть,
заполнение — не реализовано).

## 5. Statistical reporting

- For per-deck metrics: mean ± CI across seeds (≥2 seeds for model-dependent stages when time allows; else disclose single-run).
- Never average away failures: report failure rate separately.
- Failed runs are included in the report as failures, not omitted.

## 6. Acceptance tests

Реально зелёные:
- `benchmark --suite organizer` — прогон по фикстурам с паспортами ✅;
- OR-013 подтверждён: 2–15с на колоду против бюджета 300с;
- `tests/pptx/test_pei.py` — PEI-рубрика; e2e API-тесты скачивают
  `quality-passport.json` и проверяют его содержимое.

Плановые:
- Hardcode scan: no fixture filename, layout index, color, or font in pipeline paths (CI grep + config isolation);
- Counterfactual: swapping DesignDNA between two templates changes outputs measurably;
- Ablations degrade corresponding metric dimension.
