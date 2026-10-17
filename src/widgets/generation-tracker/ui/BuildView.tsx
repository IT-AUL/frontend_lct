import type { JobEvent } from '@/entities/assistant'
import type { DeckPlan, GenerationTracker } from '@/entities/generation'
import { useVariantSlides } from '@/entities/variant'
import { SlideGrid, SlideTile } from '@/shared/ui'
import { buildFilmstripSlots } from '../lib/filmstrip'
import type { VariantCard, VariantCardState } from '../lib/variants'
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

export function BuildVariants({ cards, selectedKey, onSelect }: { cards: readonly VariantCard[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  if (cards.length < 2) return null
  return (
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
  )
}

export function BuildTable({ tracker, events, deckPlan, cards, selectedKey }: BuildViewProps & { cards: readonly VariantCard[]; selectedKey: string | null }) {
  const selected = cards.find((card) => card.key === selectedKey) ?? cards[0]
  const variantId = selected?.variant?.id ?? null
  const { data: variantSlides } = useVariantSlides(variantId)
  const slots = buildFilmstripSlots({
    plan: deckPlan ?? tracker.generation?.deck_plan ?? null,
    variantSlides,
    events,
    variantId,
    variantState: selected?.state ?? 'running',
  })
  if (slots.length === 0) return <p className={styles.empty}>Слайды появятся здесь по мере готовности.</p>
  return (
    <SlideGrid label="Слайды презентации">
      {slots.map((slot) => (
        <div role="listitem" key={slot.key}>
          <SlideTile
            title={slot.title}
            image={slot.state === 'ready' ? slot.imageUrl : null}
            pending={slot.state !== 'ready'}
            caption={`${slot.slideNumber}`}
          />
        </div>
      ))}
    </SlideGrid>
  )
}
