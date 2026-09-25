# DeckDNA Architecture

> **Implementation status** — this document is the target architecture (Phase 0 spec).
> The current build is a **synchronous, single-process** system: no queue,
> no durable job store. What runs today, by module:
>
> - `generation/pipeline.py` — `generate()`: `parse_file → plan_deck →
>   generate_deck → audit_deck → render_pdf → assemble_quality_passport`,
>   **one variant per run, differentiated by `strategy`** (OR-007:
>   faithful / balanced / visual produce bitwise-different decks —
>   faithful drops agenda/recap slides, visual reranks the exemplar
>   pool by visual richness and caps body text). Three variants run
>   serially via `POST /generations` (1–3 `VariantRequest`s),
>   `deckdna benchmark --variants`, or repeated `generate --strategy`.
>   Artefact dir with `deck.pptx` / `deck.pdf` / `quality-passport.json`.
> - `template/autopsy.py` — package census, layout usage, declared vs
>   observed fonts and palette (`deckdna inspect-template`).
> - `ingestion/content_parsers.py` — `.json`/`.md`/`.txt`/`.docx`/
>   `.pdf`/`.xlsx` → `ContentPack` (`deckdna ingest`), incl. tables,
>   chart/diagram code fences and images. `planning/evidence.py` —
>   `build_evidence_graph` implemented (claims/numbers provenance).
> - `planning/story_director.py` — deterministic `plan_deck` (no LLM calls);
>   `strategy` changes the plan (faithful skips agenda/recap). Optional
>   `plan_deck_llm` path exists behind `gateway` (LLM planning + rerank —
>   roadmap-quality, deterministic fallback).
> - `pptx/composing/` — exemplar-per-slide clone, txBody slot fill with
>   shrink-to-fit, card/group duplication for item cardinality;
>   `table_fill`/`chart_fill`/`image_fill`/`diagram_fill` fill native
>   tables/charts/images/SmartArt-like grouped diagrams from content
>   units; `add_table`/`add_picture` create fallbacks; shared chart
>   and image media parts are unshared per slide
>   (`unshare_chart_parts`/`unshare_image_parts`); capability-
>   aware exemplar selection (`slide_capabilities`) prefers slides
>   that actually carry `a:tbl`/`c:chart`/`a:blip`.
> - `audit/basic.py` — 24 deterministic rules (`text.overflow`,
>   `integrity.*`, `layout.*`, `density.*`, `template.*`,
>   `accessibility.contrast`, `text.font_floor`, `chart.metadata` —
>   full registry in `docs/AUDIT.md`), plus `integrity.package` as a
>   blocker pre-check; `audit/contextual.py` — the VLM layer is live:
>   `run_contextual_audit()` runs the 10 official checks per slide
>   render via `gateway.vision_json`, wired into `generate --llm` and
>   `POST /generations {"use_llm": true}` (MockProvider in tests; no
>   real VK endpoint yet).
> - `repair/planner.py` + `repair/apply.py` — deterministic issue→action
>   mapping for 12 rule_codes; executors exist for `resize_shape`,
>   `recrop_image`, `remove_placeholder`, `merge_slide` (real `sldIdLst`
>   + rels surgery), `move_shape`, `shorten_text`, `map_font`,
>   `map_color` (`deckdna repair` is
>   live); `native_rebuild` and other action types return
>   `not_implemented` honestly; unmapped rules get an explicit
>   «нет маппинга» note in the plan report.
> - `pptx/exporting/render.py` — `render_pdf`, `render_slides_png`,
>   `render_html` (hand-built `index.html` + `slide-*.png` assets; the
>   `soffice --convert-to html` base64 path was rejected as fragile —
>   libxml2 text-node limit).
> - `evaluation/quality_passport.py` — honest metric assembly per run.
> - `api/app.py` — FastAPI contract layer over in-memory stores
>   (provider-sessions, projects, generations, audits, repairs) plus
>   `GET /api/v1/skill/manifest` serving `skill/manifest.yaml`.
> - Verification: `deckdna benchmark` (3 organizer fixtures vs the 5-min
>   budget), `scripts/full_stack_regression.py` +
>   `tests/regression/test_full_stack.py` (4 templates incl. the synthetic
>   unseen one through generate→repair→export), golden audit counts.
>
> Still planned, not implemented: the full scene graph / Design DNA
> synthesis, from-scratch chart creation, real `dgm` SmartArt (the
> baseline is SmartArt-like grouped shapes), LLM top-k candidate
> reranking, shared image media-part unsharing, and
> PostgreSQL/Redis-backed durable jobs (`compose.yaml` wires the
> services, but the API and worker are not yet backed by them).
> Sections below describe the **target** unless a section says
> otherwise — in particular §3 (PostgreSQL/Redis/Worker containers), §6
> (parallel-variant DAG), §7 (durable job state machine), §10
> (variant architecture — deterministic differentiation exists, LLM
> rerank is target), §13–14 (persistence/secret leases) are roadmap,
> not current behaviour.

## 1. Architecture goals

- Runtime adaptation to an arbitrary unseen PPTX/POTX.
- Clear boundaries between deterministic document processing and probabilistic model reasoning.
- Relationship-safe editable PPTX output.
- Three variants and integrated audit/repair; TZ requires ≤5 min per deck, internal target ≤5 min for the whole 3-variant run.
- Provider-neutral, observable, resumable, config-driven execution.
- Portable skill contract suitable for corporate agent platforms.

## 2. System context

> **Status:** roadmap — the current build replaces the
> Orchestrator/Worker/Redis/PostgreSQL path with a synchronous,
> single-process flow: `CLI → deckdna package` and
> `FastAPI → in-memory STORE → pipeline`. The compose stack boots all
> containers (verified), but Postgres/Redis are wired, not used.

```text
User / Corporate Agent
        |
   CLI / React UI
        |
     FastAPI
        |
  Job Orchestrator ---- PostgreSQL
        |                   |
       Redis          durable entities/events
        |
      Worker
   /      |       \
PPTX   Model      Render
Core   Gateway    Toolchain
 |        |       LibreOffice/Poppler
Artifact Store
```

External systems are optional model endpoints and open asset providers. Local files remain in the artifact workspace.

## 3. Process containers

> **Status:** partial — `api` and `frontend` containers exist and serve
> real traffic (in-memory store; `worker` is a stub loop pending the
> queue). PostgreSQL/Redis containers run in compose but store nothing
> yet. The descriptions below are the target roles.

### API

- Owns HTTP contracts, validation, provider-session leases, idempotency, job creation, SSE, and artifact downloads.
- Does not execute long document/model operations.

### Worker

- Executes versioned pipeline stages.
- Reads/writes artifacts through `ArtifactStore`.
- Resolves provider token only immediately before a model call.
- Writes durable `JobEvent` rows and stage results.

### Frontend

- React/TypeScript thin client.
- No domain decisions; renders API state and issues.
- Generated OpenAPI client is the only network layer.

### PostgreSQL

- Durable projects, assets, analyses, plans, jobs, events, issues, repair selections, exports, version metadata.
- Tokens are forbidden.

### Redis

- Worker broker.
- Short-lived provider secret leases and non-durable pub/sub acceleration only.

### Artifact store

- Interface supporting local filesystem in v1 and S3-compatible storage later.
- Immutable content-addressed originals/intermediates plus mutable logical manifests.

## 4. Logical layers

> **Status:** implemented as module layout — `contracts/` is free of
> FastAPI/SQLAlchemy/PPTX imports; the AI layer exists as provider
> adapters plus the contextual-audit consumer (`audit/contextual.py`
> calls `gateway.vision_json` when `use_llm` is set). `Application
> layer` jobs/orchestration is currently just `pipeline.generate()`
> and the in-memory store.

```text
Interface layer       API, CLI, UI
Application layer     jobs, orchestration, stage handlers
Domain layer          entities, value objects, invariants
AI layer              provider adapters, prompts, planners, contextual judges
Document layer        OPC/PPTX parse, clone, compose, validate, export
Evaluation layer      deterministic audit, contextual audit, metrics, passport
Infrastructure layer  DB, Redis, files, subprocess sandbox, telemetry
```

Dependency direction points inward. Domain/contracts import no FastAPI, SQLAlchemy, Redis, model SDK, or PPTX library.

## 5. Deterministic vs probabilistic boundary

> **Status:** implemented, mostly one-sided — everything listed under
> "deterministic" is what the current pipeline actually does.
> On the probabilistic side, the contextual VLM audit is live behind
> `generate --llm` / `use_llm` (see MODELS.md); LLM planning/rerank
> paths exist behind `gateway` with deterministic fallback. The rest
> of the probabilistic column remains roadmap.

### Deterministic responsibilities

- OPC package graph and relationship integrity;
- geometry, inheritance, themes, colors and fonts;
- structural scene graph;
- capacity prefilters;
- constraints and text measurements;
- native object emission;
- package validation, rendering and deterministic audit;
- Evidence Graph numeric/source invariants;
- artifact lineage, state and metrics.

### Probabilistic responsibilities

- ambiguous semantic shape roles;
- functional slide labels;
- design-rule synthesis from evidence;
- storyline and wording;
- top-k candidate reranking;
- contextual visual/content audit;
- proposed repair selection, expressed as typed actions.

Models never receive authority to write raw OOXML, file paths, SQL, or shell commands.

## 6. Pipeline DAG

> **Status:** partial — the implemented DAG is linear per run:
> `parse_file → plan_deck → generate_deck → audit_deck → render_pdf →
> assemble_quality_passport` (one variant, strategy-differentiated;
> three variants run serially, not in parallel). The contextual audit
> branch is real (`audit/contextual.py`, optional `use_llm` stage);
> the parallel variant fan-out below remains target.

```text
Template upload
  -> package_validate
  -> package_parse
  -> template_render
  -> scene_graph
  -> declared_tokens
  -> observed_tokens
  -> semantic_roles
  -> exemplar_cluster
  -> design_dna

Content upload
  -> content_parse
  -> asset_inventory
  -> evidence_graph

Design DNA + Evidence Graph + Brief
  -> storyline
  -> base_deck_plan
  -> three_variant_specs
  -> [variant pipeline ×3 in parallel]
       -> candidate_retrieval
       -> layout_rerank
       -> native_compose
       -> structural_validate
       -> render
       -> deterministic_audit
       -> contextual_audit
  -> awaiting_user
  -> selected_repair
  -> incremental_recompose/rerender/reaudit
  -> export_pptx_pdf_html
  -> quality_passport
```

Template analysis is cached by template SHA-256 + parser/role-model/prompt versions.

## 7. Job state machine

> **Status:** roadmap — API `Job` objects exist but complete
> synchronously in-request; there is no persisted transition log,
> compare-and-set, or attempt history yet.

```text
created
queued
analyzing_template
ingesting_content
planning
generating_variants
validating
rendering
auditing
awaiting_user
repairing
exporting
completed
failed
canceled
```

Rules:

- transitions are compare-and-set and persisted;
- every stage is idempotent;
- job events use monotonically increasing sequence numbers;
- retries create attempt records without overwriting previous evidence;
- user repair is a new child attempt, not mutation of historical results.

## 8. Template analysis architecture

> **Status:** partial — `autopsy.py` implements the OPC census,
> layout usage, declared theme palettes vs observed colors/fonts, and
> exemplar selection for cloning. The full scene graph and Design DNA
> rule synthesis below are roadmap; the API `design-dna` view is a
> forensics projection, not synthesized rules.

### OPC graph

Reads ZIP central directory, content types, package relationships, Office document relationships, and builds typed nodes/edges for every part. Unknown parts remain first-class opaque nodes.

### Scene graph

Each slide contains recursive elements with stable source IDs, parent/group transforms, normalized and EMU geometry, z-order, semantic category, text/image/data payload, inherited/resolved style, provenance and mutability.

### Design DNA

Declared and observed sections remain separate. Synthesized rules cite input elements, distributions and model evidence. Confidence must not hide disagreement, such as Arial in theme vs Play in actual slides.

### Exemplar library

Cluster slides by functional role, semantic group signature, element types, normalized geometry, palette and typography. A medoid source slide is retained for relationship-safe cloning.

## 9. Native generation architecture

> **Status:** partial — steps 1–6 and 9–10 are implemented (exemplar
> clone, slot fill, cardinality duplication, shrink-to-fit, native
> table/chart/image/diagram fill from content units, `add_table`/
> `add_picture` create fallbacks, unused-slide removal, package
> validation incl. `integrity.package` blocker). Step 7 (constraint
> solver for geometry/text fit) and from-scratch chart creation are
> roadmap.

Output starts as a copy of the template package. The compiler:

1. selects source exemplars/layouts;
2. clones slide XML and dependency graph;
3. maps SlidePlan slots to semantic groups;
4. replaces text/images preserving local style;
5. duplicates/removes groups for item cardinality;
6. adds native tables/charts/shapes/connectors;
7. solves geometry and text fit;
8. orders generated slides;
9. removes unused source slides from output;
10. validates relationships/content types/IDs and round-trips.

Unsupported source objects are preserved. If they cannot be safely moved or edited, they stay as immutable decoration; object-level raster fallback is disclosed.

## 10. Variant architecture

> **Status:** implemented (deterministic MVP) — the API accepts up to
> 3 variant requests and runs them serially; `strategy` now changes
> behaviour (OR-007): faithful skips agenda/recap slides, visual
> reranks the exemplar pool by `visual_richness` and caps body texts
> (honest `dropped_units["text"]` accounting); custom = balanced.
> The three decks are bitwise-different (verified via sha256 on
> organizer templates). LLM top-k reranking of candidates is target.

All variants reference one immutable Evidence Graph and one base narrative objective.

- `faithful`: highest exemplar fidelity, conservative density and sequence.
- `balanced`: alternative compatible exemplars, balanced visuals and text.
- `visual`: diagram/chart emphasis and more aggressive grouping/order.

Variant distance is measured structurally and visually; content support and template compliance are hard constraints.

## 11. Audit/repair architecture

> **Status:** implemented — 24 deterministic rules enforced,
> `AuditIssue` → `RepairPlanner` → typed `RepairAction` → executors
> for `resize_shape`/`recrop_image`/`remove_placeholder`/`merge_slide`
> (real `sldIdLst` + rels surgery)/`move_shape`/`shorten_text`;
> `integrity.package` is a blocker pre-check. Contextual audit is
> implemented (`audit/contextual.py`, VLM via `gateway.vision_json`,
> wired into generate/API behind `use_llm`).

Deterministic audit operates on package/scene graph/render measurements. Contextual audit operates on slide images + source evidence with schema-constrained yes/no responses.

`AuditIssue` is the only UI-facing unit. `RepairPlanner` converts selected issues into an ordered list of permitted `RepairAction` values. The PPTX compiler executes actions; the model cannot bypass the action registry.

## 12. Export architecture

> **Status:** implemented — PPTX (native, relationship-safe), PDF via
> `soffice`, HTML viewer as `index.html` + PNG assets (no editability
> claim). Quality Passport is JSON only; the human-readable
> HTML/Markdown passport is roadmap.

- PPTX: compiler output, mandatory native objects.
- PDF: LibreOffice headless conversion; font diagnostics retained.
- HTML: self-contained presentation viewer with rendered slide assets, navigation, metadata and notes; no HTML editability claim.
- Quality Passport: JSON + human-readable HTML/Markdown.

## 13. Persistence and artifacts

> **Status:** roadmap — all state lives in-process (in-memory stores);
> artifact download by ID is already enforced by the API, but nothing
> survives a restart and no SHA-256 lineage store exists yet.

Database stores metadata and JSON contracts; large binaries stay in artifact storage. Every artifact has type, MIME, SHA-256, size, creating stage/version, parent IDs and relative storage key.

No absolute host paths are emitted into contracts. Artifact downloads are mediated by API IDs.

## 14. Provider/session security

> **Status:** roadmap — provider sessions exist as API entities with
> declared capabilities; tokens are not yet leased via Redis. The
> pipeline makes zero model calls by default; with `use_llm`/`--llm`
> it calls the configured gateway (mock_provider offline by default)
> for contextual audit and optional LLM planning.

Provider config excluding token may be stored on a project. Token is issued as a Redis secret lease with TTL. Jobs contain only lease ID. Worker resolves it on use; logs apply redaction to headers, URLs, request bodies and exceptions. Completion/cancel deletes lease. Environment variables support judge/demo setup.

## 15. Failure model

> **Status:** implemented — `DeckDNAError` + `to_envelope()` carry
> code/message/stage/retryable/details through CLI and API; the code
> list below is the live registry from `errors.py`.

Typed failures:

- `invalid_input`;
- `not_found`;
- `not_implemented`;
- `idempotency_conflict`;
- `unsupported_encrypted_template`;
- `package_corrupt`;
- `font_missing`;
- `render_failed`;
- `provider_unavailable`;
- `provider_capability_missing`;
- `structured_output_invalid`;
- `composition_failed`;
- `protected_slide`;
- `validation_failed`;
- `time_budget_exceeded`;
- `artifact_missing`;
- `internal_error`.

Each failure declares retryability, stage, safe message, diagnostic artifact and suggested action.

## 16. Performance budget

> **Status:** the official gate is implemented and verified —
> `deckdna benchmark --variants` runs all 3 organizer fixtures × 3
> strategies (gate run: 12 decks incl. the synthetic unseen fixture,
> all `ok`; current actuals ~1.9–7s per deck against the 300s budget).
> The per-stage budget split below is the target for the 3-variant run.

Official requirement: ≤5 min per generated deck. Internal target (stricter): three 10–15 slide variants in one 300s budget:

- input validation and cached template lookup: 5s;
- cold template analysis: target 45s;
- content ingestion/evidence: 25s;
- planning/variants: 25s;
- retrieval/composition in parallel: 90s;
- render/structural validation in parallel: 60s;
- audits in parallel: 45s;
- exports/passport: 30s;
- contingency: 20s.

Use bounded model calls, top-k reranking, concurrent variants, cached renders and incremental repair. Report actual environment and P50/P95.

## 17. Extension points

- model providers;
- asset search and image generation;
- content parsers;
- slide role classifiers;
- candidate scorers;
- audit rules;
- repair actions;
- artifact stores;
- richer HTML renderer;
- VK AI Space skill adapter.

## 18. Architecture decision records required

- ADR-001 monorepo and language boundaries;
- ADR-002 direct OOXML + high-level facade;
- ADR-003 exemplar-first strategy;
- ADR-004 PostgreSQL/Redis jobs;
- ADR-005 ephemeral provider secrets;
- ADR-006 HTML export fidelity scope;
- ADR-007 SmartArt-like grouped-shape baseline;
- ADR-008 contextual audit uncertainty policy.
