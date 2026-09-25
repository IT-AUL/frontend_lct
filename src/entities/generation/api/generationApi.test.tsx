import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ApiError } from '@/shared/api'
import { generationKeys, useCancelGeneration } from './generationApi'
import * as requests from './requests'

vi.mock('./requests')

const running = { id: 'run_1', state: 'running', job_id: 'job_1', variants: [] } as never

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useCancelGeneration(), { wrapper }) }
}

describe('useCancelGeneration', () => {
  it('reports a Russian message and refetches when the backend answers 409 after the check', async () => {
    vi.mocked(requests.fetchGeneration).mockResolvedValue(running)
    vi.mocked(requests.requestCancel).mockRejectedValue(
      new ApiError({ code: 'state_conflict', message: 'generation job is already completed; cannot cancel', status: 409 }),
    )
    const { client, result } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    result.current.mutate('run_1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Генерация уже завершена, отменять нечего')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: generationKeys.detail('run_1') })
  })

  it('passes other errors through unchanged', async () => {
    vi.mocked(requests.fetchGeneration).mockResolvedValue(running)
    vi.mocked(requests.requestCancel).mockRejectedValue(new ApiError({ code: 'internal_error', message: 'boom', status: 500 }))
    const { result } = setup()

    result.current.mutate('run_1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('boom')
  })
})
