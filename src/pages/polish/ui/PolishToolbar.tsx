import { Link } from 'react-router'
import type { ExportFormat } from '@/entities/passport'
import { strategyInfo, variantMetrics, type DeckFile, type DeckFiles, type VariantSummary } from '@/entities/variant'
import { DownloadButton } from '@/features/export-deck'
import { formatPercent, pluralize } from '@/shared/lib/format'
import { AlertTriangle, Badge, Button, Check, ExternalLink, Icon, Mono, Segmented, Skeleton, Sparkles } from '@/shared/ui'
import { exportFileName } from '../model/polishModel'
import styles from './PolishPage.module.css'

interface PolishToolbarProps {
  projectId: string
  variant: VariantSummary
  variants: readonly VariantSummary[]
  onVariantChange: (variantId: string) => void
  revision: number
  openBlockers: number | null
  openErrors: number | null
  files: DeckFiles | null
  pptxFile: DeckFile | null
  filesPending: boolean
  htmlSupported: boolean
  auditHref: string
  exportHref: string
  note: string
  onOpenPassport: () => void
}

export function PolishToolbar(props: PolishToolbarProps) {
  const {
    projectId,
    variant,
    variants,
    onVariantChange,
    revision,
    openBlockers,
    openErrors,
    files,
    pptxFile,
    filesPending,
    htmlSupported,
    auditHref,
    exportHref,
    note,
    onOpenPassport,
  } = props

  const fidelity = variantMetrics(variant).styleFidelity
  const variantOptions = variants.map((item) => ({
    value: item.id,
    label: strategyInfo(item.strategy).name,
  }))
  const fileName = (format: ExportFormat, file: DeckFile | null) =>
    exportFileName(variant.strategy, format, file?.deckRevision ?? revision, file?.mimeType ?? null)

  return (
    <>
      <div className={styles.assistantStrip}>
        <p className={styles.note} aria-live="polite">
          <Icon as={Sparkles} size={14} />
          <span key={note} className={styles.noteText}>
            {note}
          </span>
        </p>
      </div>

      <header className={styles.toolbar} aria-label="Управление доводкой и экспортом">
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLabel}>Вариант:</span>
          {variants.length > 1 ? (
            <Segmented size="sm" label="Вариант колоды" options={variantOptions} value={variant.id} onChange={onVariantChange} />
          ) : (
            <Badge tone="ink">{strategyInfo(variant.strategy).name}</Badge>
          )}
          <Mono className={styles.revision}>r{revision}</Mono>
          {openBlockers !== null && (
            <Badge tone={openBlockers === 0 ? 'ok' : 'blocker'}>
              <Icon as={openBlockers === 0 ? Check : AlertTriangle} size={12} strokeWidth={2.5} />
              {openBlockers === 0
                ? '0 блокеров'
                : `${openBlockers} ${pluralize(openBlockers, ['блокер', 'блокера', 'блокеров'])}`}
            </Badge>
          )}
          {openErrors !== null && openErrors > 0 && (
            <Badge tone="warn">
              {openErrors} {pluralize(openErrors, ['ошибка', 'ошибки', 'ошибок'])}
            </Badge>
          )}
          {fidelity !== null && (
            <Badge tone="neutral" mono>
              {formatPercent(fidelity)} в стиле шаблона
            </Badge>
          )}
        </div>

        <div className={styles.toolbarRight}>
          <Button size="sm" variant="secondary" onClick={onOpenPassport}>
            Паспорт качества
          </Button>
          <Link to={auditHref} className={styles.auditLink}>
            <span>Подробный аудит</span>
            <Icon as={ExternalLink} size={12} />
          </Link>
          <Link to={exportHref} className={styles.auditLink}>
            <span>Экспорт</span>
          </Link>
          {filesPending ? (
            <Skeleton style={{ width: 220, height: 32, borderRadius: 8 }} />
          ) : (
            <div className={styles.downloads} role="group" aria-label="Скачать презентацию">
              <DownloadButton
                key={`${variant.id}:pdf`}
                projectId={projectId}
                variantId={variant.id}
                format="pdf"
                file={files?.pdf ?? null}
                currentRevision={revision}
                supported
                fileName={fileName('pdf', files?.pdf ?? null)}
                label="PDF"
              />
              <DownloadButton
                key={`${variant.id}:html`}
                projectId={projectId}
                variantId={variant.id}
                format="html"
                file={files?.html ?? null}
                currentRevision={revision}
                supported={htmlSupported}
                fileName={fileName('html', files?.html ?? null)}
                label="HTML"
              />
              <DownloadButton
                key={`${variant.id}:pptx`}
                projectId={projectId}
                variantId={variant.id}
                format="pptx"
                file={pptxFile}
                currentRevision={revision}
                supported
                fileName={fileName('pptx', pptxFile)}
                label="Скачать PPTX"
                primary
              />
            </div>
          )}
        </div>
      </header>
    </>
  )
}
