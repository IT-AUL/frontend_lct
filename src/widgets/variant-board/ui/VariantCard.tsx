import { clsx } from 'clsx'
import { useId } from 'react'
import { Link } from 'react-router'
import { SEVERITY } from '@/entities/audit'
import { JOB_STATE_LABEL } from '@/entities/generation'
import { usePassport } from '@/entities/passport'
import { DEFAULT_STRATEGY, strategyInfo, useVariantSlides, variantAxes, variantMetrics, variantRationale, type VariantSummary } from '@/entities/variant'
import { useVariantFiles } from '@/features/variant-files'
import { formatPercent } from '@/shared/lib/format'
import { Badge, Meter } from '@/shared/ui'
import { formatPei, issuesHeadline, peiNote, severityBreakdown, styleFidelityScore, validityView } from '../lib/metrics'
import styles from './VariantCard.module.css'
import { VariantThumbnails } from './VariantThumbnails'

interface VariantCardProps {
  variant: VariantSummary
  showThumbnails: boolean
  auditHref: (variantId: string, slideNumber?: number) => string
}

export function VariantCard({ variant: listed, showThumbnails, auditHref }: VariantCardProps) {
  const headingId = useId()
  const files = useVariantFiles(listed.id)
  const variant = files.variant ?? listed
  const ready = variant.status === 'completed'
  const slides = useVariantSlides(ready ? variant.id : null)
  const passport = usePassport(files.passportArtifactId)

  const info = strategyInfo(variant.strategy)
  const isDefault = variant.strategy === DEFAULT_STRATEGY
  const metrics = variantMetrics(variant)
  const validity = validityView(metrics.opensCleanly)
  const note = peiNote(metrics.editabilityLevel, passport.data?.editability.rasterOnlySlides ?? null)
  const breakdown = severityBreakdown(metrics.issuesTotal, passport.data?.issues)
  const axes = variantAxes(variant)
  const fidelity = styleFidelityScore(metrics.styleFidelity, passport.data?.styleFidelity)

  return (
    <section className={clsx(styles.card, isDefault && styles.recommended)} aria-labelledby={headingId}>
      <header className={styles.head}>
        <h2 id={headingId} className={styles.name}>
          {info.name}
        </h2>
        {isDefault && <span className={styles.defaultBadge}>по умолчанию</span>}
        <span className={styles.spacer} />
      </header>

      <p className={styles.rationale}>{variantRationale(variant)}</p>

      {axes.length > 0 && (
        <dl className={styles.axes} aria-label="Профиль стратегии">
          {axes.map((axis) => (
            <div key={axis.key} className={styles.axis}>
              <dt>{axis.label}</dt>
              <dd>
                <Meter value={axis.value} label={axis.caption} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!ready && (
        <div className={styles.status}>
          <Badge tone={variant.status === 'failed' ? 'error' : 'info'} dot>
            {JOB_STATE_LABEL[variant.status]}
          </Badge>
          <span>{variant.status === 'failed' ? 'Вариант не собран' : 'Вариант ещё собирается'}</span>
        </div>
      )}

      <dl className={styles.metrics}>
        <div className={styles.metric}>
          <dt>Открывается</dt>
          <dd className={styles[`validity_${validity.tone}`]}>{validity.label}</dd>
        </div>
        <div className={styles.metric}>
          <dt>Редактируемость</dt>
          <dd className={styles.mono}>{formatPei(metrics.editabilityLevel)}</dd>
          {note && <dd className={styles.note}>{note}</dd>}
        </div>
        {fidelity !== null && (
          <div className={styles.metric}>
            <dt>Соответствие</dt>
            <dd className={styles.mono} title="Палитра, шрифты, макеты и якоря шаблона">
              {formatPercent(fidelity)}
            </dd>
          </div>
        )}
      </dl>

      <div className={styles.issues}>
        <span className={styles.issuesTotal}>{issuesHeadline(metrics.issuesTotal)}</span>
        {breakdown?.map(({ severity, count }) => (
          <Badge key={severity} tone={count === 0 ? 'muted' : SEVERITY[severity].tone} shape="tag" title={`${SEVERITY[severity].label}: ${count}`}>
            <span className={styles.mono}>{count}</span> {SEVERITY[severity].shortLabel}
          </Badge>
        ))}
        {metrics.contextualIssues !== null && (
          <Badge tone="neutral" shape="tag">
            <span className={styles.mono}>{metrics.contextualIssues}</span> контекстуальных
          </Badge>
        )}
      </div>

      {files.error && (
        <p className={styles.error} role="alert">
          Не удалось получить файлы варианта: {files.error.message}
        </p>
      )}

      {showThumbnails && ready && (
        <VariantThumbnails
          variantId={variant.id}
          variantName={info.name}
          slides={slides.data}
          slidesError={slides.error}
          pdfUrl={files.pdfUrl}
          filesPending={files.isPending}
          slideHref={(slideNumber) => auditHref(variant.id, slideNumber)}
        />
      )}

      <div className={styles.actions}>
        {ready ? (
          <Link className={clsx(styles.action, styles.primary)} to={auditHref(variant.id)}>
            Открыть и проверить
          </Link>
        ) : (
          <span className={clsx(styles.action, styles.primary, styles.disabled)} aria-disabled="true">
            Открыть и проверить
          </span>
        )}
        {files.pdfUrl && (
          <a className={styles.action} href={files.pdfUrl} target="_blank" rel="noreferrer" aria-label={`Открыть PDF «${info.name}» в новой вкладке`}>
            PDF
          </a>
        )}
        {files.pptxUrl ? (
          <a className={styles.action} href={files.pptxUrl} download aria-label={`Скачать PPTX «${info.name}»`}>
            PPTX
          </a>
        ) : (
          <span className={clsx(styles.action, styles.disabled)} aria-disabled="true" title="PPTX ещё не собран">
            PPTX
          </span>
        )}
      </div>
    </section>
  )
}
