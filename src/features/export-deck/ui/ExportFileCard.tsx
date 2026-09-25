import { clsx } from 'clsx'
import type { ExportFormat } from '@/entities/passport'
import type { DeckFile } from '@/entities/variant'
import { artifactUrl } from '@/shared/api'
import { formatBytes, formatShortHash } from '@/shared/lib/format'
import { Button } from '@/shared/ui'
import { FORMAT_LABEL } from '../model/exportState'
import { useDeckExport } from '../model/useDeckExport'
import styles from './ExportFileCard.module.css'

export interface ExportFileCardProps {
  projectId: string
  variantId: string
  format: ExportFormat
  file: DeckFile | null
  currentRevision: number | null
  supported: boolean
  fileName: string
  note: string
  tag?: string
  primary?: boolean
}

function revisionLabel(revision: number | null): string {
  return revision === null ? '' : ` r${revision}`
}

function metaLine(file: DeckFile | null): string {
  if (!file) return '—'
  const size = file.sizeBytes !== null ? formatBytes(file.sizeBytes) : 'размер неизвестен'
  const sha = file.sha256 ? `sha256 · ${formatShortHash(file.sha256)}` : 'контрольная сумма после экспорта'
  return `${size} · ${sha}`
}

export function ExportFileCard({ projectId, variantId, format, file, currentRevision, supported, fileName, note, tag, primary }: ExportFileCardProps) {
  const { state, create, markDownloaded } = useDeckExport({ projectId, variantId, format, file, currentRevision, supported })
  const label = FORMAT_LABEL[format]
  const soon = state.status === 'unavailable' && !state.file
  const tagText = soon ? 'Скоро' : tag
  const stale = state.stale && state.file
  const titleId = `export-${format}-title`

  const downloadLink = (variant: 'primary' | 'secondary', text: string) =>
    state.file && (
      <a
        href={artifactUrl(state.file.artifactId)}
        download={fileName}
        className={clsx(styles.link, variant === 'primary' ? styles.linkPrimary : styles.linkSecondary)}
        onClick={markDownloaded}
        aria-describedby={titleId}
      >
        {text}
      </a>
    )

  return (
    <article className={clsx(styles.card, primary && styles.primary, soon && styles.soon)} aria-labelledby={titleId} data-status={state.status}>
      <div className={styles.icon} aria-hidden>
        {label}
      </div>
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <h3 id={titleId} className={styles.name} title={fileName}>
            {fileName}
          </h3>
          {tagText && <span className={clsx(styles.tag, soon ? styles.tagSoon : styles.tagOk)}>{tagText}</span>}
        </div>
        <div className={styles.note}>{soon && state.message ? state.message : note}</div>
        {!soon && <div className={styles.meta}>{metaLine(state.file)}</div>}
        {stale && state.status !== 'unavailable' && (
          <div className={styles.warn}>
            Файл собран для ревизии{revisionLabel(state.file?.deckRevision ?? null)}, текущая —{revisionLabel(currentRevision)}.
          </div>
        )}
        {state.status === 'unavailable' && state.file && <div className={styles.warn}>{state.message}</div>}
        {state.status === 'error' && (
          <div className={styles.error} role="alert">
            {state.message}
          </div>
        )}
      </div>
      <div className={styles.actions} aria-live="polite">
        {state.status === 'ready' && downloadLink('primary', 'Скачать')}
        {state.status === 'creating' && (
          <Button variant="primary" size="md" disabled>
            Собираем…
          </Button>
        )}
        {state.status === 'idle' && (
          <>
            <Button variant={stale ? 'secondary' : 'primary'} size="md" onClick={create}>
              {stale ? `Пересобрать для${revisionLabel(currentRevision)}` : `Собрать ${label}`}
            </Button>
            {stale && downloadLink('secondary', `Скачать${revisionLabel(state.file?.deckRevision ?? null)}`)}
          </>
        )}
        {state.status === 'unavailable' &&
          (state.file ? downloadLink('secondary', `Скачать${revisionLabel(state.file.deckRevision)}`) : <span className={styles.soonText}>недоступно</span>)}
        {state.status === 'error' && (
          <>
            <Button variant="secondary" size="md" onClick={create}>
              Повторить
            </Button>
            {state.file && downloadLink('secondary', 'Скачать прежний')}
          </>
        )}
      </div>
    </article>
  )
}
