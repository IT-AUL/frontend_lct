# 16 · Правки для бэкенда (передать команде DeckDNA)

Собрано по реальным прогонам API (`main` @ `931ad6f`, 25.09.2026; шаблон «VK Tech шаблон.pptx»,
контент `tests/fixtures/content/deckdna_pitch_rich.md`, 3 варианта без LLM — **8,2 с**).
Фронт уже работает с текущим API. Пункты ниже открывают возможности, которые показаны в дизайне.

## Баги (воспроизводятся)

| # | Что | Как воспроизвести | Ожидание |
|---|---|---|---|
| B1 | `GET /audits/{id}/issues?status=dismissed` → **500 Internal Server Error** | после `POST /issues/{id}/dismiss` запросить список с фильтром по статусу | 200 и отфильтрованный список |
| B2 | После `POST /audits/{id}/repairs` у варианта пропадают PDF и паспорт: `POST /variants/{id}/exports {"formats":["pdf"]}` → 501 `not_implemented` | исправить любую проблему и запросить экспорт PDF | после repair перерендерить PDF и паспорт новой ревизии |
| B3 | `POST /generations/{id}/cancel` на **завершённом** прогоне переводит его в `canceled` | отменить уже completed-генерацию | 409 `state_conflict` (исправлено в ветке `devin/async-job-lifecycle`) |
| B5 | `repairable: true` стоит и у правил без обработчика в `repair/planner.py` (`template.font_scale`, `text.font_floor`, `density.*`, `chart.metadata`, `template.layout_origin`, `layout.unintended_overlap`, `integrity.package`) — такие проблемы уходят в `unresolved` | выбрать любую `template.font_scale` и запустить repair | `repairable` = есть обработчик в планировщике |
| B4 | В ответе `GET /audits/{id}/issues` у issues первой ревизии `deck_revision: 0`, у аудита — `1` | сравнить после генерации | одинаковая ревизия |

## Данные, которых не хватает UI (по приоритету)

1. **PNG-превью слайдов** варианта и шаблона (`preview_artifact_id`, `montage_artifact_id`), функция
   `render_slides_png` уже есть. Сейчас фронт рисует страницы из PDF через pdf.js.
2. **HTML-экспорт через API** (`render_html` уже есть, API отвечает 501).
3. **Влить `devin/async-job-lifecycle`**: сейчас `POST /generations` держит соединение до конца
   генерации; статус каждого варианта по мере готовности нужен экрану «Генерация».
4. **Итоги repair по каждой проблеме.** Job отдаёт только счётчики `applied/skipped/failed/…`.
   После repair список issues заменяется новым аудитом, а id проблем нестабильны
   (`audit:rule:s{slide}:{n}`). Нужен результат по каждой выбранной проблеме
   (`fixed | failed | skipped`, выполненное действие, причина неудачи) и стабильный
   идентификатор проблемы между ревизиями (например, хэш rule_code + slide + shape_ids).
5. **Design DNA почти пустая**: `declared.layouts[*]` — `unresolved`, `observed.font_sizes`,
   `observed.colors`, `spacing`, `anchors`, `slide_roles`, `components`, `unsupported_features` —
   пустые. Богатые данные сейчас лежат в `latest_analysis.package_inventory` (`theme_palettes`,
   `observed_colors`, `observed_fonts`, `layout_usage`), и фронт берёт их оттуда. Нужно заполнить DNA:
   имена и типы макетов с плейсхолдерами (bbox), шкалу кеглей, поля и якоря (лого, колонтитул,
   номер) с `slide_coverage`, роли слайдов с confidence.
6. **Паспорт:** `style_fidelity` (palette/font/layout/anchor compliance) и `usage`
   (токены, вызовы модели) не заполняются; `timings.per_stage` нет — есть только `total_seconds`.
7. **Ручка «только план»** и генерация по присланному DeckPlan (внутри уже есть
   `generate(deck_plan=...)`) — для шага «сначала план, потом вёрстка».
8. **Список прогонов проекта** (`GET /projects/{id}/generations` или `latest_run_id` в Project).
   Сейчас фронт хранит id прогонов в браузере.
9. **`rationale` у VariantSummary** всегда `null` — нужен человеческий текст оси различий.
10. Модели в примерах и конфиге провайдера — только **≤ 35B**, Apache 2.0/MIT (ТЗ).

11. **Repair и новый аудит.** Подтвердить, что после `POST /audits/{id}/repairs` ручка
    `POST /variants/{id}/audits` отдаёт **новый** аудит ревизии, и вернуть `audit_id` новой ревизии
    явно в ответе/job repair. Фронт уже переключается на аудит из ответа repair.
12. **Dismissed после repair.** После реального repair отклонённые проблемы могут вернуться как
    `open` (новые id). Нужен перенос статуса dismissed между ревизиями (по стабильному ключу из п. 4).

## Наблюдения по качеству (для питча важно)

- 74–108 проблем на вариант (в основном `template.font_scale`, `text.overflow`,
  `accessibility.contrast`); PEI 3; `native_text_ratio` 0.48.
- Часть bbox выходит за пределы слайда (`y` > 1) — это корректные out-of-bounds, фронт их обрезает.
