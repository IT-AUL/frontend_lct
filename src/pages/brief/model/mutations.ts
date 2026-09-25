import { useMutation } from '@tanstack/react-query'
import { uploadContentPack } from '@/entities/content-pack'
import { startGeneration, whenGenerationAccepted } from '@/entities/generation'
import { rememberRun, useInvalidateProject } from '@/entities/project'
import { resolveContent, toBrief, toGenerationBody } from '../lib/brief'
import type { BriefForm, ParsedContent } from './form'

export interface ContentUploadRequest {
  file: File
  key: string
  label: string
  brief: Record<string, unknown>
}

async function uploadContent(projectId: string, { file, key, label, brief }: ContentUploadRequest): Promise<ParsedContent> {
  const accepted = await uploadContentPack(projectId, [file], brief)
  if (accepted.job.state === 'failed') throw new Error(accepted.job.error?.message ?? 'Не удалось разобрать контент')
  return { packId: accepted.content_pack.id, sourceKey: key, label, sizeBytes: file.size }
}

export function useContentUpload(projectId: string) {
  const invalidateProject = useInvalidateProject()
  return useMutation({
    mutationFn: (request: ContentUploadRequest) => uploadContent(projectId, request),
    onSuccess: () => invalidateProject(projectId),
  })
}

export interface SubmitBriefRequest {
  form: BriefForm
  files: readonly File[]
  templateId: string
  providerSessionId: string | null
  onParsed?: (parsed: ParsedContent) => void
}

export function useSubmitBrief(projectId: string) {
  const invalidateProject = useInvalidateProject()
  return useMutation({
    mutationFn: async ({ form, files, templateId, providerSessionId, onParsed }: SubmitBriefRequest): Promise<string> => {
      const brief = toBrief(form)
      const plan = resolveContent({ mode: form.contentMode, files, text: form.text, parsed: form.parsed })
      if (plan.kind === 'missing') throw new Error('Добавьте контент: файл или текст')
      let contentPackId: string
      if (plan.kind === 'upload') {
        const parsed = await uploadContent(projectId, { file: plan.file, key: plan.key, label: plan.label, brief })
        onParsed?.(parsed)
        contentPackId = parsed.packId
      } else {
        contentPackId = plan.packId
      }
      const trackingId = startGeneration(projectId, toGenerationBody({ brief, templateId, contentPackId, useLlm: form.useLlm, providerSessionId }))
      whenGenerationAccepted(trackingId)?.then(
        (accepted) => rememberRun(projectId, accepted.generation_id),
        () => undefined,
      )
      void invalidateProject(projectId)
      return trackingId
    },
  })
}
