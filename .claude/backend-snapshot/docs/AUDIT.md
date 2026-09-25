# Audit System

## Design

Two independent layers per official TZ:

1. **Deterministic** — package/geometry/style facts. Reproducible, no model.
2. **Contextual** — VLM verdicts on rendered slides + EvidenceGraph. Schema-constrained, versioned prompts, confidence + uncertainty policy.

**Implementation status.**
`deckdna audit <deck.pptx> [--out report.json]` — and the same
`audit_deck()` inside `generate` before the passport is assembled —
enforces **24 deterministic rules**: 23 of the ~30 in the official
Appendix (`audit/basic.py`) plus `text.font_floor` — an AGENTS.md
hard-gate added on top of the frozen list:

| rule_code | severity | checks |
|---|---|---|
| `text.overflow` | error | text frames exceeding their shape bounds |
| `integrity.empty_slide` | error | slides with no meaningful content |
| `image.aspect_ratio` | error | images rendered at a distorted aspect |
| `editability.raster_only` | blocker | slides that are a single full-bleed raster |
| `layout.out_of_bounds` | error | top-level shape bbox outside slide bounds (groups checked as a whole, not recursed into children) |
| `integrity.duplicate_slide` | warning | slide text ≥0.9 Jaccard similarity to another slide (flags the repeat, not the original) |
| `integrity.placeholder_text` | error | template placeholder strings left in text (STRONG marker inside text, or WHOLE-match frame) |
| `density.bullet_count` | warning | >6 explicit bullet paragraphs (buChar/buAutoNum/buBlip) in one text body |
| `layout.unintended_overlap` | error | partial bbox overlap of two text shapes (containment and background-shape gates) |
| `layout.edge_margin` | warning | content text shape flush to slide edge without margin |
| `text.font_floor` | error | effective font size below `font_floor_pt` (8pt) on real readable text |
| `accessibility.contrast` | error | text/background WCAG luminance ratio below `contrast_min_ratio` (4.5) |
| `density.bullet_length` | warning | bullet paragraph longer than `max_words_per_bullet` (15 words) |
| `density.table_size` | warning | table grid exceeding `max_table_rows`×`max_table_cols` (7×5) |
| `template.font_family` | warning | >`max_font_families` (2) distinct font families on a slide |
| `density.chart_series` | warning | chart part with >`max_chart_series` (5) `c:ser` series |
| `density.occupancy` | warning | slide occupancy outside `occupancy_min`–`occupancy_max` (25–75%): under-fill by union coverage of all visible shapes, over-fill by content-only shapes <80% of slide — hero images and section dividers don't false-positive |
| `template.font_scale` | warning | explicit run font size outside the declared scale (all `defRPr@sz` of the slide's layout+master) beyond `font_scale_tolerance` (±10%); inherited/theme sizes are honest skips |
| `template.color_palette` | warning | explicit `srgbClr`/`sysClr`/`scrgbClr` more than `color_tolerance_delta_e` (ΔE 8, CIE76) from the deck's `clrScheme` palette; `schemeClr` is palette by definition, neutrals (sat<8%) are convention |
| `integrity.package` | blocker | file is not a valid PPTX package (unreadable zip, missing required parts, unparseable or layout-less slide parts) — pre-check; the deck is not audited further |
| `chart.metadata` | error | live axes without `c:title`/`c:dispUnits` and/or neither `c:legend` nor `c:dLbls` (pie/no-axis charts honestly excluded) |
| `template.anchor_position` | error | footer/sldNum/date placeholder or named logo shape moved >`anchor_tolerance_pt` (2pt) from the position declared on its layout/master (inherited positions are compliant by construction) |
| `text.slide_clip` | error | frame inside the slide but the estimated text extent crosses the slide edge (direction by `bodyPr@anchor`; `wrap="none"` horizontally by `algn`) — disjoint with `text.overflow` (in-frame) and `layout.out_of_bounds` (frame itself outside) |
| `template.layout_origin` | warning | the slide's layout chain does not resolve to a master of this deck (foreign master or broken rel) — defense-in-depth: vacuously green on decks cloned from the template |

The **contextual layer also ships**: `audit/contextual.py`
`run_contextual_audit(deck_path, gateway, ...)` renders each slide
(soffice→pdftoppm, the same path as HTML export), then calls
`gateway.vision_json("slide_checks", [image], payload, SlideChecksResult)`
per slide with `slide_text`, `title_intent` (from DeckPlan),
`evidence_excerpt` (from EvidenceGraph by the slide's `evidence_ids`),
and `deck_language`. It maps the 10 official checks of
`prompts/contextual_audit/slide_checks.v1.yaml` onto frozen Appendix
codes — `content.conclusion_title`, `content.title_alignment`,
`content.single_message`, `content.source_support` (blocker),
`content.nonempty`, `content.visual_relevance`, `content.prompt_leakage`,
`content.spelling`, `content.data_relevance`, `deck.logical_flow` — and
emits `deterministic=False` issues only for `fail` verdicts with
`confidence ≥ 0.5`; `uncertain` verdicts are deliberately **not** issues
(honest uncertainty, not a false positive).

The contextual layer is **wired into the main pipeline**, not only a
library function: `generate(gateway=...)` / `deckdna generate --llm`
runs it right after `audit_deck()` and merges the VLM issues into the
same list; `POST /generations {"use_llm": true}` does the same through
the API (`VariantSummary.contextual_issues`, `AuditRun.contextual_status`
report the real outcome). On the API boundary the writer's
`vlm_verdict` evidence kind is honestly mapped to the schema-sanctioned
`model_verdict` (frozen schemas need an ADR to rename).

Honest limits of the contextual layer: the VK inference endpoint spec
is not published, so all runs so far go through `MockProvider` fixtures
in tests — no real VLM response has been seen yet; check 10 merges
language consistency and logical flow into `deck.logical_flow`; the
`uncertain→warning` downgrade in `configs/audit.default.yaml`
(`contextual:` section) is configured but not wired — AuditIssue has no
disclosure field for it yet.

The only deterministic Appendix rule still **specified but not
implemented** is `layout.guide_alignment` — none of the fixtures
carries `custGuideLst`, so there is honestly nothing to align against
(the check would be guesswork). All remaining unimplemented codes are
contextual — they belong to the VLM layer above (see the Audit
Appendix mapping in `docs/requirements/OFFICIAL_TRACEABILITY.md`);
issue codes not listed must not be expected from the current build.

Variant strategies (OR-007) produce **different audit profiles on the
same content and template** — measured on `vk_tech_template.pptx`:
`faithful` (no synthesized agenda slide) yields 19 error issues vs 20
for `balanced`/`visual`; differences come from real plan/exemplar
divergence, not from auditing each strategy differently.

Repair coverage (`repair/planner.py` `_RULE_HANDLERS`): 12 rule codes
map to actions — `text.overflow`/`image.aspect_ratio`/`integrity.empty_slide`/`editability.raster_only`/`layout.out_of_bounds`/`integrity.duplicate_slide`/`integrity.placeholder_text`/`layout.edge_margin` plus `template.anchor_position`
(restore the shape's `a:xfrm` to the declared layout/master position —
the issue evidence itself carries the declared EMU box),
`text.slide_clip` (`move_shape` when the clip is a clean vertical
overshoot with an unambiguous direction, plus a chained `shorten_text` —
text that fits its frame provably cannot cross the slide edge),
`template.font_family` (`map_font` rewrites the excess `a:latin`
typefaces — beyond the `max_font_families` most frequent — onto the
dominant family) and `template.color_palette` (`map_color` rewrites each
offending explicit fill to the theme `clrScheme` slot nearest by ΔE —
the executor re-derives offenders with the same rules the audit uses).
The executor implements 8 action types — `resize_shape`, `recrop_image`,
`merge_slide`, `move_shape`, `remove_placeholder`, `shorten_text`
(closes residual text.overflow by dropping text), `map_font`,
`map_color`; `native_rebuild`
(raster_only) returns `not_implemented` honestly. Unmapped rules
(`layout.unintended_overlap` — reason stated explicitly in
`_UNRESOLVED_REASONS`, `density.bullet_count`,
`density.bullet_length`, `density.table_size`,
`density.chart_series`, `density.occupancy`, `text.font_floor`,
`accessibility.contrast`, `template.font_scale`,
`integrity.package`, `chart.metadata`,
`template.layout_origin`, plus all contextual codes) fall into
`unresolved` with a stated reason
(`deckdna repair` reports per-action status).

The full rule list, IDs, severities and repair mapping: `docs/requirements/OFFICIAL_TRACEABILITY.md` (Audit Appendix mapping). Implementation spec: `docs/pipeline/AUDIT_AND_REPAIR.md`.

Per the TZ, the audit checklist is an **ориентир** — a baseline that may be extended or reduced **с обоснованием**. We implement all listed checks as defaults; any added/removed rule is recorded in `configs/audit.default.yaml` with a justification note and disclosed in the Quality Passport.

## Coverage report

Target: `deckdna audit --coverage-report` should generate a table mapping every official check → implementation status → test → last-run result, validated in CI. **Not implemented yet** — the flag does not exist in the CLI.

## Thresholds

Configurable in `configs/audit.default.yaml` — the file is the real
runtime source of thresholds (`audit/config.py` `default_audit_config()`
loads it package-relative; editing the yaml actually changes
`audit_deck` behavior). Defaults per TZ: contrast 4.5:1, ≤6 bullets,
≤15 words/bullet, ≤7×5 table, ≤5 chart series, occupancy 25–75%, >2
font families violation, font floor 8pt, font-scale tolerance ±10%,
palette ΔE 8, anchor tolerance 2pt. Enforced today: **all** thresholds
behind the 24 deterministic rules above — including `max_table_rows`,
`max_table_cols`, `max_chart_series`, `occupancy_min`/`occupancy_max`,
`max_font_families`, `font_scale_tolerance`,
`color_tolerance_delta_e` and `anchor_tolerance_pt` (the
`out_of_bounds_tolerance` is reused as the clip tolerance of
`text.slide_clip`).

## Uncertainty policy

- Contextual `uncertain` verdicts → **no issue** in the current build
  (honest uncertainty, not a false positive); the configured
  `uncertain→warning` downgrade is not wired yet — needs a disclosure
  field on the issue.
- High-severity contextual checks may run a second seeded pass; disagreement → `uncertain`. Not wired yet — single pass today.
- Contextual `fail` verdicts become issues only at `confidence ≥ 0.5`;
  below-threshold fails are dropped, not downgraded.
- No aggregate LLM "quality score" is used as a gate anywhere.

## User flow

Audit → issues grouped per slide with bbox overlays → user selects repairable issues → bounded typed repair (≤2 iterations) → revision N+1 → re-audit affected rules only → before/after diff artifact.

## Evidence

Every issue carries measured values/thresholds (deterministic) or verdict+confidence+prompt/model version (contextual). Issues survive across revisions with status transitions (`open→selected→fixed|unresolved|dismissed`).
