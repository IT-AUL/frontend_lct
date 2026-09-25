# Failure Modes and Recovery

> **Implementation status:** the typed-failure machinery is real —
> `DeckDNAError` carries code/message/stage/retryable/details and
> serializes through `to_envelope()` into CLI output and API error
> responses; the code registry in `errors.py` is enforced (unknown
> codes are rejected at construction). The table below is the live
> registry. Degradation policy is partly moot today: the pipeline is
> deterministic-only, so the "fallbacks" for VLM/LLM/embeddings are
> the *normal* path, not a degraded one. Cancellation/resume and
> budget enforcement need a worker queue that does not exist yet —
> **roadmap**, annotated inline.

## Typed failures

| Code | Where | Retryable | User-visible action |
|---|---|---|---|
| invalid_input | upload/validation | no | fix file |
| not_found | API lookups (`_require` 404s) | no | use a valid ID |
| not_implemented | repair/export stubs | no | request a supported action/format |
| idempotency_conflict | idempotent endpoints | no | retry with a new key or reuse the response |
| unsupported_encrypted_template | package_validate | no | remove password |
| package_corrupt | package_validate | no | re-export from PowerPoint |
| font_missing | template_render/fitting | no | installs suggested or accept substitution |
| render_failed | render stages | yes | retry; check LibreOffice |
| provider_unavailable | any model stage | yes | retry / change provider |
| provider_capability_missing | model stages | no | select model with required capability |
| structured_output_invalid | model stages | yes | retry once; else deterministic fallback |
| composition_failed | compiler | partial | adjust brief/density |
| protected_slide | repair on organizer/protected slides | no | exclude the slide from repair scope |
| validation_failed | post-compose | yes once | inspect composition report |
| time_budget_exceeded | orchestrator | partial | reduce slides/variants |
| artifact_missing | any stage | yes | retry stage |
| internal_error | anywhere | yes | report with request ID |

Seeded-defect coverage today (tests actually exercise):
`package_corrupt` and `invalid_input` (CLI inspect/audit/ingest/repair
+ API analyze on corrupt and missing files), `provider_capability_missing`
and `structured_output_invalid` (provider mock-transport tests),
`not_implemented` (repair executor stubs + export of a format the
pipeline did not produce), `not_found` (API 404 paths), `render_failed`
(missing soffice/pdftoppm). Not yet exercised: `font_missing`,
`unsupported_encrypted_template`, `provider_unavailable`,
`composition_failed`, `protected_slide`, `validation_failed`,
`time_budget_exceeded`, `artifact_missing`, `idempotency_conflict`.

## Degradation policy (graceful, disclosed)

> **Status:** policy as spec'd is target — the pipeline is already
> deterministic-only, so items 1–4 describe the *default* path, not a
> fallback. There is no runtime detection of "VLM unavailable" because
> no model stage exists to fail. `fallbacks`/info-issue disclosure in
> the passport lands together with the first real model stage.

1. VLM unavailable → deterministic role inference + deterministic ranking; passport notes `semantic_inference: heuristic`.
2. Embeddings unavailable → structural clustering only.
3. LLM planning unavailable → template-section-driven deterministic outline from EvidenceGraph (degraded, disclosed).
4. Image search unavailable → local assets only.
5. LibreOffice missing → package validation still runs; render-dependent checks skipped and disclosed.
6. Provider timeout mid-run → stage retry, then pause job awaiting user decision.

Every degradation appears in Quality Passport `fallbacks` and as an info-level issue.

Item 5 is real today in the sense that audit/parsing run without
`soffice` — render-dependent steps raise `render_failed`, which is
reported rather than silently skipped.

## Cancellation and resume

> **Status:** roadmap — there is no worker/job queue (the API
> completes jobs synchronously, `jobs/worker.py` is a stub loop), so
> there is nothing to cancel or resume mid-run. A failed CLI run just
> exits; artifacts already written stay on disk.

- Cancel sets flag; worker checks at stage boundaries; completed stage artifacts kept.
- Resume re-enters DAG at first incomplete stage using cache keys.
- Failed job keeps all artifacts; retry creates new attempt, not new run.

## Time budget enforcement

> **Status:** partial — no in-run enforcement exists (nothing checks
> elapsed time mid-pipeline; there is no orchestrator). The 300s
> budget is verified *post-hoc* by `deckdna benchmark`, which runs the
> full pipeline per template and reports per-deck seconds vs the
> budget (current actuals 2–11s). `time_budget_exceeded` is in the
> error registry but unreachable today.

- Orchestrator tracks cumulative elapsed vs 300s budget.
- At 80% budget: skip optional VLM rerank, reduce audit scope to errors+blockers, disclose.
- Hard stop at budget: deliver best completed variants + partial passport marked `time_budget_exceeded`.
