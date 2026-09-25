# Template Analysis Pipeline

Owner: Agent 2 (PPTX engine) with semantic stages from Agent 3.

> **Implementation status:** implemented today is the deterministic
> forensic slice — `template/autopsy.py::analyze_template` produces
> package census (slides/masters/layouts/themes/media/charts/
> embeddings), per-layout slide usage, per-slide layout→master→theme
> chain resolution via rels, declared theme fonts + theme palettes
> (`theme_palettes` from theme XML, deduplicated across masters), and
> observed font/color histograms (`observed_fonts`, `observed_colors`
> from run props and solid fills). The API projects this into the
> DesignDNA contract (`_forensics_to_design_dna`). Scene graph,
> semantic roles (VLM), exemplar clustering, capacity model and full
> synthesis below are **roadmap**; section §2 is annotated per stage.

## 1. Goal

Transform an arbitrary `.pptx/.potx` into a complete, evidence-cited Design DNA: declared design system + observed design system + functional exemplar library + component patterns + capacity model + unsupported feature inventory.

## 2. Stages

```text
package_validate → package_parse → template_render → scene_graph
→ declared_tokens → observed_tokens → semantic_roles
→ exemplar_cluster → design_dna_synthesis → persist DesignDNA
```

### 2.1 `package_validate` (deterministic)

> **Status:** implemented — `analyze_template`/`parse_file` reject
> non-zip/corrupt packages with `package_corrupt` and missing files
> with `invalid_input`; part census exists. The explicit
> `unsupported_encrypted_template` path is spec'd in errors.py but not
> exercised by tests yet.

- Verify ZIP integrity, `[Content_Types].xml`, `ppt/presentation.xml`.
- Reject encrypted/password-protected files with typed error `unsupported_encrypted_template`.
- Inventory all parts; classify known vs unknown content types.
- Output: `template.package_inventory` artifact.

### 2.2 `package_parse` (deterministic)

> **Status:** partial — autopsy resolves the full OPC census and the
> slide→layout→master→theme rels chain per slide (`sldIdLst` order,
> not filename order), which is what the forensics need. A complete
> normalized OPC graph object (all part nodes/edges, media
> deduplication) does not exist as a data structure — it is traversed
> inline.

Build the full OPC graph:

- nodes: parts (presentation, masters, layouts, slides, themes, media, charts, embeddings, notes, comments, custom XML, extension parts);
- edges: relationships with type, target mode (internal/external);
- resolve slide order from `p:sldIdLst` via rels, not filename order;
- resolve each slide → layout → master → theme chain;
- resolve image/chart/embedded-object targets per slide;
- record media deduplication (same target used by many parts).

Must not assume `slideN.xml` ordering, one master, or one theme.

### 2.3 `template_render` (deterministic, LibreOffice)

> **Status:** partial — `render_slides_png` (soffice pdf → pdftoppm)
> exists and is used for rendering outputs; it is not invoked during
> autopsy, and no montage or font-substitution report is produced.

- Render every slide to PNG via headless `soffice --convert-to pdf` + `pdftoppm`, or `--convert-to png` per page.
- Record font substitution warnings from LibreOffice output.
- Produce montage contact sheet.
- Output: `template.render.slide[]`, `template.render.montage`, `template.font_report`.

### 2.4 `scene_graph` (deterministic)

> **Status:** roadmap — no normalized scene graph exists; audit and
> repair operate directly on the python-pptx object tree (group
> recursion for out-of-bounds is implemented inline in
> `audit/basic.py`, not via a composed-transform scene model).

Recursive normalized scene per slide:

- element kinds: `text`, `image`, `shape`, `group`, `connector`, `table`, `chart`, `ole`, `smartart`, `unknown`;
- geometry: EMU + normalized [0,1] bbox, rotation, parent-group transform composed;
- style: fill/line/effect resolved through inheritance chain;
- text: paragraphs, runs, fonts, sizes, weights, colors, alignment, autofit flags;
- z-order; visibility; placeholder linkage (`p:ph` type/idx);
- for groups: children with composed transforms.

### 2.5 `declared_tokens` (deterministic)

> **Status:** partial — declared fonts and resolved theme palettes
> (`theme_palettes`: dk/lt/accent/hlink slots → RGB) are extracted per
> theme. Placeholder geometry, background specs and text-style levels
> are not extracted yet.

From themes/masters/layouts:

- major/minor fonts per theme;
- theme color scheme (dk/lt/accent/hlink) with resolved RGB;
- placeholder geometry/type per layout;
- background specifications;
- text style levels (title/body/other styles).

### 2.6 `observed_tokens` (deterministic)

> **Status:** partial — observed font histogram and solid-fill color
> histogram implemented (`observed_fonts`, `observed_colors`); the
> Arial-declared/Play-observed split is what these were built to
> expose. Font-size/margin/occupancy histograms are roadmap.

Measured distributions across actual slides:

- font frequency histogram (Play vs declared Arial must diverge visibly);
- font size histogram mapped to role (title/body/label);
- srgbClr/schemeClr usage histogram;
- margins/alignment-line clustering from shape edges;
- common gaps; background kinds;
- occupancy histogram per slide.

### 2.7 `semantic_roles` (hybrid)

> **Status:** roadmap — no role inference or VLM pass exists; the
> pipeline picks slide exemplars directly (exemplar-per-slide cloning
> in composing) without assigning functional classes.

- Heuristics first: largest top-region text → title; big numerals → KPI; repeated same-shape groups → list/card item; footer/logo → anchor.
- VLM pass on montage + per-slide crops for ambiguous roles: assign functional slide class (title, agenda, divider, content-N-cards, data, comparison, timeline, quote, team, CTA, closing).
- Structured output schema; confidence per label; heuristic result is fallback when VLM unavailable.

### 2.8 `exemplar_cluster` (deterministic + embeddings optional)

> **Status:** roadmap — no clustering; `cloning/exemplar.py` selects
> source slides to clone, but there is no feature-vector/cluster/medoid
> machinery and no notion of cluster members for variant diversity.

- Feature vector per slide: role, element-kind histogram, normalized bbox signature, palette signature, typography signature.
- Cluster (agglomerative or k-medoids); medoid = exemplar.
- Record cluster members so variants can pick different members of same cluster.

### 2.9 `design_dna_synthesis`

> **Status:** partial — the API's `_forensics_to_design_dna` maps
> autopsy output into the DesignDNA contract (fonts, palettes,
> unsupported-part inventory for charts/embeddings). Evidence-cited
> rule synthesis, component patterns and capacity model are roadmap.

Merge into DesignDNA per schema; every synthesized rule cites evidence: slide IDs, element IDs, histogram values, or model verdict.

## 3. Key requirements learned from fixtures

1. Do not trust `p:ph` alone — real templates carry most design in plain `p:sp`/`p:pic`/`p:grpSp`.
2. Declared theme font may be unused (Arial declared, Play observed) — both must be reported.
3. Generic layout names (`1_Свободный дизайн`) can host dozens of different exemplar slides — exemplar library must be slide-level, not layout-level.
4. Human-written design rules may exist inside slides (VK Education) — extract and cross-check them against synthesized rules.
5. Multiple masters/themes are real (VK Tech: 2 masters, 3 themes) — all chain resolution must be per-slide.

## 4. Outputs

- `DesignDNA` JSON conforming to `schemas/design-dna.schema.json`;
- exemplar index (slide → role → cluster);
- component pattern list;
- unsupported feature inventory with preservation strategy;
- preview montage artifact IDs.

## 5. Acceptance tests

> **Status:** partially verifiable — all three organizer templates +
> synthetic unseen parse cleanly (regression suite); declared-vs-
> observed font split and multi-master/theme census are covered by
> autopsy tests. Items requiring VLM roles, exemplar clusters or rule
> extraction are not testable yet.

- Parses all three organizer templates and submission template without crash.
- VK Tech: reports Arial declared + Play observed, 2 masters, ≥17 distinct layout usages.
- VK Education: extracted rules overlap human-written rules (font names, alignment guidance, table/chart styling) — manual evaluation checklist.
- Re-run on same file produces identical DesignDNA modulo timestamps (deterministic stages); model stages cache by prompt+input hash.
- Unknown extension part does not fail analysis; it is inventoried.
