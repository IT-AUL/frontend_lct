import type { InsightPatch } from '@/entities/assistant'
import { Badge, Button, Check, Icon, Mono } from '@/shared/ui'
import { insightSource, insightTitle, needsDecision, type InsightEntry } from '../lib/table'
import { extractFigure, isInsightRecommendation, sanitizeAssistantCopy } from '../lib/understanding'
import { SparkChart } from './SparkChart'
import styles from './DraftDeck.module.css'

export interface InsightCardProps {
  entry: InsightEntry
  selected?: boolean
  onOpen?: () => void
  onEdit?: () => void
  onPatch?: (insightId: string, patch: InsightPatch) => void
  onExclude?: (insightId: string) => void
  showChart?: boolean
}

function resolveInsightChartType(entry: InsightEntry): string | null | undefined {
  const { insight, dataset, preview } = entry
  if (insight.fact_type === 'correlation' || insight.fact_type === 'no_correlation' || dataset.task === 'correlation') {
    return 'scatter'
  }
  if (insight.fact_type === 'spread' || insight.fact_type === 'outlier' || dataset.task === 'distribution') {
    return 'histogram'
  }
  if (preview?.chart_type && preview.chart_type !== 'line') {
    return preview.chart_type
  }
  return dataset.recommendations[0]?.chart_type ?? preview?.chart_type
}

function StatusBadge({ entry }: { entry: InsightEntry }) {
  const { insight } = entry
  if (isInsightRecommendation(insight)) {
    return (
      <Badge tone={insight.confirmed ? 'ok' : 'warn'} dot>
        {insight.confirmed ? 'Предложение · согласовано' : 'Предложение · ждёт решения'}
      </Badge>
    )
  }
  return (
    <Badge tone={insight.confirmed ? 'ok' : 'neutral'} dot={insight.confirmed}>
      {insight.confirmed ? 'Факт · подтверждён' : 'Факт'}
    </Badge>
  )
}

function CardActions({ entry, decide, onEdit, onPatch, onExclude }: { entry: InsightEntry; decide: boolean } & Pick<InsightCardProps, 'onEdit' | 'onPatch' | 'onExclude'>) {
  const { insight } = entry
  if (!onPatch && !onEdit && !onExclude) return null
  return (
    <div className={styles.insightActions}>
      {onPatch && (
        <Button
          variant={decide || insight.confirmed ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={insight.confirmed}
          onClick={() => onPatch(insight.id, { confirmed: !insight.confirmed })}
        >
          {insight.confirmed && <Icon as={Check} size={12} />}
          Согласен
        </Button>
      )}
      {onEdit && (
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Изменить
        </Button>
      )}
      {onExclude && (
        <Button variant="ghost" size="sm" onClick={() => onExclude(insight.id)}>
          Не включать
        </Button>
      )}
    </div>
  )
}

function MeaningRows({ meaningText, implicationText, decide }: { meaningText: string | null; implicationText: string | null; decide: boolean }) {
  if (!meaningText && !implicationText) return null
  return (
    <div className={styles.insightRows}>
      {meaningText && (
        <div className={styles.insightRow}>
          <span className={styles.insightStep}>Значит</span>
          <p className={styles.insightStepText}>{meaningText}</p>
        </div>
      )}
      {implicationText && (
        <div className={styles.insightRow} data-decision={decide || undefined}>
          <span className={styles.insightStep}>Следует</span>
          <p className={styles.insightStepText}>{implicationText}</p>
        </div>
      )}
    </div>
  )
}

function InsightVisual({ entry, figure, chartType, showChart }: { entry: InsightEntry; figure: string | null; chartType: string | null | undefined; showChart: boolean }) {
  const { dataset } = entry
  const preview = showChart ? entry.preview : null
  if (!preview && !figure) return null
  return (
    <div className={styles.insightVisual} data-figure-only={!preview || undefined}>
      {preview && <SparkChart preview={preview} chartType={chartType} label={`График: ${dataset.title ?? dataset.file ?? ''}`} />}
      {figure && <span className={styles.figure}>{figure}</span>}
    </div>
  )
}

export function InsightCard({ entry, selected, onOpen, onEdit, onPatch, onExclude, showChart = true }: InsightCardProps) {
  const { insight, dataset, preview } = entry
  const title = sanitizeAssistantCopy(insightTitle(insight))
  const factText = sanitizeAssistantCopy(insight.fact)
  const showFact = Boolean(insight.headline && insight.fact && insight.headline.trim() !== insight.fact.trim())
  const meaningText = insight.meaning ? sanitizeAssistantCopy(insight.meaning) : null
  const implicationText = insight.implication ? sanitizeAssistantCopy(insight.implication) : null
  const decide = needsDecision(insight)
  const source = insightSource(insight, dataset)
  const figure = extractFigure(title) ?? extractFigure(factText)
  const chartType = resolveInsightChartType(entry)
  const hasChart = Boolean(showChart && preview && (preview.series?.[0]?.values?.length ?? 0) > 0)
  const visualMode = hasChart ? 'chart' : figure ? 'figure' : 'none'

  return (
    <article
      className={styles.insight}
      role="listitem"
      data-selected={selected || undefined}
      data-decision={decide || undefined}
      aria-label={`Вывод: ${title}`}
    >
      <header className={styles.insightMeta}>
        <StatusBadge entry={entry} />
        {dataset.file && <span className={styles.insightFile}>{dataset.file}</span>}
      </header>

      <div className={styles.insightMain} data-visual={visualMode}>
        <div className={styles.insightText}>
          <h3 className={styles.insightTitle}>
            {onOpen ? (
              <button type="button" className={styles.insightOpen} onClick={onOpen} aria-label={`Открыть вывод: ${title}`}>
                {title}
              </button>
            ) : (
              title
            )}
          </h3>

          {showFact && <p className={styles.insightFact}>{factText}</p>}

          <MeaningRows meaningText={meaningText} implicationText={implicationText} decide={decide} />
        </div>
        <InsightVisual entry={entry} figure={figure} chartType={chartType} showChart={showChart} />
      </div>

      <footer className={styles.insightFooter}>
        {source && (
          <Mono className={styles.insightSource} title={insight.evidence?.join('\n') ?? source}>
            {source}
          </Mono>
        )}
        <CardActions entry={entry} decide={decide} onEdit={onEdit} onPatch={onPatch} onExclude={onExclude} />
      </footer>
    </article>
  )
}
