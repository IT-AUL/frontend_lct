import { isEditableUnit, type DeckPlan, type SlidePlan } from '@/entities/generation'
import type { QuickSlideAction, SlidePatch } from '@/features/edit-deck-plan'
import { Button, Icon, X } from '@/shared/ui'
import { availableQuickActions, EDITOR_VISUALS, parseSlideChartView, VISUAL_LABEL } from '@/widgets/deck-plan'
import styles from './PlanPage.module.css'

const ACTION_LABEL: Partial<Record<QuickSlideAction, string>> = {
  shorten: 'Сократить',
  split: 'Разбить на два',
  merge_next: 'Объединить со следующим',
}

interface SlideEditorProps {
  plan: DeckPlan
  slide: SlidePlan
  first: boolean
  last: boolean
  researching: boolean
  canResearch: boolean
  onUpdate: (patch: SlidePatch) => void
  onUnitChange: (position: number, text: string) => void
  onUnitAdd: () => void
  onUnitRemove: (position: number) => void
  onMove: (delta: -1 | 1) => void
  onChart: (type: string) => void
  onAction: (action: QuickSlideAction) => void
  onResearch: () => void
  onKeep: () => void
}

export function SlideEditor(props: SlideEditorProps) {
  const { plan, slide, first, last, researching, canResearch, onUpdate, onUnitChange, onUnitAdd, onUnitRemove, onMove, onChart, onAction, onResearch, onKeep } = props
  const units = slide.content_units.map((unit, position) => ({ unit, position })).filter(({ unit }) => isEditableUnit(unit))
  const chart = parseSlideChartView(slide)
  const actions = availableQuickActions(plan, slide.id).filter((action) => ACTION_LABEL[action as QuickSlideAction])
  const visual = slide.desired_visual ?? 'none'

  return (
    <div className={styles.editor}>
      {slide.supports_key_message === false && (
        <div className={styles.offTopic}>
          <p>Этот слайд уводит от главной мысли.</p>
          <div className={styles.inline}>
            <Button variant="secondary" size="sm" onClick={() => onAction('remove')}>
              Убрать
            </Button>
            <Button variant="ghost" size="sm" onClick={onKeep}>
              Оставить
            </Button>
          </div>
        </div>
      )}

      <label className={styles.field}>
        <span>Заголовок — вывод слайда</span>
        <input className={styles.input} value={slide.title_intent} onChange={(event) => onUpdate({ title_intent: event.target.value })} />
      </label>

      <div className={styles.field}>
        <span>Пункты</span>
        <ul className={styles.units}>
          {units.map(({ unit, position }, order) => (
            <li key={position} className={styles.unit}>
              <textarea
                className={styles.input}
                rows={2}
                value={unit.text ?? ''}
                aria-label={`Пункт ${order + 1}`}
                onChange={(event) => onUnitChange(position, event.target.value)}
              />
              <button type="button" className={styles.iconButton} aria-label={`Убрать пункт ${order + 1}`} onClick={() => onUnitRemove(position)}>
                <Icon as={X} size={14} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.link} onClick={onUnitAdd}>
          Добавить пункт
        </button>
      </div>

      <div className={styles.field}>
        <span>Что показать</span>
        <div className={styles.chips} role="radiogroup" aria-label="Что показать на слайде">
          {EDITOR_VISUALS.map((option) => (
            <button key={option} type="button" role="radio" aria-checked={visual === option} className={styles.chip} onClick={() => onUpdate({ desired_visual: option })}>
              {VISUAL_LABEL[option] ?? option}
            </button>
          ))}
        </div>
      </div>

      {chart && (
        <div className={styles.field}>
          <span>График</span>
          <p className={styles.hint}>{chart.why}</p>
          {chart.options.length > 1 && (
            <div className={styles.chips} role="radiogroup" aria-label="Тип графика">
              {chart.options.map((option) => (
                <button key={option.type} type="button" role="radio" aria-checked={option.active} className={styles.chip} onClick={() => !option.active && onChart(option.type)}>
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {visual === 'chart' && !chart && canResearch && (
        <div className={styles.field}>
          <span>Для графика нужны числа</span>
          <Button variant="secondary" size="sm" disabled={researching} onClick={onResearch}>
            {researching ? 'Ищу…' : 'Найти цифры'}
          </Button>
        </div>
      )}

      <div className={styles.inline}>
        {actions.map((action) => (
          <Button key={action} variant="secondary" size="sm" onClick={() => onAction(action as QuickSlideAction)}>
            {ACTION_LABEL[action as QuickSlideAction]}
          </Button>
        ))}
      </div>

      <div className={styles.inline}>
        <Button variant="ghost" size="sm" disabled={first} onClick={() => onMove(-1)}>
          Выше
        </Button>
        <Button variant="ghost" size="sm" disabled={last} onClick={() => onMove(1)}>
          Ниже
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAction('remove')}>
          Убрать слайд
        </Button>
      </div>
    </div>
  )
}
