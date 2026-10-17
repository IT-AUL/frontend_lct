import { useState } from 'react'
import { useRegenerateSlide, useSlideExplain } from '@/entities/assistant'
import { useGeneration } from '@/entities/generation'
import { useVariantSlides } from '@/entities/variant'
import { isApiError } from '@/shared/api'
import { Button, Skeleton, useToast } from '@/shared/ui'
import { buildExplainView, buildReworkChips, findPlanSlide, findSlideAt, type ReworkChip } from '../model/slideModel'
import styles from './SlidePanel.module.css'

interface SlidePanelProps {
  runId: string
  variantId: string
  strategy: string
  slideNumber: number
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : 'неизвестная ошибка')

const DONE_NOTE: Record<string, string> = {
  shorter: 'Сократил текст на слайде.',
  other_layout: 'Поменял раскладку слайда.',
  other_chart: 'Поменял график на слайде.',
}

export function SlidePanel({ runId, variantId, strategy, slideNumber }: SlidePanelProps) {
  const toast = useToast()
  const slides = useVariantSlides(variantId)
  const generation = useGeneration(runId)
  const regenerate = useRegenerateSlide(variantId)
  const slide = findSlideAt(slides.data ?? [], slideNumber)
  const planSlide = findPlanSlide(generation.data?.deck_plan, slide, slideNumber)
  const explain = useSlideExplain(slide?.id)
  const view = buildExplainView(explain.data, planSlide, slide)
  const chips = buildReworkChips(strategy, view.alternatives, view.hasChart)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [rejected, setRejected] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [note, setNote] = useState<string | null>(null)

  const rework = async (chip: ReworkChip) => {
    const slideId = slide?.id ?? planSlide?.id
    if (!slideId || pendingKey) return
    setPendingKey(chip.key)
    setNote(null)
    try {
      const result = await regenerate.mutateAsync({ slideId, action: chip.action, ...(chip.chartType ? { chart_type: chip.chartType } : {}) })
      if (!result) {
        setUnsupported(true)
        return
      }
      const message = result.assistant_note ?? DONE_NOTE[chip.action] ?? 'Пересобрал слайд в выбранном стиле.'
      setNote(message)
      toast.show(message)
    } catch (error) {
      if (isApiError(error) && error.status === 422) setRejected((current) => new Map(current).set(chip.key, errorText(error)))
      else toast.show(`Не удалось переделать слайд: ${errorText(error)}`)
    } finally {
      setPendingKey(null)
    }
  }

  const why = view.hasChart ? (view.whySummary ?? 'График подобран под структуру данных.') : view.fallbackNote

  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="slide-rework">
        <h3 id="slide-rework" className={styles.heading}>
          Переделать слайд {slideNumber}
        </h3>
        <p className={styles.text}>Остальные слайды не изменятся.</p>
        {unsupported ? (
          <p className={styles.text} role="status">
            Сервер пока не умеет пересобирать один слайд.
          </p>
        ) : (
          <div className={styles.actions}>
            {chips.map((chip) => (
              <Button
                key={chip.key}
                size="sm"
                variant="secondary"
                disabled={pendingKey !== null || rejected.has(chip.key)}
                aria-busy={pendingKey === chip.key || undefined}
                title={rejected.get(chip.key) ?? chip.title}
                onClick={() => void rework(chip)}
              >
                {pendingKey === chip.key ? 'Переделываю…' : chip.label}
              </Button>
            ))}
          </div>
        )}
        {note && (
          <p className={styles.note} role="status">
            {note}
          </p>
        )}
      </section>

      <section className={styles.section} aria-labelledby="slide-why">
        <h3 id="slide-why" className={styles.heading}>
          Почему так
        </h3>
        {explain.isPending && slide?.id ? (
          <Skeleton style={{ height: 48 }} />
        ) : (
          <>
            <p className={styles.text}>{why}</p>
            {view.datasetLabel && <p className={styles.muted}>Данные: {view.datasetLabel}</p>}
            {view.rejected.length > 0 && (
              <details className={styles.details}>
                <summary>Почему не другие графики</summary>
                <ul>
                  {view.rejected.map((item) => (
                    <li key={item.type}>
                      {item.label}: {item.reason ?? 'не подходит под структуру данных'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  )
}
