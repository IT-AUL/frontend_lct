# HTTP API Contract

Base path: `/api/v1`. JSON is UTF-8. Binary uploads use multipart. All timestamps UTC. The generated OpenAPI document is authoritative once implementation begins.

## 1. Cross-cutting rules

- Mutating requests accept `Idempotency-Key`.
- Responses include `X-Request-ID`.
- Long operations return `202` with a `job_id`.
- API never returns provider tokens.
- Pagination uses opaque cursor.
- Artifact downloads use authenticated-by-local-session opaque IDs, not filesystem paths.

Error envelope:

```json
{
  "error": {
    "code": "provider_unavailable",
    "message": "Safe user-facing message",
    "stage": "contextual_audit",
    "retryable": true,
    "request_id": "...",
    "details": {}
  }
}
```

## 2. Provider sessions

### `POST /provider-sessions`

Request:

```json
{
  "label": "Organizer router",
  "base_url": "https://example/v1",
  "api_token": "secret",
  "models": {
    "text": "model-id",
    "vision": "model-id",
    "embedding": null,
    "image": null
  },
  "capabilities": {
    "structured_output": true,
    "tool_calls": true,
    "image_input": true,
    "embeddings": false
  },
  "timeout_seconds": 90,
  "max_concurrency": 4,
  "ttl_seconds": 14400
}
```

`base_url` must be a plain `http(s)` URL — userinfo, query strings, fragments
and non-http(s) schemes are rejected with `422` (credentials belong in
`api_token`, never in the URL, which is published back to the client).

Response excludes token and returns session ID, expiry and declared capabilities. The token is lease-held server-side (in-memory store until Redis lands in Wave 2) and is never returned by any endpoint — including inside `422` error envelopes, where request `input`/`ctx` are stripped from validation details. Lease semantics:

- `ttl_seconds` is enforced lazily: any use of an expired session evicts it (token included) and answers `404 not_found "provider session expired"`;
- `project_id`, when supplied, binds the session to that project — use in another project answers `422 invalid_input`;
- `DELETE` revokes the lease immediately: the token is destroyed with the session record and reuse answers `404`.

### `POST /provider-sessions/{id}/test`

Performs minimal safe capability probes **against the live endpoint** using the session credentials — one real round-trip per declared capability: `structured_output` (minimal `json_schema` chat completion), `image_input` (same + a 1px PNG data URL), `embeddings` (one embed call). Probe statuses: `ok` — the call succeeded; `fail` — the endpoint rejected it (`detail` carries the typed error code, never secrets); `skip` — capability not declared by the client or not probeable (`tool_calls`).

### `DELETE /provider-sessions/{id}`

Revokes the lease immediately (see above).

Provider session creation rejects literal private, loopback, link-local,
multicast, reserved, unspecified and known metadata hostnames by default.
Trusted local deployments may set the server environment variable
`DECKDNA_PROVIDER_ALLOW_PRIVATE_NETWORKS=true` to use a loopback provider
stub. The API request rejects an `allow_private_networks` field; callers
cannot override the operator's network policy.

## 3. Projects

`GET /projects` is paginated (default `limit=50`, maximum 200), oldest projects
first. Follow `next_cursor` until null before assuming that a project is missing.
`latest_run_id` is present on its row regardless of which page contains it.

- `POST /projects`
- `GET /projects`
- `GET /projects/{id}`
- `PATCH /projects/{id}`
- `DELETE /projects/{id}`

Create fields: name, default language, target slide count.

`Project` also carries the latest run (`latest_run_id`, `latest_run_state`,
`latest_run_stage`, computed from the store) and `GET /projects/{id}/generations`
lists the project's runs newest first, so the UI does not depend on browser storage
(ADR-011).


### Session and autopilot (ADR-034 §8)

`GET /projects/{id}/session` returns a typed `AssistantSession`:

```json
{"step": 2, "completed_steps": [1], "skipped_steps": [],
 "artifacts": {"template_id": "tpl_...", "content_pack_id": "pack_...",
               "brandbook_id": null, "plan_id": null, "preview_id": null,
               "generation_id": null},
 "brief": {}, "assistant_note": "Покажу, что понял из ваших материалов.", "job_id": null}
```

Steps are integers 1–7 from the UX specification. Current artifacts determine the
step: accepted inputs → understanding, understood content → questions (or plan
when none), saved plan → style, preview → generation, completed run → editing.
`GET /understanding` records that the pack was viewed; `/answers` saves the complete
brief. Explicit `content_fill=shrink|expand` resolves the short-content question.
A new content-pack upload invalidates the old session's plan/preview/run selection;
creating or editing a plan also stops the session from selecting an older run.
`PlanSet.updated_at` is additive and records PATCH/actions; old snapshots fall back
to `created_at`. Preview records add `deck_plan_id`, `plan_digest`, `template_digest`
so changed plan content or brand priority cannot reuse stale preview exemplars.
Active autopilot returns step 6 and its `job_id`. Artifacts and minimal UI marks,
brief and journal survive the ADR-031 snapshot; provider secrets still do not.
On process restart, queued/running thread-pool jobs become `failed` with
`error.code=execution_interrupted` and a journal event. Saved artifacts remain
available; pressing autopilot again starts a fresh job from the saved inputs.
An interrupted generation also settles its unfinished variants.

`POST /projects/{id}/session/autopilot` returns **202**:

```json
{"from_step": 1, "use_llm": false}
```

Optional `provider_session_id` and nullable `use_llm` follow the generation model
policy. `from_step` is 1–7 (default 1); UI buttons use 1–5. Both a template and a
content pack are required (422 when absent); ownership and session lease are checked.
From steps 1–3 the content/answers are used to build a fresh plan; from 4 onward an
existing compatible plan is reused, including the author's edits. Missing artifacts
are built rather than assuming the caller's screen has completed them.

Response: `{job_id, events_url, assistant_note}`. It is **one** `kind=autopilot`
job from understanding through generation; another click during active work returns
the same job. Journal events have a single monotonic sequence:
`understanding.ready`, `insights.confirmed`, `questions.answered {answers, automatic}`,
`plan.slide`, `preview.ready`, `style.selected`, `generation.started`, existing
`stage.started`/`slide.ready`, and a terminal `job.completed` or `job.failed`.
Read the live journal through `GET /jobs/{job_id}/events?after=N`.
ADR-036 keeps this connection open until terminal; polling the job remains supported.

ADR-035: automatic defaults come from the content-sized `suggested_brief` and
the style recommendation. Autopilot does not select an audience, main message
or call to action from recommended chips and does not record them as human answers.
Only facts with `strength >= 0.7`, `kind=fact`, no implication and no pending
confirmation are auto-confirmed. The threshold and assistant text live in the
versioned `configs/assistant.default.yaml` (version 3). Implications and recommendations always
require a person. Confirmed insights remain locked on later model passes; numeric
validation includes single-digit values and negative signs. Short material defaults to shrink; unresolved `ask` cannot stop
the job. The shared plan and selected preview exemplars are passed to generation.
The autopilot builds one recommended variant; the regular `/generations` still
supports all three.

On completion `result_ids` contains `{plan_id, preview_id, generation_id,
deck_plan_id}`. The generation has the **same** `job_id`; no child jobs need polling.
For a failure inspect `error {code, message, stage}`; inputs and any finished
artifacts remain available. `/session` returns current IDs for reconnecting screens.

### MCP assistant tools (ADR-034 §9)

The manifest version is 0.3.0, with 15 tools (the existing nine are retained):

| Tool | REST operation |
|---|---|
| `understand_content` | `GET /content-packs/{id}/understanding`, optional model/session |
| `get_questions` | `GET /projects/{id}/questions` |
| `answer_questions` | `POST /projects/{id}/answers` |
| `confirm_insights` | `PATCH /content-packs/{id}/insights/{id}` for explicit IDs |
| `style_previews` | `POST /plans/{id}/style-previews` |
| `regenerate_slide` | `POST /variants/{id}/slides/{slide_id}/regenerate` |

The agent asks the person before confirming a recommendation. `confirm_insights`
validates the whole ID list before applying it. `style_previews` defaults to async;
`get_job` adds `style_preview` when the preview job completes. `plan_deck` and
`generate_variants` accept `key_message` and `call_to_action`; generation accepts
`preview_id`. With both `plan_id` and `preview_id`, MCP passes the common preview
plan inline to preserve the plan across selected styles. A preview from another
plan is rejected. Setup and the full chain: `docs/MCP_RU.md`.

## 4. Templates

### `POST /projects/{project_id}/templates`

Multipart `file`. Accept PPTX/POTX. Returns TemplateAsset.

ADR-031: the stored package is the prepared template. A `.potx` (main part
`presentationml.template.main+xml`, also macro/slideshow variants) is stored
with the `.pptx` main-part type; `package_type` and `filename` keep `potx`.
A template with fewer than 3 slides gets exemplar slides synthesized from its
own layouts (sample text in text placeholders, media placeholders removed), so
analysis, Design DNA and composition see the same package. `generate()`/CLI
apply the same preparation and report it as `template_synthesis`
(`original_slides`, `synthesized_slides`, `layouts_used`, or `null`).

### `POST /templates/{template_id}/analyze`

Body: provider session ID, optional analysis config version. Returns job.

### `GET /templates/{template_id}`

Metadata, validation, latest analysis.

### `GET /templates/{template_id}/design-dna`

Returns latest or requested revision. Everything is computed from the package
itself (`template/dna.py`) — layouts with typed placeholders (`bbox` in slide
fractions), master→layout ownership, theme palettes, the observed font-size scale
with roles, fonts/colors with contexts, margins/gaps/alignment lines, backgrounds,
anchors (logo/footer/page number/date with slide coverage), slide roles
(`title|section|toc|content|contact|closing|blank`, each with `confidence` and
`evidence`; `slide_ids` resolve against `GET /templates/{id}/slides`), capacities,
unsupported features and declared-vs-observed `conflicts`. No `"unresolved"`
markers; what cannot be computed stays empty. The response is `DesignDNA` plus the
optional `conflicts[]` and `confidence{}` (ADR-011).

### `GET /templates/{template_id}/slides`

Paginated exemplar/preview metadata; each slide carries its inferred `role`,
`title` and `mutability`.

## 5. Content packs

### `POST /projects/{project_id}/content-packs`

Multipart upload with one or more source files (up to 10) plus an optional JSON
brief. ADR-032: every file is parsed with its own `artifact_id` and the packs are
merged in file order — table/chart/diagram/image/section ids get a per-file prefix
(`f2-tbl-0`) and `table_ref`/`chart_ref`/`diagram_ref` blocks are rewritten with
them, so `source_ref` of each block points at its own file. An unsupported or
unreadable file rejects the whole request with `422 invalid_input` and nothing is
stored. Supported: `.json/.md/.txt/.docx/.pdf/.xlsx/.csv` and `.pptx/.potx` — an old
deck as content: slide → section (`source_ref.page` = slide number), native tables
and charts → `tables`/`charts`, pictures → `assets`, speaker notes → `note` blocks
with `source_ref.range = "speaker_notes"` (they go to the slide's speaker notes,
not onto the slide). The returned `content_pack.id` is a server-generated upload
ID scoped to the project. Source artifacts retain their full SHA-256 digest.

Data files (ADR-033): `.csv`, tabular `.json` (array of records, `{columns, data}`,
`{"column": [...]}`; a JSON that matches the content-pack schema is still a pack) and
every `.xlsx` sheet become `content_pack.datasets[]` (`{id, title, columns:[{name,
values}], row_count, source_ref, file_name, context_text}`, `schemas/dataset.schema.json`).
At upload the pack also gets, per data view (sum by month, by region, …): a chart in
`charts[]` (`chart_type`, `title`, `value_axis_title`, `category_axis_title`, `unit`,
`source_note`; `source_ref.range` = view id), a table in `tables[]` and computed
insights in `insights[]` (`{id, dataset_id, view_id, fact_type, fact, headline,
strength, confirmed, needs_confirmation, evidence[], numbers[]}`; `meaning` and
`implication` stay empty without a model).

A pack with datasets is planned **from insights** (`planning/data_story.py`), the same
way for `POST /plans` and `POST /generations`, with or without a model: cover → «Ключевые
выводы» → one slide per data view (title = the insight headline with real numbers, a
`chart` unit with `chart_spec.chart_type` chosen by code, 1–2 supporting facts) → user
text if room is left → closing. The slide's `speaker_note` explains the choice (data →
profile → task → why this type → alternatives → rejected). Changing
`chart_spec.chart_type` in an edited `deck_plan` changes the rendered chart type
(the pack keeps full data; pie > 6 slices → top-5 + «Прочие», bars > 12 → top-10 +
«Остальные»). The chart type never depends on the template or the file format.

Breadth (ADR-033, block D): tables inside `.txt` / `.md` (pipe or tab separated, ≥ 2
columns, ≥ 3 rows) become datasets too. A dataset of a few labelled numbers gives
`chart_type: "kpi"` (native number cards); an entity list (≥ 5 columns, id or name
column) gives `chart_type: "table"`: top-6 rows × up to 5 columns on the slide, the
full list on continuation pages `tbl-{view}-p{k}` (10 rows each). With a model
(`use_llm` on the plan, or `GET /content-packs/{id}/understanding?use_llm=true`) the
1–3 strongest insights of each dataset get `meaning` and `implication`
(`prompts/analysis/analysis_interpret.v1.yaml`); every number in the model text must be one of
the fact's numbers, otherwise the template wording stays and no implication is written.
`implication` always comes with `needs_confirmation: true`. When the brief and the
text around the table carry no task markers the model may name the intent
(`prompts/analysis/analysis_intent.v1.yaml`); it adds weight, it never makes an impossible chart
possible. `Brief.explain_slide: true` adds an appendix slide «Почему такие графики».
A chart in the template (donor) lends its style: series colors, line width, markers,
gap width; data and type still come from the plan. Axis/legend ink and series
contrast use the background under the chart frame when a solid, opaque rectangular
panel covers the whole frame; otherwise the inherited slide background is used.
This changes rendering only, not the selected chart type or API fields.

Quality passport: `analysis.datasets[]` — `{id, title, file, rows, profile_summary,
typable, reason, views:[{view_id, title, task, task_ru, intent, aggregation, chosen:{type,
reasons}, recommended, alternatives[], rejected[], insights[], source, slide_index}]}`.

### Intake and brandbook (ADR-034 §1, ADR-033 §9)

- `POST /projects/{project_id}/intake` (multipart `files[]`, optional form field `idea`)
  → `202 {job_id, project_id, template_id, content_pack_id, brandbook_id, files:[{name,
  detected_kind, kind, accepted, reason, size_bytes}], assistant_note}`. Kind per file
  (`ingestion/intake.py`): `.potx`/first `.pptx` → `template` (a later `.pptx` →
  `content`, a name with «brand»/«бренд» → `brandbook` example); `.csv`/`.xlsx` → `data`;
  `.json` → `brandbook` (design tokens, Figma variables), `data` (tabular) or `content`;
  `.pdf` → `brandbook` when its text looks like a guideline (palette + «брендбук»,
  «палитра»…), else `content`; an image named `logo*`/`лого*`/`brand*` → `brandbook`,
  other images → `unknown`; `.md/.txt/.docx` → `content`. Template → stored as the
  project template; content and data → one content pack (as `POST /content-packs`);
  brandbook files → one brandbook, set as the project brandbook. No files, only `idea`
  → a pack from the idea. Neither → 422. A file that cannot be read as its kind gets
  `accepted: false` and a `reason`; the rest still go through.
- `PATCH /projects/{project_id}/intake/files/{name}` `{kind}` → the same shape, all files
  re-routed. A kind the file cannot have (`tokens.json` as `template`) → 422.
- `GET /templates/{id}/summary` → `{template_id, filename, slides, roles, palette[],
  fonts[], heading_font, body_font, preview_artifact_ids (empty for now), assistant_note}`.
- `GET /brandbooks/{id}` → the `Brandbook` (`schemas/brandbook.schema.json`).
- `GET /brandbooks/{id}/summary` → `{id, name, palette:[{name, hex, role, source}],
  fonts:[{role, family}], logos:[{file_name, artifact_id}], rules[], sources[], warnings[],
  priority, conflicts:[{field, kind, template, brandbook, resolved, note}],
  assistant_note}`; conflicts are against the project template.
- `PATCH /brandbooks/{id}` `{priority: "brandbook" | "template"}` → the summary.
- Generation, style previews and slide regenerate use the project brandbook
  automatically; `POST /generations` also takes `brandbook_id` and `brand_priority`.
  With priority `brandbook` the template package is recolored before composing: the
  template's saturated colors (theme accents and colors drawn on its slides) map to
  the brand palette by role, keeping tints light; neutrals (black, white, greys) stay;
  theme fonts and explicit typefaces map to brand heading/body fonts. Chart types do not
  change. Quality passport: `brand = {brandbook_id, priority, applied, colors, fonts,
  conflicts[], template}`.

### `GET /content-packs/{id}`

Normalized sections/assets/warnings.

### `GET /content-packs/{id}/evidence-graph`

Returns evidence graph revision.

### Assistant steps (ADR-034 §2–§3)

Every response here carries `assistant_note` — one first-person sentence for the
assistant line, built from templates in `configs/assistant.default.yaml` (no model).

- `GET /content-packs/{id}/understanding` →
  `{content_pack_id, blocks:[{id, kind, title, text, source_ref, dataset_id?, preview?}],
  summary:{capacity_slides, main_points[], assistant_note}, datasets:[{id, title, file,
  profile_summary, task, task_ru, recommendations:[{chart_type, score, reasons}], why,
  insights[]}]}`. Block kinds: `topic` (`s:<section>`), `fact` / `number` / `quote`
  (`b:<section>:<i>`), `process` (`d:<diagram>`), `data` (`ds:<dataset>`, `preview` =
  `{chart_type, categories, series, unit}` of the main chart, `text` = first insight).
  ADR-035 additive fields: `brief` contains saved author/extracted context;
  `context:{status,fields:[{field,value,source_id,quote}]}` distinguishes exact
  extracted preferences from suggestions. Statuses: `known`, `reviewed`,
  `not_requested`, `unavailable`, `pending`, `not_current`. Extraction copies
  values from source quotations, never replaces explicit saved values, and is
  cached for the same sources/known fields/provider/prompt. An unavailable model
  leaves real questions rather than synthesized context. Concurrent refresh may
  return `pending`; the client must wait before treating context as settled.
  `interpretation:{status,report?,reason?}`: raw computed facts are immediately
  available, model interpretation is `deferred` while essential questions remain;
  after answers/skip it is `processed`, then `cached` on refresh. A concurrent
  run returns `pending`; a task changed in flight yields `superseded`.
  Human edits win over an in-flight model response. Refresh does not request
  another batch of insights. Model interpretations after a later change of intent
  still need the full revision-dependency work described in ADR-035.
- `PATCH /content-packs/{id}/blocks` `{ops:[{op, block_id, ...}]}` — `remove` (any
  block), `edit` (`s:` → `title`; `b:` → `text` or `items`), `move` (`s:` → `index`),
  `merge` (`s:` `into: "s:…"`). Returns `{content_pack_id, filled_from, understanding}`:
  a **new** pack version (the project now points at it); the old version stays — undo
  on the client is going back to it. Unknown op → 422.
- `PATCH /content-packs/{id}/insights/{insight_id}` `{confirmed?, text?, meaning?,
  implication?}` → the `Insight`. `text` replaces the headline and confirms it.
  Confirmed insights go first on «Ключевые выводы»; a confirmed `implication` goes to
  the closing «Что предлагаем» slide.
- `POST /content-packs/{id}/notes` `{items[]}` — «я добавлю тезисы»: a section «Тезисы
  автора»; same response as `PATCH blocks`.
- `GET /projects/{id}/questions` → `{questions:[{id, kind, reason, options:[{value, label,
  recommended, note?}], allow_custom, optional}], assistant_note, suggested_brief,
  deferred_questions:[<question id>]}`. ADR-035: at most two essential questions
  per response. A question is asked
  only for a reason: `content_short` (an explicitly requested target exceeds material; options
  `shrink` | `notes` | `expand_web` (only when SearXNG is configured) | `expand_model`),
  `key_message` (no explicit purpose/key message and ≥ 2 strong candidates from insights
  and sections), or `audience` (not saved/extracted). Missing length is proposed
  from material in `suggested_brief`, not asked as a mandatory question. A neutral
  draft audience is the empty string, not "руководство". Call-to-action approval
  stays on insight cards; legacy explicit `length`/`call_to_action` answers remain
  accepted. `deferred_questions` are not an automatic extra questionnaire round.
  Empty list → skip the step.
  The project brief is collected from the content-pack upload `brief`, every
  `POST /plans` brief and the answers.
- `POST /projects/{id}/answers` `{answers:{<question id>: value}}` → `{brief, follow_up,
  assistant_note}`; `brief` is complete — send it to `POST /plans`. Mapping:
  `audience`, `tone`, `length` → `target_slide_count`, `content_short` → `content_fill`
  (`shrink`, `expand` for web/model; `notes` → `shrink` + `follow_up.notes = true`),
  `key_message`, `call_to_action`. `Brief.key_message` and `Brief.call_to_action` are
  new optional brief fields; the cover subtitle shows the key message.
  Partial answers preserve other fields and keep unresolved essential questions.
  Empty `answers` explicitly delegates a reversible draft. Submitting all visible
  answers also finishes this question round; deferred questions do not force a new
  screen. Session marks scope this decision to the current content pack; a new
  upload invalidates it. Suggestions are reversible defaults, not claimed human
  preferences. A delegated content fill retains visible assumption labels.

### Plan step additions (ADR-034 §4)

- `SlidePlan.chart` on data slides: `{type, reasons[], alternatives:[{type, reasons}],
  view_id, why}`; `SlidePlan.insight_ids[]`; `SlidePlan.supports_key_message` (when
  the brief has `key_message`; data slides support it when their task matches the
  message's intent, text slides by shared word stems). `PlanSet.key_message`.
- `PATCH /plans/{plan_id}/slides/{slide_id}` `{chart_type, strategy?}` → `PlanSet`.
  Only the code's choice and its alternatives (incl. `table`); anything else → 422 with
  `details.rejected` (e.g. pie for a monthly series: «доли показывают для категорий»).
- `POST /plans/{plan_id}/slides/{slide_id}/actions` `{action, strategy?}` → `PlanSet`:
  `shorten` (half of the points), `split` (second half → «… (продолжение)»),
  `merge_next`, `to_chart` (a data table → the chosen chart, otherwise
  `desired_visual: chart` — then «найти цифры»), `to_diagram` (points → steps of a native
  diagram; the plan set gets a new `content_pack_id`), `remove` (not the cover).
  Indices stay contiguous and `brief.target_slide_count` follows the slide count.

### Style previews (ADR-034 §5)

- `POST /plans/{plan_id}/style-previews` `{slide_ids?, strategy?, template_id?,
  respond_async = true}`. 2–3 key slides of the plan (cover, first data/chart slide,
  a text slide; or `slide_ids`, up to 4) in all three strategies, in parallel. Async →
  `202 {preview_id, job_id, events_url}`; the job emits `preview.ready {strategy,
  slide_id, image_artifact_id}` per slide as each style finishes, then
  `job.completed {preview_id}`. `respond_async: false` → `200` with the record.
  The template is `template_id`, else the plan set's, else the project's; none → 422.
- `GET /style-previews/{preview_id}` → `{preview_id, plan_id, template_id, slide_ids,
  recommended, assistant_note, seconds, styles:[{strategy, title, difference,
  recommended, previews:[{slide_id, index, exemplar, image_artifact_id}], exemplars,
  seconds, error}]}`. Card texts come from `configs/variants.default.yaml`
  (`title_ru`, `difference_ru`); the recommendation follows the plan content (many
  charts → visual, dense text → faithful, else balanced). One failing style sets its
  `error`; the others still come back.
- Then `POST /generations` with `preview_id`: each strategy reuses the exemplars of its
  previewed slides, so the full deck looks like the preview.

When `/plans` has `strategies:["balanced"]` as the common content plan, send
`deck_plan: PlanSet.plans[0].deck_plan`, `preview_id`, and the selected `variants`
to `/generations`. Do not send `deck_plan_id` for a style absent from that PlanSet:
that form resolves plans by strategy and correctly returns 422. The inline common
plan supports one selected style or all three, preserving slide IDs and exemplars.
Autopilot and MCP perform this selection automatically.

## 6. Generations

### `POST /projects/{project_id}/generations`

```json
{
  "template_id": "...",
  "content_pack_id": "...",
  "provider_session_id": "...",
  "brief": {
    "purpose": "product",
    "audience": "executives",
    "language": "ru",
    "target_slide_count": 12,
    "tone": "professional",
    "mandatory_sections": []
  },
  "variants": [
    {"strategy": "faithful"},
    {"strategy": "balanced"},
    {"strategy": "visual"}
  ],
  "config_version": "generation.default@1"
}
```

Returns `202` with `generation_id`, `job_id` and pre-allocated `variant_ids`
**immediately** — the run and job are created in `queued` state and the work is
scheduled on a bounded process-local executor (no synchronous wait). Poll
`GET /generations/{id}` / `GET /jobs/{id}` for `queued → running →
completed|failed|canceled`. The executor is bounded and in-process: a queued
backlog does not survive restart (see ADR-010 for the process-local design and
the deferred Redis/PG worker plan).

Honest status of the optional knobs: `seed` (per-variant and run-level) is
accepted for future use but is currently a **no-op** — the pipeline has no
source of controlled randomness to seed (the deterministic path needs none;
LLM sampling is not seed-wired through this API). `config_version` on this
endpoint is accepted but not applied to generation behaviour or stored on
the variant/run; on the analysis and audit endpoints the same field IS
recorded as record metadata.

Model mode (ADR-011): `use_llm` is `true | false | null`, default `null` =
**auto** — the model is used when a provider is available (`provider_session_id`,
or a real server provider with `mock_provider` off); `false` = no model. With a
model: planning, exemplar rerank, text fitting of overflowing text
(`prompts/text_fitting/text_fit.v1.yaml`) and contextual audit.

Legacy note: `use_llm: true` routes planning + contextual audit through a
configured gateway — `build_gateway()` from env settings (`mock_provider=false`
by default; missing required credentials produce a typed error for explicit model
requests). Offline MockProvider requires explicit test/dev opt-in.
`provider_session_id` selects the leased session's
credentials instead of env settings and **implies the LLM path on its own**
(`use_llm` is redundant when a session is given). The recorded `deck_plan`
is the exact plan the deck was built from — planning runs once per
strategy, never twice (`generate(deck_plan=...)`).

Plan first (optional): `deck_plan_id` (a plan set from `POST /projects/{id}/plans`)
or `deck_plan` (one plan, e.g. edited by the user, used for every variant) builds
the variants from exactly that plan — planning is skipped. Both at once, a plan
set of another project/pack, or a plan set without the requested strategy → `422`.
`VariantSummary.planner` is the original planner for a plan set and
`user_edited:<planner>` for an inline `deck_plan`.

Each variant reports its own lifecycle (`status`, `stage` ∈ `research|content|plan|compose|
audit|render|passport`, `started_at`, `finished_at`), the difference axes
(`axes.{text_density,layout_diversity,visualization}`, `rationale` — from
`configs/variants.default.yaml`) and card metrics (`metrics.style_fidelity`,
`metrics.auto_fixed`). Safe rules (`template.color_palette`, `image.aspect_ratio`,
`accessibility.contrast`) are fixed **before** revision 1 and disclosed in the
Quality Passport.

### `POST /projects/{project_id}/plans`

```json
{"content_pack_id": "...", "brief": {...}, "strategies": ["faithful","balanced","visual"],
 "template_id": "...", "provider_session_id": "...", "use_llm": false}
```

Returns `200 {plan_id, project_id, content_pack_id, plans:[{strategy, deck_plan}], created_at,
content_fill}` (no layout, no render). Feed `plan_id` (or an edited `deck_plan`) to
`POST /generations` with the returned `content_pack_id` (the original pack id is also
accepted: the API resolves it to the filled pack the plan was built on).

Content fill (ADR-030), before planning, by `brief.content_fill`
(`expand` default | `shrink` | `ask`):

- `content_fill.before/after` — `{requested, capacity, status: ok|short|excess,
  missing_slides, covered_topics}`: how many full slides the content fills;
- `expand` adds facts — web research through SearXNG (each fact backed by a verbatim
  quote, its page in `content_fill.web.sources` and on the sources slide), then model
  knowledge (marked `origin=model`); the filled pack is a **new** content pack, its id is
  the response `content_pack_id`; without a model (`resolved=no_model`) or when the fill
  falls short (`expand_partial`, `expand_failed`) the requested count is kept and the
  planner uses all real content, shortening the deck only when content runs out
  (never filler slides);
- `shrink` plans only what the content fills (`deck_plan.brief.target_slide_count` < requested);
- `ask` with `status≠ok` returns `plans: []` and `content_fill.needs_decision=true` —
  show the estimate and repeat the request with `expand` or `shrink`.
  `POST /generations` cannot ask anyone and treats `ask` as `expand`.

Diagrams from text (ADR-032): before content fill, numbered steps, step lists next
to process words («этап», «процесс», «stage», …) and `А → Б → В` chains become
`pack.diagrams` + `diagram_ref` blocks; with a model, `diagram_detect` proposes more,
each step verified verbatim against the section text. Count:
`content_fill.diagrams_detected`.

`deck_plan` content units carry `origin` (`user|web|model`) for badges; units the user
edited should be sent back with `locked: true` — layout fitting keeps their text.
`GET /generations/{id}` reports the run's `content_fill`.

Background mode: `"run_async": true` → `202 {plan_id, job_id, events_url}` (job kind
`planning`). `GET /jobs/{job_id}/events?after=N` streams a recorded journal:
`job.state_changed`, `research.started` `{mode, requested_slides, capacity,
missing_slides, web}`, `research.queries` `{queries}`, `research.source` `{url, title,
publisher, facts}`, `research.model` `{sections}`, `research.finished` `{resolved,
needs_decision, target_slides, ...}`, `plan.slide` `{strategy, index, title, purpose}`,
`job.completed` `{plan_id, needs_decision}`. The result is `GET /plans/{plan_id}`
(404 until the job completes; a failed job carries a typed `error`).

Frontend shapes (ADR-034 §0, additive; the fields above stay):

- request: `respond_async: true` is the same as `run_async: true`;
  `exclude_source_ids: ["web:…" | url]` drops research sources — their facts leave the
  pack (also an already filled pack) and research skips their pages. Source ids are
  stable (`web:` + hash of the URL), so an id from one plan works in the next request;
- `PlanSet.sufficiency` — `{status: short|ok|excess, content_slides, target_slides}`:
  `content_slides` is the capacity after content fill, `target_slides` the final count;
- `PlanSet.research` — `{queries[], sources:[{id, title, url, site, accessed_at,
  facts_count}], duration_s}`;
- `ContentUnit.source_id` — id of `research.sources[]` behind a `web`/`model` unit;
  `origin` stays a string;
- events: `stage.started {stage: research|plan}`, `research.query {query}` (one per
  query), `research.source` also carries `source: {id, title, url, site, accessed_at,
  facts_count}`, `plan.slide` also carries `slide` (the full `SlidePlan`);
- `GET /projects/{project_id}/plans/{plan_id}` — same `PlanSet`, scoped to the project;
- `POST /projects/{project_id}/plans/{plan_id}/cancel` — cooperative cancel of the
  background job: returns the `canceled` job, the current step finishes, the plan is not
  stored (GET → 404); a built plan → 409 `state_conflict`; repeat → same `canceled` job;
- passport: `metrics.content_origin = {user, web, model}` (facts by origin) and
  `metrics.research = {sources_count, duration_s, content_fill}`; a generation built
  from a plan (`deck_plan_id`, or an edited `deck_plan` on the plan's pack) takes the
  plan's content-fill report;
- `/capabilities` → `features.content_fill: true`.

### `GET /plans/{plan_id}`

The stored plan set (also after background planning and slide research).

### `POST /plans/{plan_id}/slides/{slide_id}/research`

```json
{"strategy": "balanced", "focus": "facts|numbers", "provider_session_id": "...", "use_llm": true}
```

"Find facts / figures" for one slide of a plan (e.g. a chart without data). Web research
by the slide title and key message in the deck's context; facts pass the same verbatim
quote check, `focus=numbers` keeps only facts with figures and never falls back to the
model. Found facts are added to the slide (`origin=web`), their pages to the sources slide
(created before the closing slide if absent); the plan set is updated in place with a
**new `content_pack_id`**. Without web, `focus=facts` falls back to model bullets
(`origin=model`). Returns `{plan_set, slide, added_units, research}`; nothing found →
`added_units: 0` and `research.degraded` says why.

Figures to a chart (ADR-032): with `focus=numbers`, homogeneous figures (one unit,
one value per fact, distinct years or labels) become a native `Chart` in the new
pack and a `chart_ref` unit on the slide (`desired_visual: chart`,
`research.chart_id`); mixed figures become a `Table` (`research.table_id`).

User-added slides: `POST /generations` with an inline `deck_plan` accepts slides with
`evidence_ids: []`. A content slide without a body gets one before layout — its
`key_message` (locked, `origin=user`) or, with a model, bullets written by the model
(`origin=model`); reported in `content_fill.user_slides`.

### `GET /generations/{id}`

Run status, plans, variant summaries, events link.

### `POST /generations/{id}/cancel`

Cancellation is cooperative at variant boundaries: queued variants never
start, the in-flight variant finishes honestly (`completed`), and the job/run
become terminal `canceled` immediately — completion never overwrites a
canceled state. Canceling a terminal job (`completed`/`failed`/`canceled`)
answers `409 state_conflict`.

### `POST /generations/{id}/retry`

Always mints a **fresh** run + job (`202`, linked via `parent_run_id`) —
never overwrites the original run's history.

Generation journal (ADR-034 §6): a generation job now has a recorded journal, read by
`GET /jobs/{id}/events`: `job.state_changed {state: queued|running}`,
`stage.started {stage, variant_id, assistant_note}` (`assistant_note` like «Собираю 7
слайдов…»), `slide.ready {variant_id, index, slide_id, preview_artifact_id,
assistant_note}` per slide, `variant.completed {variant_id, strategy}`, then
`job.completed {generation_id}` or `job.failed`. Note: `slide.ready` events of a
variant come together after that variant's render, not one by one during composing.

## 7. Jobs and events

### `GET /jobs/{id}`

Returns state, current stage, progress, timing, safe error and result IDs. A
generation job carries `result_ids.generation_id` (ADR-032) from the moment it is
created.

### `GET /jobs/{id}/events?after={sequence}`

ADR-036: generation, planning, style-preview and autopilot jobs stream their
recorded journal continuously, including records appended after connection.
`after` and the optional `Last-Event-ID` header are nonnegative sequence cursors;
the larger wins. Reconnect replays only newer records, without restarting work.
Invalid headers return 422. A terminal job drains its final record and closes.
Disconnecting does not cancel the job; use the cancellation endpoint explicitly.
Heartbeat comments are transport keepalives, not progress. Proxy buffering is
disabled and slow sends time out. Legacy jobs without a journal still return a
state snapshot. The journal is process-local with optional snapshot persistence;
this does not claim Redis delivery or recovery of active workers. Event types:

- `job.state_changed`;
- `stage.started|progress|completed|failed`;
- `artifact.created`;
- `preview.available`;
- `variant.completed`;
- `audit.issue_summary`;
- `job.awaiting_user`;
- `job.completed|failed|canceled`.

Each event contains sequence, timestamp, stage, progress, message and safe data.

## 8. Variants and slides

- `GET /generations/{id}/variants`
- `GET /variants/{id}`
- `GET /variants/{id}/slides`
- `GET /slides/{id}`
- `GET /slides/{id}/preview`

Variant response includes strategy/rationale, deck artifact, montage, metrics, audit status and export links.

`GET /slides/{id}/preview` serves a PNG (rendered from the revision's PDF);
`VariantSummary.montage_artifact_id` is a grid of all slides in one PNG. After a
repair the previews of the old revision are dropped and rebuilt lazily.
List endpoints are cursor-paginated: pass the `next_cursor` of a page as `cursor`
(`limit` ≤ 200; issues ≤ 500); an invalid cursor → `422`.

### Single-slide rework (ADR-034 §7)

- `POST /variants/{variant_id}/slides/{slide_id}/regenerate` `{action, chart_type?}`;
  `slide_id` is the `SlideInfo.id` (`sld_…`) or the plan slide id. Actions:
  `other_layout` (another template exemplar with the same abilities), `shorter` (half
  of the points), `other_chart` (`chart_type`, else the next alternative of
  `slide.chart`), `style:faithful|balanced|visual` (the exemplar that strategy would
  pick). The slide is composed alone and swapped into the deck: a new deck revision,
  like a repair; every other slide stays byte-identical and keeps its preview. Returns
  `{variant_id, slide, deck_revision, deck_artifact_id, exemplar, preview_artifact_id,
  issues (this slide, after re-audit), assistant_note}`. Unknown action, no alternative
  chart or no other suitable layout → 422.
- `GET /slides/{slide_id}/explain` → the «Почему так» panel: `{slide_id, slide_plan_id,
  title, dataset:{id, title, file, rows}, profile_summary, task, chosen, alternatives,
  rejected, insights, assistant_note}`. A slide without a data chart → `dataset: null`.

## 9. Audit

### `POST /variants/{id}/audits`

Runs deterministic and contextual checks. Accepts provider session for contextual stage and audit config version.

The endpoint is idempotent: the audit run the generation already produced is returned as-is — no re-audit, no duplicated issues. Exception: when a live `provider_session_id` is supplied AND the stored audit has no complete contextual result yet (`contextual_status` ≠ `completed`), the stored run is **upgraded in place** — a real VLM pass appends its issues (`deterministic=false`) while deterministic issues, the audit id, and summaries stay consistent. The contextual status is `completed` only after all ten distinct checks are returned for every requested slide; incomplete coverage is `failed` and can be retried. Repeating the request after `completed` is a pure read: no new provider calls.

### `GET /audits/{id}`

Summary and grouping.

### `GET /audit/rules`

The rule catalog (`audit/catalog.py`): `[{code, title_ru, category, deterministic,
default_severity, repairable, fix_title_ru, threshold}]` for all 34 rules.
Categories: `brand`, `layout`, `text`, `density`, `integrity`, `meaning`.

### `GET /audits/{id}/issues`

Filters: slide, type, severity, deterministic, `status`
(`open|selected|fixed|dismissed|unresolved`), repairable. Cursor-paginated.

Each issue is the frozen `AuditIssue` plus the optional `fingerprint` (stable
across revisions: `rule_code + slide_id + shape_ids`), `fix_preview`
(`{title_ru, description_ru, actions[]}` computed by the same planner that applies
the fix — `null` when not repairable) and `clipped_bbox` (`bbox` clamped to
`[0,1]`; `bbox` itself is untouched). `repairable` is `true` only for rules the
repair planner can fix. Dismissals survive a repair by fingerprint.

### `POST /audits/{id}/repairs`

```json
{
  "provider_session_id": "...",
  "selected_issue_ids": ["..."],
  "max_iterations": 2
}
```

Returns `202 {job_id, audit_id, deck_revision}` when complete. The job carries a
typed `result`: `{applied, skipped, failed, unresolved, not_implemented,
deck_revision, deck_artifact_id, outcomes[]}` where each outcome is
`{issue_id, status: fixed|failed|skipped, action, summary, reason, fingerprint}`
and the counts partition the selection. `fixed` means an action was applied **and**
the re-audit no longer reports the problem; "applied but still flagged" is `failed`.

With a model (`provider_session_id`, or `use_llm` auto/true) overflowing text
(`text.overflow`, `text.slide_clip`) is first rewritten shorter by the model; those
outcomes carry `action: "rewrite_text"`. The rest goes through the deterministic plan.

`?dry_run=true` returns `200 {audit_id, deck_revision, dry_run: true, outcomes[]}`
with `status: planned|skipped` and applies nothing.

After a repair the variant's PDF, Quality Passport, HTML and previews are rebuilt
lazily from the **new** PPTX on the next export/preview request (no `501`).

### `POST /issues/{id}/dismiss`

Requires a user reason; does not alter original result.

## 10. Exports

### `POST /variants/{id}/exports`

```json
{"formats":["pptx","pdf","html","quality_passport"]}
```

Every format is served for the variant's **current** revision (`ExportRecord.
deck_revision`), each artifact with `sha256` and `size_bytes`. `html` is a zip
(`application/zip`) with `index.html` (slide captions as markup) and
`slide-N.png`. Generation already attaches an `ExportRecord` with `pptx`, `pdf`
and `quality_passport`. An unknown format → `422`.

### `GET /exports/{id}`

### `GET /artifacts/{id}/download`

Returns correct MIME and sanitized filename. Sends `ETag` (the artifact sha256),
`Accept-Ranges: bytes`, honours `Range` (`206` / `416`) and `If-None-Match` (`304`).

## 11. Health and capabilities

- `GET /health/live`
- `GET /health/ready`
- `GET /version`
- `GET /capabilities`

Capabilities include parsers, exporters, configured renderer, available audit rules, image generation status and schema/skill versions.

`features` is a block of explicit booleans the UI switches on: `html_export`,
`plan_only`, `png_previews`, `async_generation`, `sse_progress` (`true`:
ADR-036 live journal for background generation/planning/preview/autopilot jobs), `contextual_audit` (`true` with a
live provider session or a real server provider — the offline mock does not
count), `pdf_after_repair`, `repair_dry_run`, `style_fidelity`. `contextual_audit_mode`
says which one: `session|server|mock|none`.

Contextual audit without a vision model (ADR-031): when the provider answers
`provider_capability_missing` (e.g. empty `DECKDNA_MODEL_VISION`), generation
completes; the variant's `contextual_issues` is `null`, the generation report has
`contextual_audit: {ran: false, reason: "provider_capability_missing: …"}`, and the
Quality Passport carries `fallbacks[{feature: "audit.contextual", strategy: "skipped"}]`.

State persistence (ADR-031): with `DECKDNA_STATE_SNAPSHOT=true` (on in
`compose.yaml`) the in-memory store is snapshotted to
`<DECKDNA_ARTIFACT_ROOT>/state/store.pkl` after every mutating request and every
15 s, and restored on startup. Provider sessions and their tokens are not
persisted (ADR-005): after a restart the UI opens a new session.

Speaker notes (ADR-032): every content slide gets a talk track in its PPTX speaker
notes (model with a slide-facts number check, else an extractive summary), plus the
source deck's own notes and a "facts added by the model" disclosure where relevant.
Passport: `metrics.speaker_notes {slides_with_notes, model_written, extractive,
rejected}`.

MCP (ADR-032): `deckdna mcp --transport stdio|http` exposes this API as MCP tools —
see `docs/MCP_RU.md`.

## 12. Idempotency behavior

The server stores `(project_id, endpoint, idempotency_key, body_hash, result)` for mutating operations. Reusing a key with a different body returns `409 idempotency_conflict`. Same body returns original response.

## 13. HTTP status conventions

- `200/201`: synchronous success;
- `202`: job accepted;
- `400`: malformed request;
- `409`: lifecycle/idempotency conflict;
- `413`: upload too large;
- `415`: unsupported media;
- `422`: valid JSON but domain validation failed;
- `429`: provider or local concurrency limit;
- `500`: internal failure with safe envelope;
- `503`: worker/renderer/provider unavailable.
