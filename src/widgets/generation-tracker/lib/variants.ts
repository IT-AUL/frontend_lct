import type { GenerationPhase } from '@/entities/generation'
import { isVariantSettled, orderVariants, STRATEGY_ORDER, strategyInfo, type StrategyInfo, type VariantSummary } from '@/entities/variant'

export type VariantCardState = 'pending' | 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface VariantCard {
  key: string
  strategy: StrategyInfo
  state: VariantCardState
  variant: VariantSummary | null
}

export const VARIANT_STATE_LABEL: Record<VariantCardState, string> = {
  pending: 'В работе',
  queued: 'В очереди',
  running: 'Идёт',
  done: 'Готово',
  error: 'Ошибка',
  canceled: 'Отменён',
}

function stateOf(variant: VariantSummary): VariantCardState {
  switch (variant.status) {
    case 'queued':
      return 'queued'
    case 'running':
    case 'awaiting_user':
      return 'running'
    case 'failed':
      return 'error'
    case 'canceled':
      return 'canceled'
    case 'completed':
      return isVariantSettled(variant) ? 'done' : 'running'
  }
}

export function variantCards(phase: GenerationPhase, variants: readonly VariantSummary[] | undefined): VariantCard[] {
  if (variants && variants.length > 0) {
    return orderVariants(variants).map((variant) => ({
      key: variant.id,
      strategy: strategyInfo(variant.strategy),
      state: stateOf(variant),
      variant,
    }))
  }
  if (phase !== 'submitting' && phase !== 'running') return []
  return STRATEGY_ORDER.map((strategy) => ({ key: strategy, strategy: strategyInfo(strategy), state: 'pending', variant: null }))
}
