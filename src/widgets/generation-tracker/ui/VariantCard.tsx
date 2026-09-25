import { clsx } from 'clsx'
import { useVariantFiles } from '@/features/variant-files'
import { variantMetrics, type VariantSummary } from '@/entities/variant'
import { artifactUrl } from '@/shared/api'
import { formatClock } from '@/shared/lib/format'
import { useNow } from '@/shared/lib/time'
import { CircleCheck, Icon, PdfPage } from '@/shared/ui'
import { VARIANT_STATE_LABEL, variantElapsedSeconds, variantStageLabel, type VariantCard as VariantCardModel } from '../lib/variants'
import styles from './VariantCard.module.css'

const THUMB_PAGES = [1, 2, 3]

interface VariantCardProps {
  card: VariantCardModel
  failureMessage: string | null
}

function DoneBody({ variant, name }: { variant: VariantSummary; name: string }) {
  const { pdfUrl } = useVariantFiles(variant.id)
  const { opensCleanly } = variantMetrics(variant)
  const montageUrl = variant.montage_artifact_id ? artifactUrl(variant.montage_artifact_id) : null
  return (
    <>
      {montageUrl && !pdfUrl ? (
        <img className={clsx(styles.montage, styles.appear)} src={montageUrl} alt={`${name}: слайды колоды`} decoding="async" />
      ) : pdfUrl ? (
        <div className={clsx(styles.thumbs, styles.appear)}>
          {THUMB_PAGES.map((page) => (
            <PdfPage key={page} url={pdfUrl} pageNumber={page} className={styles.thumb} label={`${name}: слайд ${page}`} />
          ))}
        </div>
      ) : (
        <DashedSlots />
      )}
      {opensCleanly === true && <div className={styles.okLine}>
          <Icon as={CircleCheck} size={14} /> Файл открыт повторно без ошибок
        </div>}
      {opensCleanly === false && <div className={styles.warnLine}>Повторное открытие файла выявило ошибки</div>}
    </>
  )
}

function PulseSlots() {
  return (
    <div className={styles.thumbs} aria-hidden>
      {THUMB_PAGES.map((page) => (
        <div key={page} className={styles.slotPulse} style={{ animationDelay: `${(page - 1) * 0.2}s` }} />
      ))}
    </div>
  )
}

function DashedSlots() {
  return (
    <div className={styles.thumbs} aria-hidden>
      {THUMB_PAGES.map((page) => (
        <div key={page} className={styles.slotDashed} />
      ))}
    </div>
  )
}

export function VariantCard({ card, failureMessage }: VariantCardProps) {
  const { state, strategy, variant } = card
  const now = useNow(1000, state === 'running')
  const elapsed = variantElapsedSeconds(variant, now)
  const stage = state === 'running' ? variantStageLabel(variant) : null
  const statusText = [VARIANT_STATE_LABEL[state], stage, elapsed !== null && (state === 'running' || state === 'done') ? formatClock(elapsed) : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <article className={clsx(styles.card, styles[`card_${state}`])} aria-label={`${strategy.name}: ${VARIANT_STATE_LABEL[state]}`}>
      <header className={styles.head}>
        <h3 className={styles.name}>{strategy.name}</h3>
        <span className={styles.spacer} />
        <span className={clsx(styles.status, styles[`status_${state}`])}>
          <span className={styles.dot} aria-hidden />
          {statusText}
        </span>
      </header>
      <p className={styles.axis}>{strategy.axis}</p>
      {state === 'done' && variant && <DoneBody variant={variant} name={strategy.name} />}
      {(state === 'running' || state === 'pending') && (
        <>
          <PulseSlots />
          <div className={styles.hint}>Слайды появятся, когда вариант будет готов.</div>
        </>
      )}
      {state === 'queued' && (
        <>
          <DashedSlots />
        </>
      )}
      {state === 'canceled' && (
        <>
          <DashedSlots />
          <div className={styles.hint}>Сборка отменена.</div>
        </>
      )}
      {state === 'error' && (
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>Вёрстка не завершилась</div>
          {failureMessage && <div className={styles.errorText}>{failureMessage}</div>}
        </div>
      )}
    </article>
  )
}
