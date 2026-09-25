# PPTX Compiler

Owner: Agent 2. The highest-risk subsystem; direct OOXML is the source of truth.

**Implementation status (current slice).** This document describes the
Phase-0 design; the column «статус» marks what actually ships today.
The working core is: exemplar-per-slide clone → positional txBody
slot-fill + shrink-to-fit → deterministic audit → typed repair. The
full typed-op registry, scene graph and constraint solver are
**roadmap** (§9), not implemented.

## 1. Principles

- LLMs never emit OOXML. All mutations go through typed code paths —
  today: `composing/text_replace.py` (slot fill), `repair/apply.py`
  (repair executors). A unified typed operation registry is roadmap.
- Original template package is immutable; output = package copy + mutations.
- Relationship integrity is a hard gate: every referenced part exists, every part is reachable or explicitly removed, content types cover all parts.
- Exemplar-first: clone real slides; layouts are scaffold/fallback.
- Preservation over perfection: unknown parts are copied byte-for-byte and inventoried.

## 2. Module map (implemented)

```text
pptx/
├── opc/package.py       package open, part graph, rels CRUD, content types, save
├── cloning/exemplar.py  exemplar selection: run-profile census, candidate pool
│                        ranking, card/group cardinality, decorative-body gates
├── cloning/single_slide.py  build_single/multi_slide_deck: slide clone with
│                        dependency closure (masters/theme/media/fonts);
│                        notes/comments rels dropped (DROP_REL_TYPES)
├── composing/minimal.py DeckPlan → per-slide texts + exemplar metrics +
│                        compose_report (dropped_units, bodies_shrunk)
├── composing/text_replace.py  positional txBody slot-fill: title runs,
│                        body slots in doc order, empty-slot clearing incl.
│                        a:tc cells, shrink-to-fit (_fit_body)
├── composing/protection.py  ProtectedSlides guard API (exists; wiring into
│                        compose/repair paths is roadmap)
├── exporting/render.py  pptx→pdf via LibreOffice, html bundle, slide PNGs
└── validation/pei.py    PEI level assessment (L0–L5 rubric from package facts)

repair/
├── planner.py           plan_repairs(issues) → RepairAction[] + unresolved
└── apply.py             executors: resize_shape, move_shape, recrop_image,
                         remove_placeholder, merge_slide, shorten_text,
                         map_font, map_color

pptx/{parser,scene,fitting}/ — package skeletons only, no implementation.
```

## 3. Slide clone algorithm (implemented)

`build_multi_slide_deck(pkg, slides)` in `cloning/single_slide.py`:

1. Seeds: chosen exemplar slide parts + every non-slide presentation
   dependency (masters, notes master, theme, presProps, embedded fonts)
   + package-level rels (docProps, presentation).
2. Dependency closure walks rels transitively: layout rels shared;
   image/media parts copied once (shared references); charts and their
   embedded workbooks travel with the closure; `notesSlide`/`comments`/
   `commentAuthors` rel types are dropped by default.
3. New slides emit as `ppt/slides/slide1.xml..slideN.xml` in plan order;
   `p:sldIdLst` and content types rebuilt; source→new mapping goes into
   the compose report.

Slide XML is content-substituted **before** packaging (bytes in, bytes out).

## 4. Composition (implemented)

`composing/minimal.py::generate_deck` per SlidePlan: pick exemplar →
`replace_text_runs(slide_xml, texts, title_text, shape_hints)`:

- **title slot** — runs of title/ctrTitle placeholder get `title_text`,
  remaining runs cleared.
- **body slots** — content-eligible `p:txBody` in document order:
  not inside `a:tbl`, not decorative (vertical text, per-letter
  fragments like "S K Y L I N E", ultra-narrow), not single-tiny-run
  bodies (stock "12" leak fix). First run gets the text, siblings cleared.
- **empty slots** — cleared (`empty_slot_policy="clear"`): stock
  template copy must not survive; non-empty `a:tc` cell runs emptied too
  (a native table is not a prose slot).
- **non-text kinds** — структурный fill реализован: `table_fill`
  (рост через `gridRow`), `chart_fill` (numCache/strCache + unshare
  shared chart-парта), `image_fill` (media-парт + unshare,
  `add_picture`-fallback), `diagram_fill` (SmartArt-like grouped
  shapes); без носителя в exemplar — честный `dropped_units` +
  `warnings` (from-scratch chart creation и pictograms — roadmap).
- **shape_hints** — per-slot exemplar metrics (font size, box EMU,
  wrap) resolved through python-pptx for placeholder-inherited geometry.

## 5. Text fitting (implemented, minimal)

`text_replace.py::_fit_body` — shrink-to-fit on slot fill:

- Required height measured with the same wrap metrics the audit uses
  (`lnSpc`, `spcBef/Aft`, ≥1 line per paragraph); font size steps −1pt
  until the body fits or hits the floor (8pt).
- New `sz` written into `pPr/defRPr` + all `rPr`/`endParaRPr`.
- Exemplar `a:br` hard breaks stripped (phantom empty line otherwise).
- Residual overflow at floor is legitimate: it stays an audit issue.
- `compose_report.totals.bodies_shrunk` + `font_floor_pt` reported.

**Roadmap:** real autofit strategy chain (shorten → split → resize →
swap exemplar), font-metric-accurate measurement (PIL/LibreOffice), not
the audit's heuristic estimator.

## 6. Repair loop (implemented)

`repair/planner.py::plan_repairs(issues)` → typed `RepairAction[]`
(+ `unresolved` for unmapped rules); `repair/apply.py::apply_repairs`
executes and reports per-action `applied/skipped/failed/not_implemented`.

| rule → action | executor status |
|---|---|
| `text.overflow` → `resize_shape` (expand w/h per overflow axis, clamped to slide) | implemented |
| `layout.out_of_bounds` → `resize_shape` (clamp into [0,1]) | implemented |
| `image.aspect_ratio` → `recrop_image` (symmetric `a:srcRect`) | implemented |
| `integrity.placeholder_text` → `remove_placeholder` (clear runs, shape kept) | implemented |
| `integrity.empty_slide`, `integrity.duplicate_slide` → `merge_slide` (drop slide from sldIdLst + rel) | implemented |
| `layout.edge_margin` → `move_shape` (shift off, keep ext) | implemented |
| `template.anchor_position` → `resize_shape` (restore declared layout/master xfrm из evidence) | implemented |
| `text.slide_clip` → `move_shape` + `shorten_text` | implemented |
| `template.font_family` → `map_font` (лишние typeface'ы → доминирующий) | implemented |
| `template.color_palette` → `map_color` (offending заливка → ближайший по ΔE слот clrScheme) | implemented |
| `editability.raster_only` → `native_rebuild` | `not_implemented` honestly |
| `layout.unintended_overlap`, `density.bullet_count`, остальные 7 правил + contextual-коды | `unresolved` с явной причиной |

`resize_shape` hardening: bbox clamped into slide bounds, then each
growing side stops at the nearest text-neighbor edge on the same gates
as `check_unintended_overlap` — repair cannot trade overflow for
out-of-bounds or a new collision; residuals reported in `detail`.

## 7. Validation gates

- Implemented: package round-trip via python-pptx + OPC writer;
  deterministic audit (`audit/basic.py`, see `AUDIT.md`) runs inside
  `generate`; PEI level in the Quality Passport (`validation/pei.py`);
  LibreOffice render is the visual gate used in dev (PNG export).
- **Roadmap:** the full §8 gate list below — rel-target completeness
  check, slide-count==plan-count gate, non-zero pixel variance per
  slide, `pic`>90% guard as dedicated export validation.

## 8. SmartArt & unsupported parts (policy, unchanged)

- Baseline: SmartArt-like diagrams = grouped native shapes/connectors.
- True SmartArt parts in a template: preserved via clone; semantic
  edits not required. Authoring `diagram*` parts: stretch only.
- Unsupported-parts strategy order `preserve` → `immutable_decoration`
  → `raster_fallback` (disclosed) → `skip`: roadmap — today unknown
  parts ride through the dependency closure byte-for-byte; there is no
  explicit unsupported inventory yet.

## 9. Roadmap (Phase-0 spec not yet implemented)

- **Typed operation registry** — `replace_image`, `clone_group`,
  `remove_group`, `add_table`, `add_chart`, `add_shape`/`add_connector`,
  `align`, `set_font`/`set_color`, `reorder_slides`, `delete_slide`
  and `composition.mapping` emission per op.
- **Semantic slot mapping** — fill slots by role/meaning instead of
  document-order position (removes caption-slot pathologies).
- **Constraint solver** — real text-fit + collision resolution across
  the whole slide (today: per-shape clamps in repair only).
- **Scene graph** (`pptx/scene/`), template `parser/`, standalone
  `fitting/` estimator.
- **Structured content fill** — `a:tbl`/charts from ContentPack tables
  (see PROJECT_CONTEXT.md «table/chart-контент теряется молча»).
- **ProtectedSlides wiring** — guard API exists
  (`composing/protection.py`); invoking it inside compose/repair
  mutation paths is pending.
- **Golden fixtures** — multi-master, two themes, shared media,
  chart+workbook, connector, SmartArt pass-through, unknown extension,
  non-16:9 (today covered: organizer fixtures + `synthetic_unseen`).
