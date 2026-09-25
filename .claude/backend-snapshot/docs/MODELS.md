# Models

> **Implementation status** — read this first: **the LLM/VLM pipeline is
> code-complete and wired, but no calls to a real provider have ever been
> made** — the official VK Inference endpoint spec is still unpublished,
> so everything runs against `MockProvider` (the default via
> `settings.mock_provider`) in tests. The deterministic path
> (`use_llm` off) makes zero LLM calls and is unchanged.
>
> What is wired (all behind the optional `gateway`):
> - **Text planning (storyline)** — `plan_deck_llm` in
>   `planning/story_director.py`: builds the real EvidenceGraph,
>   renders the versioned prompt `storyline` from the prompt registry
>   (`providers/prompts.py`, `prompts/**/<name>.v<N>.yaml`) with payload
>   `{brief, evidence_graph, design_dna_capacities}`, calls
>   `gateway.text_json`, gates the result through the same jsonschema
>   contract as the deterministic plan, and **honestly falls back to
>   `plan_deck` with a logged warning** on invalid output or provider
>   failure (visible via `report["planner"]` / plan provenance).
> - **Vision (contextual audit)** — `run_contextual_audit` in
>   `audit/contextual.py`: all 10 official Appendix questions via
>   `gateway.vision_json` on per-slide rendered PNGs, verdict→issue
>   mapping; issues (`deterministic=False`, evidence kind mapped to
>   `model_verdict` at the API boundary) merge into the audit list.
>
> Entry points: `generate(gateway=...)`, `deckdna generate --llm`,
> `POST /generations {"use_llm": true}` — all build the gateway via
> `providers/factory.build_gateway()`.
>
> Adapters: `OpenAICompatibleProvider` (baseline),
> `VKInferenceProvider` (VK top-10 path, model id `qwen3.8-27b`, env
> `DECKDNA_VK_*`; mock-transport contract tests green, live smoke gated
> on `DECKDNA_VK_LIVE=1` pending the endpoint spec), and `MockProvider`
> (deterministic, the default). The whole pipeline works against any
> OpenAI-compatible endpoint — verified so far only through MockProvider
> and mock-transport contract tests, not a live endpoint.

## Constraints (from official TZ)

- Open weights only; license Apache-2.0 or MIT; ≤35B parameters for text/vision.
- Text-to-image (stretch): ≤20B.
- Top-10 must migrate to VK Inference API with **Qwen 3.8 27B** (endpoint spec pending from organizers).

## Roles → recommended open models

> **Status:** two roles are wired — text planning (`plan_deck_llm`) and
> vision contextual audit (`run_contextual_audit`), both behind the
> optional `gateway` with deterministic fallbacks. Embeddings and image
> generation remain a target assignment.

| Role | Requirements | Default candidates | Notes |
|---|---|---|---|
| Text planning (storyline, variants) | structured JSON, ru/en, long context | Qwen2.5-32B-Instruct / Qwen3-27B class | VK Qwen adapter targets this tier |
| Vision (slide semantics, contextual audit) | image input, structured output | Qwen2.5-VL-32B / InternVL class ≤35B | VLM optional; deterministic fallback exists |
| Embeddings (clustering, retrieval) | vector API | bge-m3 / e5-multilingual | optional |
| Image generation (stretch) | ≤20B, Apache-2.0/MIT per TZ | FLUX.1-schnell (Apache-2.0) | adapter only, off by default. NB: SDXL uses OpenRAIL++-M — does NOT satisfy the TZ Apache/MIT constraint |
| Spellcheck | deterministic | pymorphy3/hunspell | not an LLM |

Every model entry must list: model ID, HF link, parameters, license, context size, modality, role assignment, fallback.

## Provider gateway contract

```
ProviderConfig {
  label, base_url, models{text,vision,embedding,image},
  capabilities{structured_output,tool_calls,image_input,embeddings},
  timeout_seconds, max_concurrency
}
```

- `OpenAICompatibleProvider` — baseline adapter (chat.completions, response_format json_schema where supported, images as base64 data URLs).
- `VKInferenceProvider` (`backend/deckdna/providers/vk_inference.py`) — implemented thin adapter over the OpenAI-compatible client; model id `qwen3.8-27b` default, env-wired (`DECKDNA_VK_*`). Request contract covered by mock-transport tests; live smoke test runs with `DECKDNA_VK_LIVE=1` once the official endpoint spec is published.
- `MockProvider` — deterministic fixtures for offline tests.
- `ImageProvider`/`AssetSearchProvider` — separate interfaces; Openverse/Wikimedia adapters optional.

## Capability probing

> **Status:** partial — the endpoint exists but only echoes what the
> client declared at session creation (`ok`/`skip` per capability); it
> performs no live probe calls. `factory.build_gateway` does enforce
> `provider_capability_missing` on incomplete settings, and stages use
> documented deterministic fallbacks — never silently degrade.

`POST /provider-sessions/{id}/test` returns per-capability `ok`/`skip` verdicts from the capabilities the client declared at session creation — real probing calls are planned. A stage that needs a missing capability fails with `provider_capability_missing` or uses documented deterministic fallback — never silently degrades.

## Versioning

> **Status:** implemented — every passport now carries truthful
> `provenance.prompt_versions` (registry name → version, only for
> prompts whose stage actually ran and was accepted: `storyline` on an
> accepted LLM plan, `contextual_slide_audit` on a completed VLM audit,
> `exemplar_rerank` on an accepted rerank) and
> `provenance.model_profiles` (`ModelProfile` =
> model_id/provider/size_b/license) limited to roles reported by the
> provider's `used_model_ids()` **and** whose stage was accepted in that
> run — a rejected planner/rerank never records the text model, and a
> deterministic fallback run leaves both fields empty. `provider` is a
> sanitized host[:port] (no userinfo/base_url/api_key); `size_b`/`license`
> are enriched from `configs/model_licenses.yaml` (unknown model →
> honest `None`). Per-deck scoping holds when one gateway is reused
> across the three variant runs: accumulated role bookkeeping cannot
> leak into a deck whose stage did not accept that role. The plan's own
> provenance (`planner`, `prompt_version`, `input_hashes`, `model_id`)
> and `report["planner"]`/`contextual_audit` remain alongside.

`ModelProfile` records model_id, provider, size_b, license, context window, prompt version compatibility. Quality Passport lists every model used per run.
