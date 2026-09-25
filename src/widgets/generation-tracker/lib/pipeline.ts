import { GENERATION_PIPELINE, PIPELINE_STAGE_LABEL, pipelineStage, stageLabel, type GenerationPhase, type PipelineStage } from '@/entities/generation'

export type StepState = 'idle' | 'pending' | 'active' | 'done' | 'error'

export interface PipelineStep {
  stage: PipelineStage
  label: string
  state: StepState
}

export type PipelineMode = 'tracked' | 'opaque' | 'finished' | 'stopped'

export interface PipelineView {
  mode: PipelineMode
  steps: PipelineStep[]
  currentLabel: string | null
}

export interface PipelineInput {
  phase: GenerationPhase
  stage: string | null | undefined
  failedStage: string | null | undefined
}

function stepsWith(resolve: (index: number) => StepState): PipelineStep[] {
  return GENERATION_PIPELINE.map((stage, index) => ({ stage, label: PIPELINE_STAGE_LABEL[stage], state: resolve(index) }))
}

function positionOf(stage: string | null | undefined): number {
  const known = pipelineStage(stage)
  return known ? GENERATION_PIPELINE.indexOf(known) : -1
}

export function pipelineView({ phase, stage, failedStage }: PipelineInput): PipelineView {
  if (phase === 'completed') return { mode: 'finished', steps: stepsWith(() => 'done'), currentLabel: null }

  if (phase === 'failed' || phase === 'canceled') {
    const stopStage = failedStage ?? stage
    const position = positionOf(stopStage)
    if (position === -1) return { mode: 'stopped', steps: stepsWith(() => 'idle'), currentLabel: stageLabel(stopStage) }
    const atStop: StepState = phase === 'failed' ? 'error' : 'pending'
    return {
      mode: 'stopped',
      steps: stepsWith((index) => (index < position ? 'done' : index === position ? atStop : 'pending')),
      currentLabel: stageLabel(stopStage),
    }
  }

  const position = positionOf(stage)
  if (position === -1) return { mode: 'opaque', steps: stepsWith(() => 'idle'), currentLabel: stageLabel(stage) }
  return {
    mode: 'tracked',
    steps: stepsWith((index) => (index < position ? 'done' : index === position ? 'active' : 'pending')),
    currentLabel: stageLabel(stage),
  }
}
