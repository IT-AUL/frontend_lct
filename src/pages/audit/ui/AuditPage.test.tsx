import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { canAutoFix, type AuditIssue, type AuditRun } from '@/entities/audit'
import { api } from '@/shared/api'
import { generationFixture as generation, variantFixtures as fixtures } from '@/shared/api/mocks'
import { routes } from '@/shared/config'
import { ToastProvider } from '@/shared/ui'
import { AuditPage } from './AuditPage'

vi.mock('@/shared/ui', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return {
    ...original,
    PdfPage: ({ pageNumber, label, children }: { pageNumber: number; label?: string; children?: ReactNode }) => (
      <div data-testid="pdf-page" data-page={pageNumber} aria-label={label}>
        {children}
      </div>
    ),
  }
})

const PROJECT_ID = generation.project_id
const RUN_ID = generation.id
const deck = fixtures.balanced
const VARIANT_ID = deck.variant.id

interface FakeInit {
  params?: { path?: Record<string, string> }
  body?: { selected_issue_ids?: string[]; reason?: string }
}

let issues: AuditIssue[]
let audit: AuditRun
let postSpy: MockInstance
let repairCreatesAudit: boolean
let auditRequestFails: boolean
let archived: Map<string, { run: AuditRun; items: AuditIssue[] }>

function ok(data: unknown) {
  return Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) })
}

function fail(path: string) {
  return Promise.resolve({
    data: undefined,
    error: { error: { code: 'not_found', message: `unexpected ${path}`, stage: null, retryable: false, request_id: 'req_test' } },
    response: new Response(null, { status: 404 }),
  })
}

function fakeGet(path: string, init?: FakeInit) {
  const params = init?.params?.path ?? {}
  const variant = Object.values(fixtures).find((candidate) => candidate.variant.id === params.variant_id)
  switch (path) {
    case '/api/v1/generations/{run_id}/variants':
      return ok({ items: Object.values(fixtures).map((candidate) => candidate.variant) })
    case '/api/v1/variants/{variant_id}':
      return variant ? ok(variant.variant) : fail(path)
    case '/api/v1/variants/{variant_id}/slides':
      return ok({ items: variant?.slides ?? [] })
    case '/api/v1/exports/{export_id}':
      return ok(deck.export)
    case '/api/v1/audits/{audit_id}':
      return ok(archived.get(params.audit_id ?? '')?.run ?? audit)
    case '/api/v1/audits/{audit_id}/issues':
      return ok({ items: archived.get(params.audit_id ?? '')?.items ?? issues })
    case '/api/v1/jobs/{job_id}':
      return ok({ id: 'job_repair', state: 'completed', result_ids: { applied: '1', skipped: '0', failed: '0', not_implemented: '0', unresolved: '1' } })
    default:
      return fail(path)
  }
}

function fakePost(path: string, init?: FakeInit) {
  switch (path) {
    case '/api/v1/variants/{variant_id}/audits':
      if (auditRequestFails) return fail(path)
      return ok({ audit_id: repairCreatesAudit ? deck.audit.id : audit.id, job_id: 'job_audit' })
    case '/api/v1/audits/{audit_id}/repairs': {
      const [fixedId, ...rest] = init?.body?.selected_issue_ids ?? []
      const revision = audit.deck_revision + 1
      if (repairCreatesAudit) archived.set(audit.id, { run: audit, items: issues })
      issues = issues
        .filter((issue) => issue.id !== fixedId)
        .map((issue) => ({ ...issue, id: `${issue.id}:r${revision}`, deck_revision: revision, status: rest.includes(issue.id) ? 'open' : issue.status }))
      audit = { ...audit, id: repairCreatesAudit ? `${deck.audit.id}:r${revision}` : audit.id, deck_revision: revision }
      return ok({ job_id: 'job_repair', audit_id: audit.id, deck_revision: revision })
    }
    case '/api/v1/issues/{issue_id}/dismiss': {
      const issue = issues.find((candidate) => candidate.id === init?.params?.path?.issue_id)
      return issue ? ok({ ...issue, status: 'dismissed' }) : fail(path)
    }
    default:
      return fail(path)
  }
}

function renderAudit(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId/runs/:runId/audit/:variantId?', element: <AuditPage /> },
      { path: '*', element: <div>other page</div> },
    ],
    { initialEntries: [url] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return router
}

const fixableCount = deck.issues.filter(canAutoFix).length

beforeEach(() => {
  window.localStorage.clear()
  issues = structuredClone(deck.issues)
  audit = structuredClone(deck.audit)
  repairCreatesAudit = false
  auditRequestFails = false
  archived = new Map()
  vi.spyOn(api, 'GET').mockImplementation(fakeGet as unknown as typeof api.GET)
  postSpy = vi.spyOn(api, 'POST').mockImplementation(fakePost as unknown as typeof api.POST) as unknown as MockInstance
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AuditPage', { timeout: 20_000 }, () => {
  it('opens the default strategy variant and the slide from the query', async () => {
    const router = renderAudit(`${routes.audit(PROJECT_ID, RUN_ID)}?slide=3`)
    await waitFor(() => expect(router.state.location.pathname).toBe(routes.audit(PROJECT_ID, RUN_ID, VARIANT_ID)))
    expect(router.state.location.search).toBe('?slide=3')
    expect(await screen.findByText('03 / 12')).toBeInTheDocument()
  })

  it('shows the D/N split, filters the list and offers checkboxes only for auto-fixable issues', async () => {
    const user = userEvent.setup()
    renderAudit(routes.audit(PROJECT_ID, RUN_ID, VARIANT_ID))

    expect(await screen.findByRole('tab', { name: 'Проблемы · 108' })).toHaveAttribute('aria-selected', 'true')
    const checks = screen.getByRole('group', { name: 'Типы проверок' })
    expect(within(checks).getByText('не запускалась')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /Выбрать для исправления/ })).toHaveLength(fixableCount)
    expect(screen.getAllByRole('article')).toHaveLength(108)

    await user.click(screen.getByRole('radio', { name: 'N · модель 0' }))
    expect(screen.getByText('По этим фильтрам проблем нет.')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Все 108' }))
    await user.click(screen.getByRole('checkbox', { name: 'только исправимые' }))
    expect(screen.getAllByRole('article')).toHaveLength(fixableCount)

    await user.click(screen.getByRole('radio', { name: 'По категориям' }))
    expect(screen.getByRole('region', { name: 'Текст и читаемость' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Шаблон и бренд' })).queryByText('Кегль не из шкалы шаблона')).not.toBeInTheDocument()
  })

  it('repairs selected issues and builds the journal by signature', async () => {
    const user = userEvent.setup()
    renderAudit(routes.audit(PROJECT_ID, RUN_ID, VARIANT_ID))

    const [first, second] = await screen.findAllByRole('checkbox', { name: /Выбрать для исправления/ })
    await user.click(first as HTMLElement)
    await user.click(second as HTMLElement)
    await user.click(screen.getByRole('button', { name: 'Исправить выбранное (2)' }))

    expect(await screen.findByText('Ревизия r2: исправлено 1, не удалось 1')).toBeInTheDocument()
    expect(postSpy).toHaveBeenCalledWith('/api/v1/audits/{audit_id}/repairs', expect.objectContaining({ body: expect.objectContaining({ max_iterations: 2 }) }))
    expect(screen.getByRole('tab', { name: 'Журнал · 2' })).toHaveAttribute('aria-selected', 'true')
    const journal = screen.getByRole('list', { name: 'Журнал изменений' })
    expect(within(journal).getAllByRole('listitem')).toHaveLength(2)
    expect(within(journal).getByText('Не удалось исправить: проблема осталась в новой ревизии')).toBeInTheDocument()
    expect(screen.getByText(/Повторный аудит: осталось \d+ критических/)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('deckdna.evidence.v1') ?? '{}')[PROJECT_ID]).toMatchObject({ repaired: true })

    await user.click(screen.getByRole('tab', { name: /Проблемы/ }))
    await user.click(screen.getByRole('radio', { name: 'Решённые' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('Исправлена')).toBeInTheDocument()
  })

  it('follows the new audit returned by repair even if the variant still points at the old one', async () => {
    repairCreatesAudit = true
    const user = userEvent.setup()
    renderAudit(routes.audit(PROJECT_ID, RUN_ID, fixtures.faithful.variant.id))

    const [first, second] = await screen.findAllByRole('checkbox', { name: /Выбрать для исправления/ })
    await user.click(first as HTMLElement)
    await user.click(second as HTMLElement)
    await user.click(screen.getByRole('button', { name: 'Исправить выбранное (2)' }))

    expect(await screen.findByText('Ревизия r2: исправлено 1, не удалось 1')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Журнал · 2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: `Проблемы · ${deck.issues.length - 1}` })).toBeInTheDocument()
  })

  it('reports a failed re-audit instead of showing stale results', async () => {
    const user = userEvent.setup()
    renderAudit(routes.audit(PROJECT_ID, RUN_ID, VARIANT_ID))

    await screen.findAllByRole('article')
    auditRequestFails = true
    await user.click(screen.getByRole('button', { name: 'Повторный аудит' }))

    expect(await screen.findByText(/Повторный аудит не удался/)).toBeInTheDocument()
    expect(screen.queryByText(/Повторный аудит: осталось/)).not.toBeInTheDocument()
  })

  it('requires a reason to dismiss an issue', async () => {
    const user = userEvent.setup()
    renderAudit(routes.audit(PROJECT_ID, RUN_ID, VARIANT_ID))

    const [card] = await screen.findAllByRole('article')
    await user.click(within(card as HTMLElement).getByRole('button', { expanded: false }))
    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Отклонить…' }))
    const submit = within(card as HTMLElement).getByRole('button', { name: 'Отклонить' })
    expect(submit).toBeDisabled()

    await user.click(within(card as HTMLElement).getByRole('button', { name: 'Ложное срабатывание' }))
    await user.click(submit)

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('/api/v1/issues/{issue_id}/dismiss', expect.objectContaining({ body: { reason: 'Ложное срабатывание' } })),
    )
    expect(await screen.findByRole('tab', { name: 'Журнал · 1' })).toBeInTheDocument()
  })

  it('explains that contextual checks need a model provider', async () => {
    const user = userEvent.setup()
    renderAudit(routes.audit(PROJECT_ID, RUN_ID, VARIANT_ID))

    await user.click(await screen.findByRole('button', { name: /Смысл моделью/ }))
    expect(screen.getByText(/подключите модель/)).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalledWith('/api/v1/variants/{variant_id}/audits', expect.objectContaining({ body: expect.objectContaining({ provider_session_id: expect.any(String) }) }))
  })
})
