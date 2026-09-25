import { useQuery } from '@tanstack/react-query'
import { loadPdf } from './pdf'

export function usePdfDocument(url: string | null | undefined) {
  return useQuery({
    queryKey: ['pdf', url],
    queryFn: () => loadPdf(url as string),
    enabled: Boolean(url),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  })
}
