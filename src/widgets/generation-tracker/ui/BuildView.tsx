import type { JobEvent } from '@/entities/assistant'
import type { DeckPlan, GenerationTracker } from '@/entities/generation'
import { formatIndex } from '@/shared/lib/format'
import { Button, SlideGrid, SlideTile } from '@/shared/ui'
import { buildStageSummary, type BuildStageSummary, type FilmstripSlot } from '../lib/filmstrip'
import type { VariantCard, VariantCardState } from '../lib/variants'
import { useBuildSlots } from '../model/buildSelection'
import styles from './BuildView.module.css'

const STATE_LABEL: Record<VariantCardState, string> = {
  pending: 'в очереди',
  queued: 'в очереди',
  running: 'собираю',
  done: 'готово',
  error: 'не получилось',
  canceled: 'остановлено',
}

interface BuildViewProps {
  tracker: GenerationTracker
  events: readonly JobEvent[]
  deckPlan: DeckPlan | null
  requestedStrategies?: readonly string[]
}

function computeProgressPercent(summary: BuildStageSummary): number {
  const [planStage, , auditStage] = summary.stages
  if (auditStage.state === 'done') return 100
  if (summary.totalSlides > 0) {
    const base = planStage.state === 'done' ? 12 : 4
    const slideShare = Math.round((summary.readySlides / summary.totalSlides) * 78)
    const auditBonus = auditStage.state === 'active' ? 6 : 0
    return Math.min(96, Math.max(base, base + slideShare + auditBonus))
  }
  return planStage.state === 'done' ? 16 : 8
}

export function BuildVariants({
  cards,
  selectedKey,
  onSelect,
  stageSummary,
  autoPolishSecondsLeft,
  onCancelAutoPolish,
}: {
  cards: readonly VariantCard[]
  selectedKey: string | null
  onSelect: (key: string) => void
  stageSummary?: BuildStageSummary
  autoPolishSecondsLeft?: number | null
  onCancelAutoPolish?: () => void
}) {
  if (cards.length === 0) return null

  const selected = cards.find((card) => card.key === selectedKey) ?? cards[0]
  const summary: BuildStageSummary =
    stageSummary ??
    buildStageSummary({
      phase: selected?.state === 'done' ? 'completed' : 'running',
      stage: selected?.variant?.stage ?? null,
      cardState: selected?.state,
      slots: [],
      hasPlan: selected?.state === 'done',
    })

  const progressPercent = computeProgressPercent(summary)
  const isCompleted = summary.stages[2].state === 'done'

  return (
    <div className={styles.sidebar}>
      <div className={styles.stagesBlock}>
        <ol className={styles.stages} aria-label="Этапы сборки">
          {summary.stages.map((stage) => (
            <li key={stage.id} className={styles.stageRow} data-state={stage.state}>
              <span className={styles.stageMain}>
                <span className={styles.stageMark} aria-hidden="true">
                  {stage.state === 'done' ? '✓' : stage.state === 'active' ? '●' : '○'}
                </span>
                <span className={styles.stageLabel}>{stage.label}</span>
              </span>
              <span className={styles.stageStatus}>{stage.statusLabel}</span>
            </li>
          ))}
        </ol>

        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Прогресс сборки"
          aria-valuemin={0}
          aria-valuemax={Math.max(summary.totalSlides, 1)}
          aria-valuenow={isCompleted ? Math.max(summary.totalSlides, 1) : summary.readySlides}
        >
          <div className={styles.progressFill} data-done={isCompleted || undefined} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {cards.length === 1 && selected ? (
        <div className={styles.singleVariant} aria-label="Стиль сборки">
          <span className={styles.variantName}>{selected.strategy.name}</span>
          <span className={styles.variantState} data-state={selected.state}>
            {STATE_LABEL[selected.state]}
          </span>
        </div>
      ) : (
        <ul className={styles.variants} aria-label="Стили сборки">
          {cards.map((card) => (
            <li key={card.key}>
              <button type="button" className={styles.variant} aria-pressed={card.key === selectedKey} onClick={() => onSelect(card.key)}>
                <span className={styles.variantName}>{card.strategy.name}</span>
                <span className={styles.variantState} data-state={card.state}>
                  {STATE_LABEL[card.state]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {typeof autoPolishSecondsLeft === 'number' && autoPolishSecondsLeft > 0 && (
        <div className={styles.autoPolishBar}>
          <span className={styles.autoPolishText}>Открою доводку через {autoPolishSecondsLeft} с</span>
          {onCancelAutoPolish && (
            <button type="button" className={styles.autoPolishStay} onClick={onCancelAutoPolish}>
              Остаться здесь
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function BuildTable({
  tracker,
  events,
  deckPlan,
  cards,
  selectedKey,
  slots: externalSlots,
  selectedSlideIndex = null,
  onSelectSlide,
}: BuildViewProps & {
  cards: readonly VariantCard[]
  selectedKey: string | null
  slots?: readonly FilmstripSlot[]
  selectedSlideIndex?: number | null
  onSelectSlide?: (index: number) => void
}) {
  const internal = useBuildSlots({ tracker, events, deckPlan, cards, selectedKey })
  const slots = externalSlots ?? internal.slots

  if (slots.length === 0) return <p className={styles.empty}>Слайды появятся здесь по мере готовности.</p>
  return (
    <SlideGrid label="Слайды презентации">
      {slots.map((slot) => {
        const cornerBadge =
          slot.previewBadge ?? (slot.imageUrl === null && slot.state === 'building' ? 'собираю' : null)

        return (
          <div role="listitem" key={slot.key} data-slide-key={slot.slideKey} data-preview-revision={slot.previewRevision ?? undefined}>
            <SlideTile
              title={slot.title}
              image={slot.imageUrl}
              pending={slot.state === 'building' || slot.previewBadge === 'обновляется'}
              selected={selectedSlideIndex === slot.index}
              onOpen={onSelectSlide ? () => onSelectSlide(slot.index) : undefined}
              openLabel={`Слайд ${slot.slideNumber}: ${slot.title}${slot.previewBadge ? ` (${slot.previewBadge})` : ''}`}
              corner={
                cornerBadge ? (
                  <span className={styles.cornerBadge} data-badge={cornerBadge}>
                    {cornerBadge}
                  </span>
                ) : undefined
              }
              caption={
                <span className={styles.captionRow}>
                  <span className={styles.captionNum}>{formatIndex(slot.slideNumber)}</span>
                  <span className={styles.captionTitle}>{slot.title}</span>
                  {slot.purposeLabel && <span className={styles.captionRole}>{slot.purposeLabel}</span>}
                </span>
              }
            >
              <span className={styles.draftContent}>
                {slot.bullets.length > 0 ? (
                  <span className={styles.draftBullets}>
                    {slot.bullets.slice(0, 2).map((line, idx) => (
                      <span key={idx} className={styles.draftBullet}>
                        {line}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className={styles.draftLines} aria-hidden="true">
                    <span className={styles.draftLineShort} />
                    <span className={styles.draftLineLong} />
                  </span>
                )}
                <span className={styles.draftFooter}>
                  <span className={styles.draftPurpose}>
                    {slot.state === 'building' ? 'Верстаю слайд по макету…' : 'Ожидает очереди рендера'}
                  </span>
                </span>
              </span>
            </SlideTile>
          </div>
        )
      })}
    </SlideGrid>
  )
}

export function BuildSlideInspector({
  slot,
  totalSlides,
  onSelectSlide,
}: {
  slot: FilmstripSlot
  totalSlides: number
  onSelectSlide: (index: number) => void
}) {
  const statusText =
    slot.previewBadge === 'обновляется'
      ? 'Обновляется'
      : slot.previewBadge === 'черновик'
        ? 'Черновик'
        : slot.imageUrl
          ? 'Готов'
          : slot.state === 'building'
            ? 'Собираю слайд'
            : 'По плану'

  return (
    <div className={styles.inspectorWrap}>
      <div className={styles.inspectorStage}>
        {slot.imageUrl ? (
          <img
            className={styles.inspectorImage}
            src={slot.imageUrl}
            alt={`Слайд ${slot.slideNumber}: ${slot.title}`}
          />
        ) : (
          <div className={styles.inspectorDraft}>
            <span className={styles.inspectorDraftNum}>{formatIndex(slot.slideNumber)}</span>
            <h3 className={styles.inspectorDraftTitle}>{slot.title}</h3>
            {slot.keyMessage && slot.keyMessage !== slot.title && (
              <p className={styles.inspectorDraftLead}>{slot.keyMessage}</p>
            )}
          </div>
        )}
        {slot.previewBadge && (
          <span className={styles.inspectorBadge} data-badge={slot.previewBadge}>
            {slot.previewBadge}
          </span>
        )}
      </div>

      <div className={styles.inspectorMeta}>
        <span className={styles.metaPill} data-badge={slot.previewBadge ?? (slot.imageUrl ? 'ready' : 'plan')}>
          {statusText}
        </span>
        {slot.purposeLabel && <span className={styles.metaPill}>{slot.purposeLabel}</span>}
        {slot.layoutName && <span className={styles.metaPill}>Макет: {slot.layoutName}</span>}
      </div>

      {slot.bullets.length > 0 && (
        <div className={styles.inspectorSection}>
          <span className={styles.inspectorSectionTitle}>Содержание по плану</span>
          <ul className={styles.inspectorList}>
            {slot.bullets.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {totalSlides > 1 && (
        <div className={styles.inspectorNav}>
          <Button
            size="sm"
            disabled={slot.index <= 0}
            onClick={() => onSelectSlide(slot.index - 1)}
          >
            Предыдущий слайд
          </Button>
          <span className={styles.inspectorCounter}>
            {slot.slideNumber} из {totalSlides}
          </span>
          <Button
            size="sm"
            disabled={slot.index >= totalSlides - 1}
            onClick={() => onSelectSlide(slot.index + 1)}
          >
            Следующий слайд
          </Button>
        </div>
      )}
    </div>
  )
}
