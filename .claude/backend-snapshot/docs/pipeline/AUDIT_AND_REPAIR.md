# Audit and Repair

Owner: Agent 3 (rules/orchestration) + Agent 2 (geometry/package measurement primitives).

## 1. Architecture

```text
DeckArtifact (.pptx)
  └── audit.basic.audit_deck(path) → list[AuditIssue]  (deterministic=true)

audit issues → plan_repairs → RepairAction[] + unresolved{issue_id: причина}
            → apply_repairs → ApplyReport{applied/skipped/failed/not_implemented}
            → повторный audit_deck на сохранённой колоде
```

Текущий срез: deterministic-правила по фактам пакета (python-pptx
scene graph + нормализованная геометрия bbox [0,1]) плюс реализованный
contextual VLM-слой (`audit/contextual.py`, подключён к
`generate(gateway=)`/`--llm`/`use_llm`; верифицирован только на
MockProvider — живой VK endpoint не опубликован).

## 2. Deterministic rules — реализовано 24/~30

`backend/deckdna/audit/basic.py`, кортеж `RULES` — 24 правила.
Таблица ниже перечисляет первые 10; остальные 14
(`accessibility.contrast`, `text.font_floor`, `density.bullet_length`,
`density.table_size`, `template.font_family`, `density.chart_series`,
`density.occupancy`, `template.font_scale`, `template.color_palette`,
`integrity.package`, `chart.metadata`, `template.anchor_position`,
`text.slide_clip`, `template.layout_origin`) — с гейтами, порогами и
severities — в каноническом реестре `docs/AUDIT.md`. Все правила выдают
`AuditIssue(deterministic=true)` с measured_value, threshold, evidence и
нормализованным bbox для UI-overlay. Пороги — не константы в коде:
`configs/audit.default.yaml` загружается в рантайме через
`audit/config.py` (паттерн `planning/config.py`, package-relative path);
`audit_deck(path, config=...)` принимает другой профиль явно.

| rule_code | severity | Что меряет |
|---|---|---|
| `text.overflow` | error | Оценка высоты/ширины текста по метрикам шрифта (DejaVu/Liberation) vs usable рамка; per-axis ratio в evidence |
| `integrity.empty_slide` | error | Слайд без видимого контента (нет текста и контентных фигур) |
| `image.aspect_ratio` | error | Отображаемый aspect картинки vs исходный (crop-aware), допуск 3% |
| `editability.raster_only` | blocker | Одна картинка ≥90% площади слайда без текстовых фреймов |
| `layout.out_of_bounds` | error | Top-level bbox за границей слайда с допуском 0.5% стороны |
| `integrity.duplicate_slide` | warning | Jaccard ≥0.9 по нормализованным текстовым токенам пары слайдов |
| `integrity.placeholder_text` | error | Двухъярусно: STRONG-маркер в тексте (lorem/TODO/click to add) или весь фрейм — стоковая подпись («Заголовок», «Текст»…) |
| `density.bullet_count` | warning | >6 буллет-параграфов (buChar/buAutoNum) в одном txBody |
| `layout.unintended_overlap` | error | Частичное пересечение двух текстонесущих фигур: 25–90% площади меньшей; гейты — фон ≥80%, акцент <1%, вложенность ≥90% |
| `layout.edge_margin` | warning | Текстонесущая фигура прижата к краю (<3% зазор); гейты — placeholder, фон, акцент, edge-to-edge ≥95% |

Общие честные ограничения детекторов:

- консервативные гейты «намеренности» — лучше пропустить сомнительное,
  чем флагнуть декор (фоновые плашки, акценты, вложенность, текст
  поверх картинки);
- `out_of_bounds`/`unintended_overlap` работают по top-level шейпам —
  у children групп координаты в child space; `edge_margin` использует
  `_iter_bbox` и видит children в slide-space;
- overlap ловит только текст↔текст частичное перекрытие: текст поверх
  картинки — дизайн-приём, две не-текстовых фигуры — коллаж/декор.

### Спроектировано, не реализовано (roadmap)

Из deterministic-кандидатов Appendix остаётся только
`layout.guide_alignment` — честный пропуск: ни в одной фикстуре нет
`custGuideLst`, проверять нечего. Остальные нереализованные коды —
contextual (VLM-слой ниже). Спецификации —
`docs/requirements/OFFICIAL_TRACEABILITY.md` Appendix.

## 3. Contextual rules (10 official questions) — реализовано

`audit/contextual.py::run_contextual_audit` — VLM per slide (rendered
PNG через soffice→pdftoppm + текст + title_intent + evidence_excerpt из
EvidenceGraph), все 10 вопросов из
`prompts/contextual_audit/slide_checks.v1.yaml`; выход
`{verdict, rationale, confidence}`, `fail`+confidence≥0.5 → issue,
`uncertain` — честно не issue. Подключено к `generate(gateway=)` /
`deckdna generate --llm` / `POST /generations {"use_llm": true}`.
Честная граница: живого VK endpoint нет — прогоны только на
MockProvider. Ещё не wired: `uncertain`+error → warning + disclosure
(нет disclosure-поля в AuditIssue); `content.source_support` как
детерминированная сверка чисел слайда с EvidenceGraph;
`content.spelling` через hunspell/pymorphy; `content.prompt_leakage` —
детерминированный скан маркеров.

## 4. Repair planner — реализовано

`backend/deckdna/repair/planner.py`: `plan_repairs` /
`plan_repairs_with_report(issues) → RepairPlanReport{actions,
planned_issue_ids, unresolved}`.

Маппинг rule → действие:

| rule_code | action_type | Детерминизм |
|---|---|---|
| `text.overflow` | `resize_shape` | расширение рамки по per-axis ratio из evidence, зажим в [0,1] |
| `image.aspect_ratio` | `recrop_image` | keep_aspect: центр-кроп к aspect рамки |
| `integrity.empty_slide` | `merge_slide` | смержить в предыдущий слайд |
| `editability.raster_only` | `native_rebuild` | флаг для ручного решения (executor не реализован — честный not_implemented) |
| `layout.out_of_bounds` | `resize_shape` | bbox зажат в [0,1] (move+resize одной записью a:xfrm) |
| `integrity.duplicate_slide` | `merge_slide` | в исходный слайд из evidence `vs slide[N]`; ≤10% токенов может отличаться — precondition честный |
| `integrity.placeholder_text` | `remove_placeholder` | STRONG-маркер в длинном тексте — precondition предупреждает о риске контента |
| `layout.edge_margin` | `move_shape` | сдвиг прижатой стороны ровно до EDGE_MARGIN; фигура шире внутренней полосы → unresolved |
| `template.anchor_position` | `resize_shape` | возврат `a:xfrm` на declared-позицию — issue несёт declared-геометрию в EMU |
| `text.slide_clip` | `move_shape` + цепочечный `shorten_text` | move только при однозначном вертикальном вылете (anchor t/b); shorten — самопроверяющийся: влезший в рамку текст за край не выйдет |
| `template.font_family` | `map_font` | лишние `a:latin` typeface'ы (сверх `max_font_families` частотных) переписываются на доминирующий или params.font_family |
| `template.color_palette` | `map_color` | каждая offending явная заливка → `a:srgbClr` ближайшего по ΔE слота `clrScheme` темы (или params.color); логика offenders та же, что у детектора |

Без маппинга (явные причины через `_UNRESOLVED_REASONS`):

| rule_code | Причина |
|---|---|
| `layout.unintended_overlap` | какую фигуру и куда двигать — решение дизайнера (нужен layout-reflow, не типизированный action) |
| `density.bullet_count`, `density.bullet_length`, `density.table_size`, `density.chart_series`, `density.occupancy`, `text.font_floor`, `accessibility.contrast`, `template.font_scale`, `integrity.package`, `chart.metadata`, `template.layout_origin` | нужны недетерминируемые решения (split/merge рядов, reflow, перепись структуры пакета) — отдельная итерация; все contextual-коды — то же |

Порядок выдачи: blocker → error → warning → info. Issue без маппинга,
без slide_id или с repairable=False попадает в `unresolved` с честной
причиной — ничего не проглатывается.

## 5. Repair execution — реализовано

`backend/deckdna/repair/apply.py`: `apply_repairs(pptx, actions, out)` —
мутация пакета на уровне python-pptx, отчёт per-action.

Исполнители (`_IMPLEMENTED`, 8 типов):

- `resize_shape` — off/ext из params.bbox [0,1], зажим в границы слайда
  (не порождает out_of_bounds взамен overflow);
- `move_shape` — только off, ext сохраняется; позиция зажата в
  [0, extent−size] (не порождает out_of_bounds взамен edge_margin);
- `recrop_image` — симметричный a:srcRect к aspect рамки относительно
  уже наложенного кропа;
- `remove_placeholder` — очистка runs текстового фрейма;
- `merge_slide` — удаление записи из sldIdLst + drop_rel; сиротский
  slide-парт и уникальные медиа не сериализуются;
- `shorten_text` — обрезка runs по фактической вместимости рамки
  (резидуальный `text.overflow`, цепочка за `slide_clip`).
- `map_font` — переписывает лишние `a:latin/@typeface` в непустых
  runs адресатов (то же множество, что у детектора) на доминирующий
  typeface или `params.font_family`;
- `map_color` — заменяет каждый offending color-element в `p:spPr`/`a:rPr`
  на `a:srgbClr` ближайшего по ΔE (CIE76) слота `clrScheme` темы слайда
  (или `params.color`); переиспользует `_theme_palette`/`_delta_e`
  из audit.basic.

Статусы честные: `applied` / `skipped` (нет адресата/параметров) /
`failed` (исключение per-action, не роняет отчёт) / `not_implemented`
(executor отсутствует — issue остаётся open).

CLI: `deckdna repair deck.pptx [--out path]` — audit → plan → apply →
re-audit, JSON с issues до/после и счётчиками по типам.

Roadmap по исполнению: зависимость правил при re-audit (сейчас полный
повторный прогон), `repair.diff` артефакт, итерационный цикл
(max_iterations), split_slide/native_rebuild/align_shapes, новые
executor-типы для оставшихся немапленных правил (reflow, split/merge рядов, repack).

## 6. Тесты

- Seeded-defect тесты на каждое правило: заведомо плохая и хорошая
  фикстуры, собранные python-pptx на лету (`tests/audit/`).
- Golden-счётчики на organizer-шаблонах + synthetic_unseen
  (`test_golden_organizer_templates.py`, `tests/cli/test_cli.py::
  AUDIT_GOLDEN`) — регрессия детекторов по реальным файлам.
- Planner: synthetic issues + реальные issues фикстур, честность
  unresolved; executor: реальная мутация + re-audit
  (`tests/repair/`).
- `test_repair_does_not_add_issues` (regression): residual-issue
  неожиданный только если исправим end-to-end сегодня (маппинг есть и
  все proposed_actions реализованы).

## 7. Acceptance vs current

| План | Сейчас |
|---|---|
| Full Appendix coverage | 24/~30 deterministic правил (единственный пропуск — `layout.guide_alignment`, нет guides в фикстурах); contextual-слой реализован и подключён, верифицирован на MockProvider |
| UI overlay (slide, bbox, severity) | есть у всех geometry-issues (bbox [0,1]) |
| Repair loop bounded, не скрывает issues | выполняется: unresolved/not_implemented честно репортятся, не скрываются |
| Seeded-defect ≥95% detection | seeded-тесты на каждое из 24 правил зелёные; формальный % gate не включён (один класс дефекта на правило) |
| unchanged slides byte-identical после subset-repair | не замеряется — roadmap (per-slide dirty map отсутствует) |
