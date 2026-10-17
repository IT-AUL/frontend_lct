import { clsx } from 'clsx'
import type { DataPreview } from '@/entities/assistant'
import { Mono } from '@/shared/ui'
import { buildSparkGeometry } from '../lib/understanding'
import styles from './UnderstandingPage.module.css'

export interface SparkChartProps {
  preview?: DataPreview | null
  chartType?: string | null
  title?: string | null
  className?: string
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
}

const PIE_COLORS = ['var(--ink)', 'var(--focus)', 'var(--ok)', 'var(--warn)', 'var(--ink-3)']

export function SparkChart({ preview, chartType, title, className }: SparkChartProps) {
  const width = 220
  const height = 64
  const geo = buildSparkGeometry(preview, chartType, width, height)
  const firstCat = geo.categories[0] ?? null
  const lastCat = geo.categories.length > 1 ? (geo.categories.at(-1) ?? null) : null
  const ariaLabel = [
    geo.chartLabel,
    title ?? geo.seriesName,
    geo.values.length > 0 ? `${geo.values.length} знач.` : null,
    geo.unit ? `(${geo.unit})` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={clsx(styles.sparkRoot, className)} data-chart-type={geo.chartType}>
      <div className={styles.sparkHeader}>
        <span className={styles.sparkType}>{geo.chartLabel}</span>
        {geo.deltaText && (
          <Mono className={styles.sparkDelta}>
            {geo.deltaText}
          </Mono>
        )}
        {geo.unit && <Mono className={styles.sparkUnit}>{geo.unit}</Mono>}
      </div>

      <svg
        className={styles.sparkSvg}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
      >
        {geo.values.length === 0 ? (
          <g>
            <line x1="12" y1="48" x2="208" y2="48" stroke="var(--line-2)" strokeWidth="1" strokeDasharray="3 3" />
            <polyline
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth="1.75"
              points="16,44 64,36 112,38 160,24 204,16"
            />
          </g>
        ) : geo.chartType === 'bar' ? (
          <g>
            {geo.bars.map((bar, idx) => (
              <rect
                key={`${bar.label}-${idx}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx="1.5"
                fill={bar.isPeak ? 'var(--focus)' : 'var(--ink)'}
                fillOpacity={bar.isPeak ? 0.95 : 0.72}
              >
                <title>{`${bar.label}: ${formatNumber(bar.value)}${geo.unit ? ` ${geo.unit}` : ''}`}</title>
              </rect>
            ))}
          </g>
        ) : geo.chartType === 'pie' ? (
          <g transform={`translate(${width / 2}, ${height / 2})`}>
            <circle r="18" fill="none" stroke="var(--line)" strokeWidth="8" />
            {geo.segments.map((seg, idx) => (
              <circle
                key={`${seg.label}-${idx}`}
                r="18"
                fill="none"
                stroke={PIE_COLORS[idx % PIE_COLORS.length]}
                strokeWidth="8"
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                transform="rotate(-90)"
              >
                <title>{`${seg.label}: ${formatNumber(seg.value)}${geo.unit ? ` ${geo.unit}` : ''}`}</title>
              </circle>
            ))}
          </g>
        ) : geo.chartType === 'table' ? (
          <g>
            {[12, 26, 40, 52].map((y, idx) => (
              <line key={y} x1="10" y1={y} x2="210" y2={y} stroke={idx === 0 ? 'var(--ink-2)' : 'var(--line-2)'} strokeWidth={idx === 0 ? '1.5' : '1'} />
            ))}
            {[10, 80, 145, 210].map((x) => (
              <line key={x} x1={x} y1="12" x2={x} y2="52" stroke="var(--line-2)" strokeWidth="1" />
            ))}
          </g>
        ) : (
          <g>
            {geo.areaPath && <path d={geo.areaPath} fill="var(--focus)" fillOpacity="0.1" />}
            {geo.linePath && (
              <path
                d={geo.linePath}
                fill="none"
                stroke="var(--ink)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {geo.peakPoint && (
              <circle
                cx={geo.peakPoint.x}
                cy={geo.peakPoint.y}
                r="3.5"
                fill="var(--focus)"
                stroke="var(--surface)"
                strokeWidth="1.5"
              >
                <title>{`Пик (${geo.peakPoint.label}): ${formatNumber(geo.peakPoint.value)}${geo.unit ? ` ${geo.unit}` : ''}`}</title>
              </circle>
            )}
          </g>
        )}
      </svg>

      {(firstCat || geo.firstValue !== null) && (
        <div className={styles.sparkAxis}>
          <span>
            {firstCat ?? 'Старт'}
            {geo.firstValue !== null ? ` · ${formatNumber(geo.firstValue)}` : ''}
          </span>
          {lastCat && (
            <span>
              {lastCat}
              {geo.lastValue !== null ? ` · ${formatNumber(geo.lastValue)}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
