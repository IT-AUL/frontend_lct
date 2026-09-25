import type { Schemas } from '@/shared/api'

export type GenerationDetail = Schemas['GenerationDetail']
export type GenerationAccepted = Schemas['GenerationAccepted']
export type GenerationBrief = Schemas['Brief']
export type VariantRequest = Schemas['VariantRequest']
export type Job = Schemas['Job']
export type JobError = Schemas['JobError']
export type JobKind = Schemas['JobKind']
export type JobState = Schemas['JobState']
export type DeckPlan = Schemas['DeckPlan']
export type SlidePlan = Schemas['SlidePlan']
export type SlidePurpose = Schemas['Purpose']
export type DeckPlanSection = Schemas['deckdna__contracts__deck_plan__Section']
export type DeckPlanProvenance = Schemas['deckdna__contracts__deck_plan__Provenance']
export type ContentUnit = Schemas['ContentUnit']
export type GenerationCreate = Schemas['GenerationCreate'] & {
  deck_plan?: DeckPlan | null
  deck_plan_id?: string | null
}

export interface PlanProposal {
  strategy: string | null
  deckPlan: DeckPlan
}

export interface PlanDraftResult {
  planId: string | null
  proposals: PlanProposal[]
}

export type PlanRequest = Omit<GenerationCreate, 'deck_plan' | 'deck_plan_id' | 'variants'> & {
  strategies: string[]
}
