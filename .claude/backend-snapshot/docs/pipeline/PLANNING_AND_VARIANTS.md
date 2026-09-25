# Planning and Variants

Owner: Agent 3.

## 1. Goal

Produce a source-grounded storyline (DeckPlan) and three differentiated VariantSpecs before any layout work. Content decisions and visual decisions are separated.

Текущий срез: DeckPlan строится детерминированно (`plan_deck`) или через
опциональный LLM-путь (`plan_deck_llm`, честный fallback на
детерминированный), и `strategy` реально дифференцирует выход — три
побитово разных варианта (OR-007: faithful без agenda/recap, visual —
rerank exemplar-пула по `visual_richness` + кап body-текста). Один прогон
`generate()` выдаёт один вариант; три варианта — серийно
(`POST /generations`, `benchmark --variants`). EvidenceGraph строится
(`planning/evidence.py`). LLM top-k reranking candidate pool — roadmap §7.

## 2. Storyline stage — реализовано детерминированно

`backend/deckdna/planning/story_director.py`
(`story-director/deterministic-0.1.0`): ContentPack + Brief → DeckPlan
по `schemas/deck-plan.schema.json`, **без LLM-звонков** — тот же
выходной контракт, что описан ниже, наполнение правилами:

- секции ContentPack распределяются по слайдам под
  `brief.target_slide_count`; плотные секции режутся на несколько
  слайдов по границам предложений/пунктов, мелкие соседние при нехватке
  бюджета объединяются;
- заголовки секций без контента становятся `section_divider`-слайдами;
- добор до target — дивайдеры по секциям и recap-слайды (не пустые);
- `title_intent`/`key_message` берутся из заголовка/первого
  предложения секции; purpose секции угадывается по ключевым словам
  (ru/en) — честная эвристика, не LLM;
- каждый SlidePlan несёт `evidence_ids` — ссылки на секции/блоки
  ContentPack (EvidenceGraph реально строится и используется LLM-планнером и
  contextual-аудитом; `evidence_ids` пока ссылаются на id секций/блоков
  пака, не на узлы графа. Инвариант «факты неизменны» сейчас выполняется
  тем, что текст копируется из пака дословно).

Бюджеты: `default_slide_count=12`, диапазон `min_slides=10`,
`max_slides=15` (`configs/generation.default.yaml`), до 5 content units
на слайд. Инвариант `slides==target` жёсткий и осознанно не ослаблен.

Plan validation (deterministic) — `planning/validation.py`:

- JSON-schema валидация DeckPlan (реально прогоняется, не стаб);
- `validate_slide_count` — target в конфигурируемом диапазоне;
- coverage/структурные проверки секций и units.

Известные честные ограничения v0 (зафиксированы в коде, схему не
трогаем): `ContentUnit.kind` не покрывает код/источники — code-блоки
мапятся в `paragraph`; `evidence_ids` указывают на ContentPack, а не на
узлы графа.

## 3. VariantSpec generation — реализовано (детерминированный MVP)

`contracts.variant_spec.Strategy` (faithful/balanced/visual/custom)
проброшен через `VariantRequest.strategy` до `generate(strategy=)`;
веса ниже — целевые defaults на одном EvidenceGraph:

| Strategy | Axis | Weights |
|---|---|---|
| `faithful` | exemplar fidelity | fidelity 0.9, novelty 0.1, text_density 0.5 |
| `balanced` | layout diversity | fidelity 0.6, novelty 0.5, chart_pref 0.5 |
| `visual` | visualization emphasis | fidelity 0.4, novelty 0.7, chart_pref 0.9, text_density 0.35 |

Правила вариантов остаются целевыми: факты/числа инвариантны; различия
≥40% exemplar choices или ≥30% смен visualization type;
`difference_axis.description` — user-visible текст.

Реальность (OR-007): strategy меняет поведение пайплайна — faithful:
`plan_deck` без agenda-слайда и recap-инъекций; balanced: дефолт;
visual: exemplar-пул переранжирован по `visual_richness` + кап
body-текстов (честный `dropped_units["text"]`); custom = balanced.
Три варианта побитово различны (sha256-верифицировано); у visual план
== balanced (различие на exemplar/composing). `GenerationConfig`
содержит профиль официального режима (3 variants, 10–15 slides,
all audits) — флаг зарезервирован, отдельного enforcement нет.

## 4. Candidate retrieval — roadmap

Детерминированный фильтр + скоринг по весам VariantSpec
(`w_role·role_match + w_capacity·capacity_fit + w_style·style_coherence
+ w_novelty·cluster_novelty + w_rhythm·sequence_fit`), top-k=5, опционный
VLM-реранкер по эскизам exemplar; fallback — чистый детерминизм с
disclosure в паспорте.

Реальность: compose берёт слайды-источники напрямую из DeckPlan
(`pptx/composing/minimal.py`), но с capability-aware выбором —
`slide_capabilities` предпочитает слайды, реально несущие
`a:tbl`/`c:chart`/`a:blip`, и visual-стратегия реранкит пул по
`visual_richness`; полноценного скоринга по весам VariantSpec
(top-k=5, VLM-реранкер) нет.

## 5. Deck rhythm — частично в story_director

- дивайдеры по секциям (при нехватке бюджета объединяются) — есть;
- «не более 2 плотных подряд», closing/title exemplar selection —
  roadmap (зависит от exemplar-ролей autopsy).

## 6. Acceptance vs current

| План | Сейчас |
|---|---|
| Same inputs → same base DeckPlan | выполняется детерминизмом (LLM нет вовсе) |
| Три структурно различающихся варианта | выполняется (OR-007): детерминированная дифференциация по strategy, sha256-различные выходы |
| Evidence coverage invariant | текст копируется из ContentPack дословно; EvidenceGraph строится и используется downstream (LLM-план, contextual-аудит) |
| Plan validator | schema + slide_count работают; empty `evidence_ids` сейчас допустимы — они честно ссылаются на ContentPack |
| Retrieval не отдаёт preserve_only exemplar | retrieval-слоя нет — roadmap |

## 7. Roadmap (что вернуть)

1. ~~EvidenceGraph~~ — построен (`planning/evidence.py`); остаётся:
   `evidence_ids` → узлы графа вместо id секций/блоков пака.
2. ~~Три VariantSpec~~ — детерминированная дифференциация реализована
   (OR-007); остаются структурные difference-метрики и реальные веса.
3. Candidate retrieval + скоринг по весам; VLM-rerank как опциональный
   слой (capability-aware выбор — частичный задел).
4. Rhythm-правила по exemplar-ролям (dense-чередование, closing).
