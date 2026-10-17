import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const noteKey = (projectId: string) => ['assistant', 'bar-note', projectId] as const

export function useAssistantBarNote(projectId: string): string | null {
  const query = useQuery<string | null>({ queryKey: noteKey(projectId), enabled: false, staleTime: Infinity, gcTime: Infinity })
  return query.data ?? null
}

export function useReportAssistantNote(projectId: string, note: string | null) {
  const client = useQueryClient()
  useEffect(() => {
    client.setQueryData(noteKey(projectId), note)
    return () => {
      client.setQueryData(noteKey(projectId), null)
    }
  }, [client, projectId, note])
}
