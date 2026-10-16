import type { PlanResearch } from '@/entities/generation'
import { pluralize } from '@/shared/lib/format'
import { ExternalLink, Icon, X } from '@/shared/ui'
import styles from './PlanPage.module.css'

interface SourcesPanelProps {
  research: PlanResearch
  disabled: boolean
  onRemove: (sourceId: string) => void
}

function accessed(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function SourcesPanel({ research, disabled, onRemove }: SourcesPanelProps) {
  const { sources } = research
  return (
    <section className={styles.sourcesPanel} aria-label="Источники">
      <h2 className={styles.sourcesTitle}>Источники · {sources.length}</h2>
      {sources.length === 0 ? (
        <p className={styles.sourcesEmpty}>Факты взяты из ваших материалов.</p>
      ) : (
        <ul className={styles.sourcesList}>
          {sources.map((source) => {
            const date = accessed(source.accessedAt)
            return (
              <li key={source.id} className={styles.sourceItem}>
                <div className={styles.sourceText}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer noopener" className={styles.sourceLink}>
                      {source.title}
                      <Icon as={ExternalLink} size={11} />
                    </a>
                  ) : (
                    <span className={styles.sourceLink}>{source.title}</span>
                  )}
                  <span className={styles.sourceMeta}>
                    {[source.site, date && `обращение ${date}`, source.facts !== null && `${source.facts} ${pluralize(source.facts, ['факт', 'факта', 'фактов'])}`].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <button type="button" className={styles.sourceRemove} aria-label={`Убрать источник ${source.title}`} title="Убрать источник и его факты из плана" disabled={disabled} onClick={() => onRemove(source.id)}>
                  <Icon as={X} size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
