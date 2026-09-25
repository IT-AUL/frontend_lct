# Domain Model

## 1. Conventions

- IDs are UUIDv7 strings.
- Timestamps are UTC RFC3339.
- Coordinates in public contracts are normalized floats `[0,1]`; document adapters retain EMU values separately.
- Contracts are immutable versioned records; corrections create a new revision.
- Every probabilistic record carries model and prompt provenance.

## 2. Aggregate overview

```text
Project
 ├─ ProviderSession (ephemeral)
 ├─ TemplateAsset ─ TemplateAnalysis ─ DesignDNA
 │                     ├─ SlideExemplar
 │                     └─ ComponentPattern
 ├─ ContentPack ─ EvidenceGraph
 └─ GenerationRun
      ├─ DeckPlan
      ├─ VariantSpec ×3
      │    └─ DeckArtifact ─ SlideArtifact*
      ├─ AuditRun ─ AuditIssue*
      ├─ RepairSelection ─ RepairAction*
      ├─ ExportArtifact*
      └─ QualityPassport
```

## 3. Entities

### Project

Fields:

- `id`, `name`, `created_at`, `updated_at`;
- `default_language`, `target_slide_count`;
- optional non-secret `provider_profile`;
- current template/content IDs;
- lifecycle status.

Invariant: project deletion never follows from job cleanup; artifacts follow configured retention.

### ProviderSession

- opaque `id` and Redis lease key;
- project ID;
- non-secret capability summary;
- expiry;
- token never appears in Pydantic serialization, DB, logs or events.

### TemplateAsset

- original filename, MIME, SHA-256, size;
- artifact ID;
- validation status;
- package type PPTX/POTX;
- immutable after creation.

### TemplateAnalysis

- template ID and analysis revision;
- parser/renderer/prompt/model versions;
- package inventory;
- scene graph artifact;
- preview/montage artifacts;
- unsupported feature inventory;
- warnings/status/timings.

### DesignDNA

- template and analysis IDs;
- slide size;
- declared tokens;
- observed tokens;
- synthesized typography/palette/spacing/grid rules;
- fixed anchors;
- functional slide roles;
- exemplar/component references;
- capacity models;
- rhythm rules;
- evidence/confidence;
- schema version.

### SlideExemplar

- source slide index/part;
- functional role and confidence;
- scene graph root IDs;
- semantic group signature;
- placeholder/content capacity;
- preview artifact;
- relation/dependency summary;
- mutability constraints.

### ComponentPattern

- semantic role and item schema;
- source slide/group IDs;
- relative geometry/style signature;
- cardinality and clone constraints;
- content slot definitions;
- compatible parent layouts.

### ContentPack

- source asset IDs;
- parser versions;
- normalized document artifact;
- sections, tables, visuals and warnings;
- language and metadata.

### EvidenceNode / EvidenceEdge / EvidenceGraph

Node types: `claim`, `number`, `entity`, `section`, `table`, `visual`, `source_span`.

Number node requires raw value, normalized numeric value, unit and source location. `supports`, `derived_from`, `illustrates`, `contrasts`, and `belongs_to` are valid edge types.

### Brief

- purpose, audience, language, target slides;
- tone, mandatory sections, forbidden claims;
- variation axis and optional preferences.

### DeckPlan

- brief/evidence/design references;
- title, objective, audience;
- ordered sections and SlidePlan IDs;
- planner/prompt/model versions;
- factual coverage summary.

### SlidePlan

- index and functional purpose;
- conclusion-style title intent;
- one key message;
- evidence node IDs;
- content units;
- desired visual type;
- slot/cardinality requirements;
- density budget;
- speaker note;
- mandatory/optional flags.

### VariantSpec

- one of `faithful`, `balanced`, `visual`, or custom;
- declared difference axis;
- layout/density/order/visualization weights;
- invariant evidence/claims;
- random seed and config version.

### GenerationRun

- project/input/version references;
- job ID and current state;
- three variant IDs;
- stage attempts, timings and usage;
- parent run for reruns;
- immutable completion summary.

### DeckArtifact / SlideArtifact

Deck:

- variant, native PPTX artifact ID;
- ordered slide IDs;
- package validation and editability summary.

Slide:

- index, source exemplar/layout IDs;
- source and output part IDs;
- scene/render artifacts;
- applied content mapping and repair revisions.

### AuditRun

- deck revision;
- rule/config/prompt/model versions;
- deterministic/contextual status;
- issue IDs;
- summary by severity/type;
- timings and failures.

### AuditIssue

- stable rule code;
- deterministic flag;
- severity: `info|warning|error|blocker`;
- slide and shape IDs;
- optional normalized bbox;
- message, measured/threshold values;
- evidence and confidence;
- repairability;
- proposed RepairAction types;
- status: open/selected/fixed/dismissed/unresolved.

### RepairSelection / RepairAction

Selection references explicit issue IDs and requested user choices.

Action registry:

- `shorten_text`, `rewrite_title`, `split_slide`, `merge_slide`;
- `swap_exemplar`, `move_shape`, `resize_shape`, `align_shapes`;
- `map_font`, `map_color`, `recrop_image`, `replace_visual`;
- `clone_group`, `remove_group`, `add_chart_metadata`;
- `reorder_slides`, `remove_placeholder`, `native_rebuild`.

Every action has typed parameters, preconditions, postconditions and target IDs.

### ExportArtifact

- format `pptx|pdf|html|quality_passport`;
- source deck revision;
- artifact ID, checksum, MIME, size;
- renderer/exporter version;
- warnings.

### QualityPassport

- run/template/content/config/model/prompt hashes;
- technical validity;
- content support;
- style fidelity;
- readability;
- editability/PEI;
- unresolved issues and fallbacks;
- per-stage timings/tokens/cost;
- per-slide confidence;
- export checksums.

### SkillVersion / PromptVersion / ModelProfile

All have stable ID, semantic version, checksum, license/source metadata, compatibility range and creation timestamp.

### Job / JobEvent / StageAttempt

Job has state, requested operation, idempotency key, input IDs, cancellation flag and result/error.

Event has job ID, sequence, timestamp, type, stage, progress, safe message, artifact IDs and structured safe data.

Attempt has stage version, start/end, cache key, worker ID, retry number, status, metrics and typed failure.

## 4. Key invariants

1. Template originals and original content sources are immutable.
2. Three variants reference the same Evidence Graph revision.
3. No unsupported claim can pass content audit as supported.
4. Model output cannot enter domain state before schema validation.
5. Token/secret fields cannot be serialized to DB/events/artifacts.
6. Repairs create a new slide/deck revision.
7. Audit issues reference the exact deck revision they inspected.
8. Output PPTX package must pass relationship/content-type validation before completion.
9. A completed run has exactly three variants unless explicitly configured otherwise outside official mode.
10. Official mode fixes target slide count to 10–15 and enforces all blocking rules.
