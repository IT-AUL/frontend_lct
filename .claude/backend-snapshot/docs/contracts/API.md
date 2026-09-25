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

`base_url` must be a plain `http(s)` URL — userinfo credentials in the URL and non-http(s) schemes are rejected with `422` (credentials belong in `api_token`, never in the URL, which is published back to the client).

Response excludes token and returns session ID, expiry and declared capabilities. The token is lease-held server-side (in-memory store until Redis lands in Wave 2) and is never returned by any endpoint — including inside `422` error envelopes, where request `input`/`ctx` are stripped from validation details. Lease semantics:

- `ttl_seconds` is enforced lazily: any use of an expired session evicts it (token included) and answers `404 not_found "provider session expired"`;
- `project_id`, when supplied, binds the session to that project — use in another project answers `422 invalid_input`;
- `DELETE` revokes the lease immediately: the token is destroyed with the session record and reuse answers `404`.

### `POST /provider-sessions/{id}/test`

Performs minimal safe capability probes **against the live endpoint** using the session credentials — one real round-trip per declared capability: `structured_output` (minimal `json_schema` chat completion), `image_input` (same + a 1px PNG data URL), `embeddings` (one embed call). Probe statuses: `ok` — the call succeeded; `fail` — the endpoint rejected it (`detail` carries the typed error code, never secrets); `skip` — capability not declared by the client or not probeable (`tool_calls`).

### `DELETE /provider-sessions/{id}`

Revokes the lease immediately (see above).

## 3. Projects

- `POST /projects`
- `GET /projects`
- `GET /projects/{id}`
- `PATCH /projects/{id}`
- `DELETE /projects/{id}`

Create fields: name, default language, target slide count.

## 4. Templates

### `POST /projects/{project_id}/templates`

Multipart `file`. Accept PPTX/POTX. Returns TemplateAsset.

### `POST /templates/{template_id}/analyze`

Body: provider session ID, optional analysis config version. Returns job.

### `GET /templates/{template_id}`

Metadata, validation, latest analysis.

### `GET /templates/{template_id}/design-dna`

Returns latest or requested revision.

### `GET /templates/{template_id}/slides`

Paginated exemplar/preview metadata.

## 5. Content packs

### `POST /projects/{project_id}/content-packs`

Multipart files plus optional JSON brief. Returns ContentPack and ingestion job.

### `GET /content-packs/{id}`

Normalized sections/assets/warnings.

### `GET /content-packs/{id}/evidence-graph`

Returns evidence graph revision.

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

Returns job and generation IDs.

Honest status of the optional knobs: `seed` (per-variant and run-level) is
accepted for future use but is currently a **no-op** — the pipeline has no
source of controlled randomness to seed (the deterministic path needs none;
LLM sampling is not seed-wired through this API). `config_version` on this
endpoint is accepted but not applied to generation behaviour or stored on
the variant/run; on the analysis and audit endpoints the same field IS
recorded as record metadata.

LLM/VLM mode: `use_llm: true` routes planning + contextual audit through a
real gateway — `build_gateway()` from env settings (`mock_provider` default
is offline-safe). `provider_session_id` selects the leased session's
credentials instead of env settings and **implies the LLM path on its own**
(`use_llm` is redundant when a session is given). The recorded `deck_plan`
is the exact plan the deck was built from — planning runs once per
strategy, never twice (`generate(deck_plan=...)`).

### `GET /generations/{id}`

Run status, plans, variant summaries, events link.

### `POST /generations/{id}/cancel`

Cancellation is cooperative at stage boundaries.

### `POST /generations/{id}/retry`

Retry failed stage or start child run; never overwrite history.

## 7. Jobs and events

### `GET /jobs/{id}`

Returns state, current stage, progress, timing, safe error and result IDs.

### `GET /jobs/{id}/events?after={sequence}`

SSE stream. Event types:

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

## 9. Audit

### `POST /variants/{id}/audits`

Runs deterministic and contextual checks. Accepts provider session for contextual stage and audit config version.

The endpoint is idempotent: the audit run the generation already produced is returned as-is — no re-audit, no duplicated issues. Exception: when a live `provider_session_id` is supplied AND the stored audit has no contextual results yet (`contextual_status` ≠ `completed`), the stored run is **upgraded in place** — a real VLM pass appends its issues (`deterministic=false`) while deterministic issues, the audit id, and summaries stay consistent. Repeating the request after `completed` is a pure read: no new provider calls.

### `GET /audits/{id}`

Summary and grouping.

### `GET /audits/{id}/issues`

Filters: slide, type, severity, deterministic, status, repairable.

### `POST /audits/{id}/repairs`

```json
{
  "provider_session_id": "...",
  "selected_issue_ids": ["..."],
  "max_iterations": 2
}
```

Returns child repair job and resulting deck revision when complete.

### `POST /issues/{id}/dismiss`

Requires a user reason; does not alter original result.

## 10. Exports

### `POST /variants/{id}/exports`

```json
{"formats":["pptx","pdf","html","quality_passport"]}
```

### `GET /exports/{id}`

### `GET /artifacts/{id}/download`

Returns correct MIME and sanitized filename.

## 11. Health and capabilities

- `GET /health/live`
- `GET /health/ready`
- `GET /version`
- `GET /capabilities`

Capabilities include parsers, exporters, configured renderer, available audit rules, image generation status and schema/skill versions.

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
