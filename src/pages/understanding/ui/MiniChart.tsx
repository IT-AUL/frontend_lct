import type { DataPreview } from '@/entities/assistant'
import { buildSparkGeometry } from '../lib/understanding'

const WIDTH = 220
const HEIGHT = 72
const SLICES = ['var(--ink)', 'var(--focus)', 'var(--ink-3)', 'var(--line-2)', 'var(--sunken)']

export function MiniChart({ preview, chartType, label }: { preview: DataPreview | null; chartType?: string | null; label: string }) {
  const geo = buildSparkGeometry(preview, chartType, WIDTH, HEIGHT)
  if (geo.values.length === 0) return null
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" role="img" aria-label={label} preserveAspectRatio="xMidYMax meet">
      {geo.chartType === 'bar' &&
        geo.bars.map((bar, index) => (
          <rect key={`${bar.label}-${index}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="1.5" fill={bar.isPeak ? 'var(--focus)' : 'var(--ink-3)'} />
        ))}
      {geo.chartType === 'pie' && (
        <g transform={`translate(${WIDTH / 2}, ${HEIGHT / 2})`}>
          {geo.segments.map((segment, index) => (
            <circle
              key={`${segment.label}-${index}`}
              r="24"
              fill="none"
              stroke={SLICES[index % SLICES.length]}
              strokeWidth="12"
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              transform="rotate(-90)"
            />
          ))}
        </g>
      )}
      {(geo.chartType === 'line' || geo.chartType === 'kpi' || geo.chartType === 'table') && (
        <g>
          {geo.areaPath && <path d={geo.areaPath} fill="var(--focus)" fillOpacity="0.08" />}
          {geo.linePath && <path d={geo.linePath} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
          {geo.peakPoint && <circle cx={geo.peakPoint.x} cy={geo.peakPoint.y} r="3.5" fill="var(--focus)" />}
        </g>
      )}
    </svg>
  )
}
