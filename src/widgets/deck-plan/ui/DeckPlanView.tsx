import { clsx } from 'clsx'
import { Fragment, useMemo } from 'react'
import type { DeckPlan } from '@/entities/generation'
import { formatShortHash, pluralize } from '@/shared/lib/format'
import { buildPlanView, deckPurposeLabel, type PlanRow } from '../lib/plan'
import styles from './DeckPlanView.module.css'
import { SoonButton } from './SoonButton'

interface DeckPlanViewProps {
  plan: DeckPlan
  headings: ReadonlyMap<string, string>
}

const BAR_TONES = 5

function PlanRowItem({ row, first, last }: { row: PlanRow; first: boolean; last: boolean }) {
  return (
    <li className={styles.row}>
      <div className={styles.number}>{row.number}</div>
      <div className={styles.purposeCell}>
        <span className={styles.purpose}>{row.purpose}</span>
      </div>
      <div className={styles.main}>
        <div className={styles.title}>{row.title}</div>
        <div className={styles.idea}>
          {row.idea && <>{row.idea} · </>}
          <span className={styles.visual}>{row.visual}</span>
        </div>
      </div>
      <div className={styles.sources}>
        {row.sources.length > 0 ? (
          row.sources.map((source) => (
            <span key={source.key} className={styles.source} title={`${source.label}\n${source.refs.join('\n')}`}>
              ↳ {source.label}
            </span>
          ))
        ) : (
          <span className={styles.noSource}>служебный слайд</span>
        )}
      </div>
      <div className={styles.rowActions}>
        <SoonButton label={first ? 'Выше: уже первый' : 'Выше'} className={styles.iconButton}>
          ↑
        </SoonButton>
        <SoonButton label={last ? 'Ниже: уже последний' : 'Ниже'} className={styles.iconButton}>
          ↓
        </SoonButton>
        <SoonButton label="Убрать слайд" className={clsx(styles.iconButton, styles.remove)}>
          ×
        </SoonButton>
      </div>
    </li>
  )
}

export function DeckPlanView({ plan, headings }: DeckPlanViewProps) {
  const view = useMemo(() => buildPlanView(plan, headings), [plan, headings])
  const { rows, sections, stats } = view
  const { provenance, brief } = plan
  const namedSections = sections.filter((section) => section.id !== 'unassigned').length

  return (
    <div className={styles.layout}>
      <div className={styles.listColumn}>
        <div className={styles.columns} aria-hidden>
          <div>№</div>
          <div>Назначение</div>
          <div>Заголовок-вывод и мысль</div>
          <div>Источник</div>
          <div />
        </div>
        <ol className={styles.list} aria-label="Слайды плана">
          {rows.map((row, position) => {
            const previous = rows[position - 1]
            const opensSection = row.sectionTitle !== null && row.sectionId !== previous?.sectionId
            return (
              <Fragment key={row.id}>
                {opensSection && (
                  <li className={styles.sectionHead}>
                    Раздел · {row.sectionTitle}
                  </li>
                )}
                <PlanRowItem row={row} first={position === 0} last={position === rows.length - 1} />
              </Fragment>
            )
          })}
        </ol>
        <SoonButton label="Добавить слайд" block className={styles.addButton}>
          + Добавить слайд
        </SoonButton>
      </div>

      <aside className={styles.aside} aria-label="Почему такая структура">
        <h2 className={styles.asideTitle}>Почему такая структура</h2>
        <p className={styles.asideText}>
          Назначение «{deckPurposeLabel(brief.purpose || plan.objective)}», аудитория «{plan.audience || brief.audience}».{' '}
          {namedSections > 0
            ? `План делит историю на ${namedSections} ${pluralize(namedSections, ['раздел', 'раздела', 'разделов'])}; у каждого — слайды, которые его раскрывают.`
            : 'Сервис не разбил этот план на разделы.'}
        </p>
        {sections.length > 0 && (
          <>
            <div className={styles.bar} aria-hidden>
              {sections.map((section, index) => (
                <div key={section.id} className={styles[`tone${index % BAR_TONES}`]} style={{ flex: section.count }} />
              ))}
            </div>
            <ul className={styles.sectionList}>
              {sections.map((section) => (
                <li key={section.id} className={styles.sectionItem}>
                  <span className={styles.sectionName} title={section.title}>
                    {section.title}
                  </span>
                  <span className={styles.sectionRange}>{section.range}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Слайдов</dt>
            <dd className={styles.mono}>{stats.slides}</dd>
          </div>
          <div className={styles.stat}>
            <dt>С источником</dt>
            <dd className={styles.mono}>
              {stats.withSources} из {stats.slides}
            </dd>
          </div>
          <div className={styles.stat}>
            <dt>С визуализацией</dt>
            <dd className={styles.mono}>{stats.withVisual}</dd>
          </div>
          {(stats.mandatory > 0 || (brief.mandatory_sections?.length ?? 0) > 0) && (
            <div className={styles.stat}>
              <dt>Обязательные разделы</dt>
              <dd className={styles.mono}>
                {stats.mandatory} {pluralize(stats.mandatory, ['слайд', 'слайда', 'слайдов'])} · в брифе {brief.mandatory_sections?.length ?? 0}
              </dd>
            </div>
          )}
        </dl>
        <div className={styles.provenance}>
          <div className={styles.provenanceTitle}>Происхождение плана</div>
          <dl className={styles.provenanceList}>
            <div>
              <dt>Планировщик</dt>
              <dd>{provenance.planner}</dd>
            </div>
            <div>
              <dt>Модель</dt>
              <dd>{provenance.model_id ?? 'не указана'}</dd>
            </div>
            <div>
              <dt>Промпт</dt>
              <dd>{provenance.prompt_version}</dd>
            </div>
            <div>
              <dt>Схема</dt>
              <dd>{provenance.schema_version}</dd>
            </div>
            <div>
              <dt>План</dt>
              <dd>{plan.id}</dd>
            </div>
            {provenance.input_hashes && provenance.input_hashes.length > 0 && (
              <div>
                <dt>Входы</dt>
                <dd title={provenance.input_hashes.join('\n')}>{provenance.input_hashes.map(formatShortHash).join(', ')}</dd>
              </div>
            )}
          </dl>
        </div>
      </aside>
    </div>
  )
}
