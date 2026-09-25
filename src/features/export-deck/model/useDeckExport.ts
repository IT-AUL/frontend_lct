import { useCallback } from 'react'
import { useCreateExport, type ExportFormat } from '@/entities/passport'
import { markEvidence } from '@/entities/project'
import type { DeckFile } from '@/entities/variant'
import { deriveExportState, type ExportState } from './exportState'

interface DeckExportOptions {
  projectId: string
  variantId: string
  format: ExportFormat
  file: DeckFile | null
  currentRevision: number | null
  supported: boolean
}

export interface DeckExport {
  state: ExportState
  create: () => void
  markDownloaded: () => void
}

export function useDeckExport({ projectId, variantId, format, file, currentRevision, supported }: DeckExportOptions): DeckExport {
  const mutation = useCreateExport(variantId)
  const { mutate } = mutation
  const state = deriveExportState({
    format,
    file,
    currentRevision,
    supported,
    mutation: { status: mutation.status, data: mutation.data, error: mutation.error },
  })

  const create = useCallback(() => {
    mutate([format], {
      onSuccess: (result) => {
        if (result.status === 'created' && format === 'pptx' && projectId) markEvidence(projectId, 'exported')
      },
    })
  }, [format, mutate, projectId])

  const markDownloaded = useCallback(() => {
    if (format === 'pptx' && projectId) markEvidence(projectId, 'exported')
  }, [format, projectId])

  return { state, create, markDownloaded }
}
