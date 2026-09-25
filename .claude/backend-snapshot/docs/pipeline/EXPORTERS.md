# Exporters

Owner: Agent 2.

> **Implementation status:** all three formats exist in
> `pptx/exporting/render.py` and are covered by CLI tests on real
> fixtures — PPTX (native pipeline output), PDF (soffice headless),
> PNG (pdf → pdftoppm), and HTML as a **hand-built** `index.html` +
> `slide-*.png` viewer bundle — deliberately NOT via
> `soffice --convert-to html`, whose single base64-embedded document
> hit a reproducible libxml2 huge-text-node crash on real decks
> (PR #23 rework). The Quality Passport is JSON-only today; the
> human-readable passport and the spec's richer HTML bundle features
> (deck.json manifest, keyboard navigation, issue links) are
> **roadmap**. Sections below carry per-item status.

## 1. PPTX

> **Status:** implemented — produced by the pipeline as the primary
> output; CLI `generate`/`export` write it, API serves it as an
> artifact with sha256.

Primary output. Produced by the compiler; validated per `PPTX_COMPILER.md` §8. Filename policy: `{project}-{variant}-{revision}.pptx`, sanitized.

## 2. PDF

> **Status:** implemented (core) — `render_pdf` runs the exact
> soffice command; `render_failed` typed error on missing tool/
> non-zero exit. Font-substitution capture and `pdfinfo` sanity are
> roadmap; page count is verified in tests instead.

- `soffice --headless --convert-to pdf --outdir <tmp> <deck.pptx>`.
- Capture stderr/stdout for font substitution warnings → `font_report`.
- Verify page count == slide count; verify file size > 0; `pdfinfo` sanity.
- Record LibreOffice version in artifact metadata.
- Known limitation: PowerPoint-specific effects may render differently; disclosed in passport.

## 3. HTML

> **Status:** implemented, simpler than spec — `render_html` builds a
> directory with `index.html` + `slide-*.png` + per-slide text
> captions (extracted via python-pptx); no external deps, no
> editability claim. Missing vs spec: `deck.json` manifest, keyboard
> navigation (←/→), notes/issue links — roadmap.

Self-contained viewer bundle:

- `index.html` + rendered slide images + `deck.json` manifest (titles, notes, issue links, variant info);
- keyboard navigation (←/→), slide counter, fullscreen-friendly layout;
- no external CDN dependencies; inline CSS/JS;
- does not claim editability — it is a review/preview artifact.

Optional stretch: scene-graph-driven HTML with positioned text layers for selectable text. Not required for acceptance.

## 4. Quality Passport

> **Status:** JSON implemented — `quality-passport.json` conforms to
> `schemas/quality-passport.schema.json` (inputs, metrics, issues,
> provenance fields incl. prompt/config/model version slots, exports
> with checksums, environment). The human-readable HTML/Markdown
> rendering is roadmap.

Two artifacts:

- `quality-passport.json` conforming to `schemas/quality-passport.schema.json`;
- human-readable HTML/Markdown rendering generated from the JSON.

Contents: inputs (hashes), metrics, issues summary, fallbacks, provenance (pipeline/skill/prompt/model/config versions), exports with checksums, environment info.

## 5. Export job

> **Status:** partial — `POST /api/v1/variants/{id}/exports` exists
> and returns an ExportRecord, but it *registers already-produced
> pipeline artifacts* rather than rendering on demand; requesting a
> format the pipeline did not produce returns `not_implemented`. The
> job completes synchronously; per-format independent retry is
> roadmap.

`POST /variants/{id}/exports` runs one job producing all requested formats; partial failure does not delete successful artifacts. Each format retried independently.

## 6. Acceptance tests

> **Status:** three of four covered — PPTX round-trip, PDF page
> count, and offline HTML bundle (real text in captions asserted on
> the 54-slide organizer fixture) are exercised by CLI tests. The
> passport-schema assertion is covered separately by contract/eval
> tests.

- PPTX opens in LibreOffice and parser round-trip.
- PDF page count equals slide count.
- HTML bundle opens offline (no network), all slides navigable.
- Passport JSON validates against schema and contains all required provenance fields.
