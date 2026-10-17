import { Badge, Mono, Skeleton } from '@/shared/ui'
import type { ExplainView } from '../model/polishModel'
import styles from './PolishPage.module.css'

interface SlideExplainCardProps {
  view: ExplainView
  isPending: boolean
  reworkPending: boolean
  onPickAlternative: (chartType: string) => void
}

export function SlideExplainCard({ view, isPending, reworkPending, onPickAlternative }: SlideExplainCardProps) {
  return (
    <section aria-label="Почему так" className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Почему так</h2>
        <Badge tone={view.hasChart ? 'ok' : 'neutral'} shape="tag">
          {view.hasChart ? (view.chosenLabel ?? 'График') : view.purposeLabel}
        </Badge>
      </div>

      {isPending ? (
        <div aria-busy="true" aria-label="Загружаю объяснение слайда">
          <Skeleton style={{ height: 18, marginBottom: 6 }} />
          <Skeleton style={{ height: 18, marginBottom: 6 }} delay={0.08} />
          <Skeleton style={{ height: 18, marginBottom: 6 }} delay={0.16} />
          <Skeleton style={{ height: 34 }} delay={0.24} />
        </div>
      ) : view.hasChart ? (
        <>
          <dl className={styles.explainSteps}>
            <div className={styles.explainRow}>
              <dt className={styles.explainTerm}>1. Вход</dt>
              <dd className={styles.explainValue}>
                <Mono>{view.datasetLabel ?? 'Данные презентации'}</Mono>
              </dd>
            </div>
            {view.profileSummary && (
              <div className={styles.explainRow}>
                <dt className={styles.explainTerm}>2. Профиль данных</dt>
                <dd className={styles.explainValue}>{view.profileSummary}</dd>
              </div>
            )}
            <div className={styles.explainRow}>
              <dt className={styles.explainTerm}>{view.profileSummary ? '3. Задача и тип' : '2. Задача и тип'}</dt>
              <dd className={styles.explainValue}>
                {[view.taskText, view.chosenLabel].filter(Boolean).join(' → ') || 'Визуализация данных'}
                {view.aggregationText ? ` (${view.aggregationText})` : ''}
              </dd>
            </div>
            <div className={styles.explainRow}>
              <dt className={styles.explainTerm}>{view.profileSummary ? '4. Почему этот тип' : '3. Почему этот тип'}</dt>
              <dd className={styles.explainValue}>
                {view.whySummary ?? 'Подходит под структуру и размерность ряда.'}
                {view.reasons.length > 1 && (
                  <ul className={styles.reasonList}>
                    {view.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>

          {view.alternatives.length > 0 && (
            <div className={styles.altSection}>
              <span className={styles.altLabel}>Альтернативы (клик перестроит график на слайде):</span>
              <div className={styles.chipGroup} role="group" aria-label="Альтернативные типы графика">
                {view.alternatives.map((alt) => (
                  <button
                    key={alt.type}
                    type="button"
                    className={styles.chip}
                    disabled={reworkPending}
                    title={alt.reason ? `${alt.label}: ${alt.reason}` : `Построить «${alt.label}»`}
                    onClick={() => onPickAlternative(alt.type)}
                  >
                    {alt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view.rejected.length > 0 && (
            <details className={styles.rejectedDetails}>
              <summary>Почему не другие типы ({view.rejected.length})</summary>
              <ul className={styles.rejectedList}>
                {view.rejected.map((item) => (
                  <li key={item.type}>
                    <strong>{item.label}:</strong> {item.reason ?? 'не подходит под структуру данных'}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {view.insights.length > 0 && (
            <div className={styles.altSection}>
              <span className={styles.altLabel}>Проверенные выводы на слайде:</span>
              <ul className={styles.insightList}>
                {view.insights.map((insight) => (
                  <li key={insight.id}>{insight.text}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <dl className={styles.explainSteps}>
          <div className={styles.explainRow}>
            <dt className={styles.explainTerm}>Назначение</dt>
            <dd className={styles.explainValue}>{view.purposeLabel}</dd>
          </div>
          {view.exemplarLabel && (
            <div className={styles.explainRow}>
              <dt className={styles.explainTerm}>Макет</dt>
              <dd className={styles.explainValue}>
                <Mono>{view.exemplarLabel}</Mono>
              </dd>
            </div>
          )}
          <div className={styles.explainRow}>
            <dt className={styles.explainTerm}>Пояснение</dt>
            <dd className={styles.explainValue}>{view.fallbackNote}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
