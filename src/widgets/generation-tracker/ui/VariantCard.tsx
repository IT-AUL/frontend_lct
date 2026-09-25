import { clsx } from 'clsx'
import { useVariantFiles } from '@/features/variant-files'
import { variantMetrics, type VariantSummary } from '@/entities/variant'
import { PdfPage } from '@/shared/ui'
import { VARIANT_STATE_LABEL, type VariantCard as VariantCardModel } from '../lib/variants'
import styles from './VariantCard.module.css'

const THUMB_PAGES = [1, 2, 3]

interface VariantCardProps {
  card: VariantCardModel
  failureMessage: string | null
}

function DoneBody({ variant, name }: { variant: VariantSummary; name: string }) {
  const { pdfUrl } = useVariantFiles(variant.id)
  const { opensCleanly } = variantMetrics(variant)
  return (
    <>
      {pdfUrl ? (
        <div className={clsx(styles.thumbs, styles.appear)}>
          {THUMB_PAGES.map((page) => (
            <PdfPage key={page} url={pdfUrl} pageNumber={page} className={styles.thumb} label={`${name}: слайд ${page}`} />
          ))}
        </div>
      ) : (
        <DashedSlots />
      )}
      {opensCleanly === true && <div className={styles.okLine}>✓ Файл открыт повторно без ошибок</div>}
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
  return (
    <article className={clsx(styles.card, styles[`card_${state}`])} aria-label={`${strategy.name}: ${VARIANT_STATE_LABEL[state]}`}>
      <header className={styles.head}>
        <h3 className={styles.name}>{strategy.name}</h3>
        <span className={styles.code}>{strategy.id}</span>
        <span className={styles.spacer} />
        <span className={clsx(styles.status, styles[`status_${state}`])}>
          <span className={styles.dot} aria-hidden />
          {VARIANT_STATE_LABEL[state]}
        </span>
      </header>
      <p className={styles.axis}>{strategy.axis}</p>
      {state === 'done' && variant && <DoneBody variant={variant} name={strategy.name} />}
      {(state === 'running' || state === 'pending') && (
        <>
          <PulseSlots />
          <div className={styles.hint}>
            {state === 'pending'
              ? 'Сервис вернёт варианты одним ответом, когда соберёт все.'
              : 'Слайды появятся, когда вариант будет готов целиком.'}
          </div>
        </>
      )}
      {state === 'queued' && (
        <>
          <DashedSlots />
          <div className={styles.hint}>Ждёт свободного исполнителя.</div>
        </>
      )}
      {state === 'canceled' && (
        <>
          <DashedSlots />
          <div className={styles.hint}>Вариант не собран: генерация отменена.</div>
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
