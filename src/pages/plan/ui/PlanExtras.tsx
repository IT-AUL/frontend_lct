import type { ContentFillMode, PlanSufficiency, ResearchSource } from '@/entities/generation'
import { pluralize } from '@/shared/lib/format'
import { Button, Icon, X } from '@/shared/ui'
import styles from './PlanPage.module.css'

export interface PlanAdjustment {
  contentFill?: ContentFillMode
  slideCount?: number
}

interface PlanExtrasProps {
  sufficiency: PlanSufficiency | null
  sources: readonly ResearchSource[]
  targetSlides: number
  disabled: boolean
  onAdjust: (adjustment: PlanAdjustment) => void
  onRemoveSource: (sourceId: string) => void
}

export function PlanExtras({ sufficiency, sources, targetSlides, disabled, onAdjust, onRemoveSource }: PlanExtrasProps) {
  const content = sufficiency?.contentSlides ?? null
  const isShort = content !== null && content < targetSlides && sufficiency?.status === 'short'
  const isEnough = content !== null && content >= targetSlides && (sufficiency?.status === 'short' || sufficiency?.status === 'ok' || sufficiency?.status === 'excess')
  const reserve = content !== null && content > targetSlides ? `, запас — до ${content}` : ''

  return (
    <>
      {isShort && (
        <div className={styles.extra}>
          <p className={styles.extraText}>
            Материала хватает на {content} {pluralize(content, ['слайд', 'слайда', 'слайдов'])} из {targetSlides}.
          </p>
          <div className={styles.inline}>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onAdjust({ contentFill: 'expand' })}>
              Дополнить
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onAdjust({ contentFill: 'keep', slideCount: content })}>
              Сделать {content} {pluralize(content, ['слайд', 'слайда', 'слайдов'])}
            </Button>
          </div>
        </div>
      )}
      {isEnough && (
        <div className={styles.extra}>
          <p className={styles.extraText}>
            Материала достаточно для {targetSlides} {pluralize(targetSlides, ['слайда', 'слайдов', 'слайдов'])}
            {reserve}.
            {sufficiency?.status === 'excess' ? ' Самое важное оставлю, остальное сожму.' : ''}
          </p>
        </div>
      )}
      {!isEnough && sufficiency?.status === 'excess' && (
        <div className={styles.extra}>
          <p className={styles.extraText}>
            Материала больше, чем помещается в {targetSlides} {pluralize(targetSlides, ['слайд', 'слайда', 'слайдов'])}. Самое важное оставлю, остальное сожму.
          </p>
        </div>
      )}
      {sources.length > 0 && (
        <div className={styles.extra}>
          <p className={styles.extraText}>Часть фактов нашёл в интернете:</p>
          <ul className={styles.sources}>
            {sources.map((source) => (
              <li key={source.id} className={styles.source}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer noopener">
                    {source.site ?? source.title}
                  </a>
                ) : (
                  <span>{source.site ?? source.title}</span>
                )}
                <button type="button" className={styles.iconButton} disabled={disabled} aria-label={`Не использовать ${source.site ?? source.title}`} onClick={() => onRemoveSource(source.id)}>
                  <Icon as={X} size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
