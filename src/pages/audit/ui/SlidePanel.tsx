import { useState } from 'react'
import { useRegenerateSlide, useSlideExplain } from '@/entities/assistant'
import { useContentPack } from '@/entities/content-pack'
import { parseResearch, useGeneration } from '@/entities/generation'
import { useVariantSlides } from '@/entities/variant'
import { isApiError, humanError } from '@/shared/api'
import { Button, useToast } from '@/shared/ui'
import { contentPackSourceMap } from '@/widgets/deck-plan'
import { buildExplainView, buildReworkChips, buildSlideNotesView, findPlanSlide, findSlideAt, type ReworkChip } from '../model/slideModel'
import styles from './SlidePanel.module.css'

interface SlidePanelProps {
  runId: string
  variantId: string
  strategy: string
  slideNumber: number
}

const errorText = (error: unknown) => humanError(error)

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
  const contentPack = useContentPack(generation.data?.content_pack_id)
  const headings = contentPackSourceMap(contentPack.data, generation.data?.deck_plan)
  const explainDatasetLabel = explain.data?.dataset?.title?.trim() || explain.data?.dataset?.file?.trim()
  if (explainDatasetLabel) {
    if (explain.data?.dataset?.id) headings.set(explain.data.dataset.id, explainDatasetLabel)
    if (!headings.has('ds:*')) headings.set('ds:*', explainDatasetLabel)
  }
  const research = parseResearch((generation.data?.deck_plan as unknown as Record<string, unknown> | undefined)?.research)?.sources ?? []
  const notes = buildSlideNotesView(planSlide, view, headings, research)
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

  const slideTitle = slide?.title ?? null
  const why = view.hasChart
    ? (view.whySummary ?? 'График подобран под структуру данных и задачу сравнения.')
    : (notes.keyMessage
        ? `Ключевой тезис: «${notes.keyMessage}». Макет подобран под роль слайда и плотность пунктов с сохранением шрифтовой шкалы шаблона.`
        : view.fallbackNote)

  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="slide-rework">
        <h3 id="slide-rework" className={styles.heading}>
          Переделать слайд {slideNumber}
        </h3>
        <p className={styles.text}>
          {slideTitle ? `«${slideTitle}» — пересоберу только его, остальные слайды не изменятся.` : 'Остальные слайды не изменятся.'}
        </p>
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
        {view.exemplarLabel && <p className={styles.badge}>{view.exemplarLabel}</p>}
        <p className={styles.text}>{why}</p>
        {view.hasChart && view.chosenLabel && (
          <p className={styles.muted}>
            Вид визуализации: {view.chosenLabel}
            {view.taskText ? ` · ${view.taskText}` : ''}
          </p>
        )}
        {view.datasetLabel && <p className={styles.muted}>Данные: {view.datasetLabel}</p>}
        {view.reasons.length > 0 && (
          <ul className={styles.list}>
            {view.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
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
      </section>

      <section className={styles.section} aria-labelledby="slide-notes">
        <h3 id="slide-notes" className={styles.heading}>
          Заметки докладчика
        </h3>
        {notes.origins.length > 0 && (
          <div className={styles.origins}>
            {notes.origins.map((origin) => (
              <span key={origin.kind} className={styles.badge}>
                {origin.label}
              </span>
            ))}
          </div>
        )}
        <p className={styles.text}>
          {notes.speakerNote ??
            (notes.keyMessage
              ? `Сделайте акцент на главном выводе: ${notes.keyMessage}`
              : 'Отдельные заметки для этого слайда не заданы — опирайтесь на заголовок и тезисы слайда.')}
        </p>
        {notes.sources.length > 0 && (
          <p className={styles.muted}>Опирается на: {notes.sources.map((source) => source.label).join(', ')}</p>
        )}
      </section>
    </div>
  )
}
