import { useMutation } from '@tanstack/react-query'
import { parsePlanDraft, requestPlans, type ContentFillMode, type DeckPlan, type PlanDraftResult, type PlanRequest, type PlanRequestOptions, type VariantRequest } from '@/entities/generation'
import { api, isUnsupportedEndpoint, unwrap } from '@/shared/api'
import { readJson, writeJson } from '@/shared/lib/storage'

const STORAGE_PREFIX = 'deckdna.plan-request.v1:'

export type StoredRequest = PlanRequest & { template_id: string }

export interface StoredPlanRequest {
  request: StoredRequest
  result: PlanDraftResult
  variants?: VariantRequest[]
  contentFill?: ContentFillMode | null
  keyMessage?: string | null
  assistantNote?: string | null
  createdAt: string
}

export interface PlanRequestExtras {
  variants?: VariantRequest[]
  contentFill?: ContentFillMode | null
  keyMessage?: string | null
  assistantNote?: string | null
}

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`
}

export function readPlanRequest(projectId: string): StoredPlanRequest | null {
  const stored = readJson<StoredPlanRequest | null>(storageKey(projectId), null)
  if (!stored || !Array.isArray(stored.result?.proposals) || stored.result.proposals.length === 0) return null
  return {
    ...stored,
    result: { ...stored.result, sufficiency: stored.result.sufficiency ?? null, research: stored.result.research ?? null },
  }
}

export function writePlanRequest(projectId: string, stored: StoredPlanRequest): StoredPlanRequest {
  writeJson(storageKey(projectId), stored)
  return stored
}

export function syncPlanDraftToStorage(projectId: string, stored: StoredPlanRequest, deckPlan: DeckPlan, strategy: string | null): StoredPlanRequest {
  const proposals = stored.result.proposals.map((item, index) => {
    if ((strategy && item.strategy === strategy) || (!strategy && index === 0)) {
      return { ...item, deckPlan }
    }
    return item
  })
  const keyMessage = deckPlan.brief.key_message ?? stored.keyMessage ?? null
  const next: StoredPlanRequest = {
    ...stored,
    keyMessage,
    request: {
      ...stored.request,
      brief: {
        ...stored.request.brief,
        target_slide_count: deckPlan.slides.length,
        ...(keyMessage ? { key_message: keyMessage } : {}),
      },
    },
    result: { ...stored.result, proposals },
  }
  return writePlanRequest(projectId, next)
}

export function applyServerPlanSet(projectId: string, stored: StoredPlanRequest, payload: unknown): StoredPlanRequest {
  const parsed = parsePlanDraft(payload)
  if (parsed.proposals.length === 0) return stored
  const record = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}
  const packId = typeof record.content_pack_id === 'string' && record.content_pack_id ? record.content_pack_id : stored.request.content_pack_id
  const keyMessage = typeof record.key_message === 'string' ? record.key_message : (parsed.proposals[0]?.deckPlan.brief.key_message ?? stored.keyMessage ?? null)
  const assistantNote = typeof record.assistant_note === 'string' ? record.assistant_note : stored.assistantNote ?? null
  const next: StoredPlanRequest = {
    ...stored,
    keyMessage,
    assistantNote,
    request: { ...stored.request, content_pack_id: packId },
    result: {
      planId: parsed.planId ?? stored.result.planId,
      proposals: parsed.proposals,
      sufficiency: parsed.sufficiency ?? stored.result.sufficiency,
      research: parsed.research ?? stored.result.research,
    },
  }
  return writePlanRequest(projectId, next)
}

export async function requestAndStorePlan(projectId: string, request: StoredRequest, extras: PlanRequestExtras = {}, options?: PlanRequestOptions): Promise<StoredPlanRequest> {
  const result = await requestPlans(projectId, request, options)
  const keyMessage = extras.keyMessage ?? result.proposals[0]?.deckPlan.brief.key_message ?? request.brief.key_message ?? null
  const stored: StoredPlanRequest = { request, result, ...extras, keyMessage, createdAt: new Date().toISOString() }
  return writePlanRequest(projectId, stored)
}

export function useRequestPlan(projectId: string) {
  return useMutation({
    mutationFn: ({ request, extras, options }: { request: StoredRequest; extras?: PlanRequestExtras; options?: PlanRequestOptions }) =>
      requestAndStorePlan(projectId, request, extras, options),
  })
}

export function useResearchPlanSlide(planId: string) {
  return useMutation({
    mutationFn: async ({ slideId, strategy, focus = 'numbers', useLlm, providerSessionId }: { slideId: string; strategy?: string | null; focus?: 'facts' | 'numbers'; useLlm?: boolean | null; providerSessionId?: string | null }) => {
      if (!planId) return null
      try {
        return await unwrap(
          api.POST('/api/v1/plans/{plan_id}/slides/{slide_id}/research', {
            params: { path: { plan_id: planId, slide_id: slideId } },
            body: {
              focus,
              ...(strategy ? { strategy } : {}),
              ...(useLlm !== undefined ? { use_llm: useLlm } : {}),
              ...(providerSessionId ? { provider_session_id: providerSessionId } : {}),
            },
          }),
        )
      } catch (error) {
        if (isUnsupportedEndpoint(error)) return null
        throw error
      }
    },
  })
}
