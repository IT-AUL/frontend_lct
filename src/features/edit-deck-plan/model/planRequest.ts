import { useMutation } from '@tanstack/react-query'
import { requestPlans, type ContentFillMode, type PlanDraftResult, type PlanRequest, type PlanRequestOptions, type VariantRequest } from '@/entities/generation'
import { readJson, writeJson } from '@/shared/lib/storage'

const STORAGE_PREFIX = 'deckdna.plan-request.v1:'

export type StoredRequest = PlanRequest & { template_id: string }

export interface StoredPlanRequest {
  request: StoredRequest
  result: PlanDraftResult
  variants?: VariantRequest[]
  contentFill?: ContentFillMode | null
  createdAt: string
}

export interface PlanRequestExtras {
  variants?: VariantRequest[]
  contentFill?: ContentFillMode | null
}

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`
}

export function readPlanRequest(projectId: string): StoredPlanRequest | null {
  const stored = readJson<StoredPlanRequest | null>(storageKey(projectId), null)
  if (!stored || !Array.isArray(stored.result?.proposals) || stored.result.proposals.length === 0) return null
  return { ...stored, result: { ...stored.result, sufficiency: stored.result.sufficiency ?? null, research: stored.result.research ?? null } }
}

export async function requestAndStorePlan(projectId: string, request: StoredRequest, extras: PlanRequestExtras = {}, options?: PlanRequestOptions): Promise<StoredPlanRequest> {
  const result = await requestPlans(projectId, request, options)
  const stored: StoredPlanRequest = { request, result, ...extras, createdAt: new Date().toISOString() }
  writeJson(storageKey(projectId), stored)
  return stored
}

export function useRequestPlan(projectId: string) {
  return useMutation({
    mutationFn: ({ request, extras, options }: { request: StoredRequest; extras?: PlanRequestExtras; options?: PlanRequestOptions }) =>
      requestAndStorePlan(projectId, request, extras, options),
  })
}
