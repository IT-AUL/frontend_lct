import type { GenerationTracker } from '@/entities/generation'
import { describeFailure } from '../lib/failure'
import { pipelineView } from '../lib/pipeline'
import { variantCards } from '../lib/variants'
import { BudgetTimer } from './BudgetTimer'
import styles from './GenerationProgress.module.css'
import { PipelineStages } from './PipelineStages'
import { VariantCard } from './VariantCard'

interface GenerationProgressProps {
  tracker: GenerationTracker
}

export function GenerationProgress({ tracker }: GenerationProgressProps) {
  const { phase, startedAt, finishedAt, generation, job, jobError } = tracker
  const cards = variantCards(phase, generation?.variants)
  const failure = phase === 'failed' ? describeFailure(tracker) : null
  const pipeline = pipelineView({ phase, stage: job?.stage, failedStage: jobError?.stage })
  const ticking = phase === 'submitting' || phase === 'running'

  return (
    <div className={styles.root}>
      {startedAt !== null && <BudgetTimer startedAt={startedAt} finishedAt={finishedAt} ticking={ticking} />}
      {cards.length > 0 && (
        <div className={styles.cards}>
          {cards.map((card) => (
            <VariantCard key={card.key} card={card} failureMessage={failure?.message ?? null} />
          ))}
        </div>
      )}
      <PipelineStages view={pipeline} />
    </div>
  )
}
