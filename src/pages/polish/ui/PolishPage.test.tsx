import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { clearOpenCounts, type AuditIssue, type AuditRun } from '@/entities/audit'
import { api } from '@/shared/api'
import { generationFixture as generation, passportFixture, variantFixtures as fixtures } from '@/shared/api/mocks'
import { routes } from '@/shared/config'
import { ToastProvider } from '@/shared/ui'
import { PolishPage } from './PolishPage'

vi.mock('@/shared/ui', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return {
    ...original,
    PdfPage: ({ pageNumber, imageUrl, label, children }: { pageNumber: number; imageUrl?: string | null; label?: string; children?: ReactNode }) => (
      <div data-testid="pdf-page" data-page={pageNumber} data-image={imageUrl ?? ''} aria-label={label}>
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
  body?: Record<string, unknown>
}

let issues: AuditIssue[]
let audit: AuditRun
let postSpy: MockInstance
let regenUnsupported: boolean
let regenRejected: boolean

function ok(data: unknown) {
  return Promise.resolve({ data, error: undefined, response: new Response(null, { status: 200 }) })
}

function fail(path: string, status = 404, code = 'not_found', message?: string) {
  return Promise.resolve({
    data: undefined,
    error: { error: { code, message: message ?? `unexpected ${path}`, stage: null, retryable: false, request_id: 'req_test' } },
    response: new Response(null, { status }),
  })
}

function fakeGet(path: string, init?: FakeInit) {
  const params = init?.params?.path ?? {}
  const variant = Object.values(fixtures).find((candidate) => candidate.variant.id === params.variant_id)
  switch (path) {
    case '/api/v1/projects/{project_id}/session':
      return ok({
        step: 7,
        completed_steps: [1, 2, 3, 4, 5, 6],
        skipped_steps: [],
        artifacts: {
          template_id: generation.template_id,
          content_pack_id: generation.content_pack_id,
          brandbook_id: null,
          plan_id: generation.deck_plan_id,
          preview_id: null,
          generation_id: RUN_ID,
        },
        brief: generation.deck_plan?.brief ?? {},
        assistant_note: 'Готово, можно посмотреть и доработать слайды.',
        job_id: null,
      })
    case '/api/v1/projects/{project_id}':
      return ok({
        id: PROJECT_ID,
        name: 'Защита продукта DeckDNA',
        status: 'ready',
        default_language: 'ru',
        target_slide_count: 12,
        template_id: generation.template_id,
        content_pack_id: generation.content_pack_id,
        created_at: generation.created_at,
        updated_at: generation.created_at,
      })
    case '/api/v1/generations/{run_id}':
      return ok(generation)
    case '/api/v1/generations/{run_id}/variants':
      return ok({ items: Object.values(fixtures).map((candidate) => candidate.variant) })
    case '/api/v1/variants/{variant_id}':
      return variant ? ok(variant.variant) : fail(path)
    case '/api/v1/variants/{variant_id}/slides':
      return ok({ items: variant?.slides ?? [] })
    case '/api/v1/exports/{export_id}':
      return ok(deck.export)
    case '/api/v1/artifacts/{artifact_id}/download':
      return ok(passportFixture)
    case '/api/v1/audits/{audit_id}':
      return ok(audit)
    case '/api/v1/audits/{audit_id}/issues':
      return ok({ items: issues })
    case '/api/v1/capabilities':
      return ok({ exports: { pptx: true, pdf: true, html: false }, features: { png_previews: true } })
    case '/api/v1/version':
      return ok({ version: '0.3.0', skill_version: '0.3.0' })
    case '/api/v1/skill/manifest':
      return ok({ version: '0.3.0' })
    case '/api/v1/slides/{slide_id}/explain': {
      const slideId = params.slide_id ?? ''
      const dataSlide = deck.slides.find((item) => item.purpose === 'data')
      if (slideId === dataSlide?.id) {
        return ok({
          slide_id: slideId,
          slide_plan_id: dataSlide.slide_plan_id,
          title: dataSlide.title,
          dataset: { id: 'ds-1', title: 'Purchases', file: 'purchases.csv', rows: 8755 },
          profile_summary: '8755 строк; 6 колонок; период 01.10.2024 – 30.09.2026',
          task: 'trend',
          task_ru: 'динамика',
          aggregation: 'сумма по месяцам',
          chosen: { type: 'line', reasons: ['24 точки по месяцам', 'одна метрика'] },
          alternatives: [
            { type: 'bar', reasons: ['24 периода, каждый столбцом'] },
            { type: 'table', reasons: ['точные значения важнее формы'] },
          ],
          rejected: [{ type: 'pie', reasons: ['доли показывают для категорий, а не для ряда'] }],
          insights: [{ id: 'ins-1', fact: 'Выручка: рост в 2,1 раза за 24 месяца' }],
          source: 'Источник: purchases.csv; сумма по месяцам',
          assistant_note: 'Линия: 24 точки по месяцам, одна метрика; задача: динамика.',
        })
      }
      return ok({
        slide_id: slideId,
        slide_plan_id: 'slide-0',
        title: 'Обложка',
        dataset: null,
        assistant_note: 'На этом слайде нет графика из данных.',
      })
    }
    case '/api/v1/jobs/{job_id}':
      return ok({ id: 'job_repair', state: 'completed', result_ids: { applied: '1', skipped: '0', failed: '0', not_implemented: '0', unresolved: '0' } })
    default:
      return fail(path)
  }
}

function fakePost(path: string, init?: FakeInit) {
  const params = init?.params?.path ?? {}
  switch (path) {
    case '/api/v1/variants/{variant_id}/audits':
      return ok({ audit_id: audit.id, job_id: 'job_audit' })
    case '/api/v1/audits/{audit_id}/repairs': {
      const selected = (init?.body?.selected_issue_ids as string[] | undefined) ?? []
      const revision = audit.deck_revision + 1
      issues = issues
        .filter((issue) => !selected.includes(issue.id))
        .map((issue) => ({ ...issue, deck_revision: revision }))
      audit = { ...audit, deck_revision: revision }
      return ok({ job_id: 'job_repair', audit_id: audit.id, deck_revision: revision })
    }
    case '/api/v1/variants/{variant_id}/slides/{slide_id}/regenerate': {
      if (regenUnsupported) return fail(path, 501, 'not_implemented')
      if (regenRejected) return fail(path, 422, 'invalid_input', 'В шаблоне нет другой раскладки для этого слайда')
      const slideId = params.slide_id ?? ''
      const action = String(init?.body?.action ?? 'shorter')
      const existing = deck.slides.find((item) => item.id === slideId) ?? deck.slides[0]
      return ok({
        variant_id: params.variant_id ?? VARIANT_ID,
        slide: {
          ...existing,
          id: slideId,
          variant_id: params.variant_id ?? VARIANT_ID,
          revision: 2,
          preview_artifact_id: 'art_regen_preview_2',
        },
        deck_revision: 2,
        deck_artifact_id: 'art_regen_deck_2',
        exemplar: 'ppt/slides/slide24.xml',
        preview_artifact_id: 'art_regen_preview_2',
        issues: [],
        assistant_note: action === 'other_chart' ? 'Поменял график.' : 'Сделал слайд короче.',
      })
    }
    case '/api/v1/projects/{project_id}/session/autopilot':
      return ok({ job_id: 'job_auto_7', events_url: '/api/v1/jobs/job_auto_7/events' })
    default:
      return fail(path)
  }
}

function renderPolish(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId/runs/:runId/polish/:variantId?', element: <PolishPage /> },
      { path: '/projects/:projectId/runs/:runId/audit/:variantId?', element: <div>audit page</div> },
      { path: '/projects/:projectId/runs/:runId', element: <div>run page</div> },
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

beforeEach(() => {
  window.localStorage.clear()
  issues = structuredClone(deck.issues)
  audit = structuredClone(deck.audit)
  regenUnsupported = false
  regenRejected = false
  vi.spyOn(api, 'GET').mockImplementation(fakeGet as unknown as typeof api.GET)
  postSpy = vi.spyOn(api, 'POST').mockImplementation(fakePost as unknown as typeof api.POST) as unknown as MockInstance
})

afterEach(() => {
  clearOpenCounts()
  vi.restoreAllMocks()
})

describe('PolishPage', { timeout: 20_000 }, () => {
  it('redirects to the default balanced variant and preserves slide query param', async () => {
    const router = renderPolish(`${routes.polish(PROJECT_ID, RUN_ID)}?slide=3`)
    await waitFor(() => expect(router.state.location.pathname).toBe(routes.polish(PROJECT_ID, RUN_ID, VARIANT_ID)))
    expect(router.state.location.search).toBe('?slide=3')
    expect(await screen.findByText('03 / 12')).toBeInTheDocument()
  })

  it('shows chart explanation (Вход → Профиль → Задача → Почему этот тип) and regenerates a single slide', async () => {
    const user = userEvent.setup()
    renderPolish(`${routes.polish(PROJECT_ID, RUN_ID, VARIANT_ID)}?slide=3`)

    const explainSection = await screen.findByRole('region', { name: 'Почему так' })
    await waitFor(() => expect(within(explainSection).getByText(/purchases\.csv/)).toBeInTheDocument())
    expect(within(explainSection).getByText(/8755 строк; 6 колонок/)).toBeInTheDocument()
    expect(within(explainSection).getByText(/Динамика во времени → Линия/)).toBeInTheDocument()
    expect(within(explainSection).getByText(/Выручка: рост в 2,1 раза за 24 месяца/)).toBeInTheDocument()

    const reworkSection = screen.getByRole('region', { name: 'Переделать слайд' })
    const shorterBtn = within(reworkSection).getByRole('button', { name: 'Короче' })
    await user.click(shorterBtn)

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/variants/{variant_id}/slides/{slide_id}/regenerate',
        expect.objectContaining({
          params: { path: { variant_id: VARIANT_ID, slide_id: deck.slides[2]?.id } },
          body: { action: 'shorter' },
        }),
      ),
    )

    expect(await screen.findByText('Сделал слайд короче.')).toBeInTheDocument()
    expect(within(reworkSection).getByText('Образец шаблона: слайд #24')).toBeInTheDocument()
  })

  it('switches chart type via alternative chip in the explain card', async () => {
    const user = userEvent.setup()
    renderPolish(`${routes.polish(PROJECT_ID, RUN_ID, VARIANT_ID)}?slide=3`)

    const explainSection = await screen.findByRole('region', { name: 'Почему так' })
    const altGroup = await within(explainSection).findByRole('group', { name: 'Альтернативные типы графика' })
    await user.click(within(altGroup).getByRole('button', { name: 'Столбцы' }))

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/variants/{variant_id}/slides/{slide_id}/regenerate',
        expect.objectContaining({
          body: { action: 'other_chart', chart_type: 'bar' },
        }),
      ),
    )
    expect(await screen.findByText('Поменял график.')).toBeInTheDocument()
  })

  it('degrades quietly when regenerate endpoint returns 501', async () => {
    regenUnsupported = true
    const user = userEvent.setup()
    renderPolish(`${routes.polish(PROJECT_ID, RUN_ID, VARIANT_ID)}?slide=1`)

    const reworkSection = await screen.findByRole('region', { name: 'Переделать слайд' })
    await user.click(within(reworkSection).getByRole('button', { name: 'Другая раскладка' }))

    expect(await within(reworkSection).findByText(/не поддерживается текущим сервером/)).toBeInTheDocument()
  })

  it('disables a rejected chip with the server reason on HTTP 422', async () => {
    regenRejected = true
    const user = userEvent.setup()
    renderPolish(`${routes.polish(PROJECT_ID, RUN_ID, VARIANT_ID)}?slide=1`)

    const reworkSection = await screen.findByRole('region', { name: 'Переделать слайд' })
    const chip = within(reworkSection).getByRole('button', { name: 'Другая раскладка' })
    await user.click(chip)

    await waitFor(() => expect(chip).toBeDisabled())
    expect(chip).toHaveAttribute('title', 'В шаблоне нет другой раскладки для этого слайда')
  })

  it('repairs auto-fixable issues on the current slide and opens the quality passport drawer', async () => {
    const user = userEvent.setup()
    renderPolish(`${routes.polish(PROJECT_ID, RUN_ID, VARIANT_ID)}?slide=2`)

    const auditSection = await screen.findByRole('region', { name: 'Что можно улучшить' })
    const fixButton = await within(auditSection).findByRole('button', { name: /^Исправить на слайде/ })
    await user.click(fixButton)

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/audits/{audit_id}/repairs',
        expect.objectContaining({
          body: expect.objectContaining({ max_iterations: 2 }),
        }),
      ),
    )

    await user.click(screen.getByRole('button', { name: 'Паспорт качества' }))
    expect(await screen.findByRole('dialog', { name: 'Паспорт качества' })).toBeInTheDocument()
  })

  it('starts autopilot from step 7 when clicking «Сделай сам»', async () => {
    const user = userEvent.setup()
    const router = renderPolish(`${routes.polish(PROJECT_ID, RUN_ID, VARIANT_ID)}?slide=1`)

    const autoBtn = await screen.findByRole('button', { name: 'Сделай сам' })
    await user.click(autoBtn)

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/projects/{project_id}/session/autopilot',
        expect.objectContaining({
          params: { path: { project_id: PROJECT_ID } },
          body: { from_step: 7 },
        }),
      ),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe(routes.run(PROJECT_ID, 'job_auto_7')))
  })
})
