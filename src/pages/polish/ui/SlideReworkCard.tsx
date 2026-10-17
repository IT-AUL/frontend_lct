import { Icon, Mono, RefreshCw } from '@/shared/ui'
import type { ReworkChip } from '../model/polishModel'
import styles from './PolishPage.module.css'

interface SlideReworkCardProps {
  slideNumber: number
  chips: readonly ReworkChip[]
  pendingKey: string | null
  disabled: boolean
  disabledReasons?: ReadonlyMap<string, string>
  unsupported: boolean
  error: string | null
  exemplarLabel: string | null
  onSelectChip: (chip: ReworkChip) => void
}

const pad = (value: number) => String(value).padStart(2, '0')

export function SlideReworkCard(props: SlideReworkCardProps) {
  const { slideNumber, chips, pendingKey, disabled, disabledReasons, unsupported, error, exemplarLabel, onSelectChip } = props
  const busy = pendingKey !== null

  return (
    <section aria-label="Переделать слайд" className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Переделать слайд</h2>
        <Mono className={styles.altLabel}>Слайд {pad(slideNumber)}</Mono>
      </div>
      <p className={styles.cardSub}>
        Меняется только слайд №{pad(slideNumber)} — остальные слайды колоды останутся без изменений.
      </p>

      {unsupported ? (
        <p className={styles.cardSub} role="status">
          Точечная пересборка одного слайда не поддерживается текущим сервером.
        </p>
      ) : (
        <div className={styles.chipGroup} role="group" aria-label="Варианты переделки слайда">
          {chips.map((chip) => {
            const active = pendingKey === chip.key
            const rejected = disabledReasons?.get(chip.key)
            return (
              <button
                key={chip.key}
                type="button"
                className={styles.chip}
                data-active={active || undefined}
                disabled={disabled || busy || rejected !== undefined}
                aria-busy={active || undefined}
                title={rejected ?? chip.title}
                onClick={() => onSelectChip(chip)}
              >
                {active && <Icon as={RefreshCw} size={12} />}
                <span>{chip.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {exemplarLabel && (
        <div className={styles.exemplarNote}>
          <span>Текущий образец</span>
          <Mono>{exemplarLabel}</Mono>
        </div>
      )}

      {error && (
        <p className={styles.inlineError} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
