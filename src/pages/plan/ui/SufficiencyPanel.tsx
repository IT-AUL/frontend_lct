import { CONTENT_FILL_MODES, type ContentFillMode, type PlanSufficiency } from '@/entities/generation'
import { pluralize } from '@/shared/lib/format'
import { Button } from '@/shared/ui'
import styles from './PlanPage.module.css'

export interface PlanAdjustment {
  contentFill?: ContentFillMode
  slideCount?: number
}

interface SufficiencyPanelProps {
  sufficiency: PlanSufficiency | null
  contentFill: ContentFillMode | null
  targetSlides: number
  maxSlides: number
  minSlides: number
  disabled: boolean
  onAdjust: (adjustment: PlanAdjustment) => void
}

const slidesWord = (count: number) => pluralize(count, ['слайд', 'слайда', 'слайдов'])

function summary(sufficiency: PlanSufficiency, target: number): string {
  const content = sufficiency.contentSlides
  if (sufficiency.status === 'ok') return `Вашего контента хватает на ${target} ${slidesWord(target)}.`
  if (content === null) return sufficiency.status === 'short' ? 'Вашего контента меньше, чем нужно на эту колоду.' : 'Вашего контента больше, чем помещается в эту колоду.'
  return sufficiency.status === 'short'
    ? `Вашего контента хватает примерно на ${content} ${slidesWord(content)} из ${target}.`
    : `Вашего контента примерно на ${content} ${slidesWord(content)}, а в колоде ${target}.`
}

export function SufficiencyPanel({ sufficiency, contentFill, targetSlides, maxSlides, minSlides, disabled, onAdjust }: SufficiencyPanelProps) {
  const content = sufficiency?.contentSlides ?? null
  const target = sufficiency?.targetSlides ?? targetSlides
  const clamp = (value: number) => Math.min(maxSlides, Math.max(minSlides, value))

  return (
    <section className={styles.sufficiency} aria-label="Объём контента">
      {sufficiency && (
        <div className={styles.sufficiencyRow} data-status={sufficiency.status}>
          <p className={styles.sufficiencyText}>{summary(sufficiency, target)}</p>
          {sufficiency.status === 'short' && (
            <div className={styles.sufficiencyActions}>
              <Button variant="primary" size="sm" disabled={disabled} onClick={() => onAdjust({ contentFill: 'expand', slideCount: target })}>
                Дополнить до {target}
              </Button>
              {content !== null && content < target && (
                <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAdjust({ slideCount: clamp(content) })}>
                  Сократить до {clamp(content)}
                </Button>
              )}
            </div>
          )}
          {sufficiency.status === 'excess' && (
            <div className={styles.sufficiencyActions}>
              <Button variant="primary" size="sm" disabled={disabled} onClick={() => onAdjust({ contentFill: 'condense', slideCount: target })}>
                Ужать до {target}
              </Button>
              {content !== null && content > target && (
                <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAdjust({ slideCount: clamp(content) })}>
                  Увеличить до {clamp(content)}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <div className={styles.fills} role="group" aria-label="Что делать с текстом">
        <span className={styles.fillsLabel}>Текст:</span>
        {CONTENT_FILL_MODES.map((mode) => (
          <button key={mode.value} type="button" title={mode.hint} aria-pressed={contentFill === mode.value} disabled={disabled} onClick={() => onAdjust({ contentFill: mode.value })}>
            {mode.label}
          </button>
        ))}
      </div>
    </section>
  )
}
