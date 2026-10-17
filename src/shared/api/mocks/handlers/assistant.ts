import { http, HttpResponse } from 'msw'
import type { RequestHandler } from 'msw'
import { API_BASE } from '@/shared/config'
import type { MockContext } from '../context'
import { json, notFound, validationError } from '../http'
import { prefixedId } from '../ids'
import { isRecord, readJson } from '../validate'

type Object = Record<string, unknown>
type Scenario = 'idea' | 'data'
const fixtures = import.meta.glob<{ body: Object }>(['../fixtures/assistant/*.json', '!../fixtures/assistant/artifact-*.json'], { eager: true, import: 'default' })
const artifacts = import.meta.glob<{ body: { mime_type: string; base64: string } }>('../fixtures/assistant/artifact-*.json', { import: 'default' })
const fixture = (scenario: Scenario, label: string): Object => structuredClone(fixtures[`../fixtures/assistant/${scenario}-${label}.json`]?.body ?? {})
const objects = (value: unknown): Object[] => Array.isArray(value) ? value.filter(isRecord) : []
const object = (value: unknown): Object => isRecord(value) ? value : {}

interface SessionState {
  scenario: Scenario
  session: Object
  intake: Object
  questions: Object
}
interface PackState {
  projectId: string
  understanding: Object
}

export function assistantHandlers({ router, store }: MockContext): RequestHandler[] {
  const states = new Map<string, SessionState>()
  const packs = new Map<string, PackState>()
  const plans = new Map<string, Object>()
  const previewProjects = new Map<string, string>()
  const jobs = new Map<string, { scenario: Scenario; label: string; projectId: string }>()
  const priorities = new Map<string, string>()
  for (const scenario of ['idea', 'data'] as const) {
    const project = fixture(scenario, 'project')
    const intake = fixture(scenario, 'intake')
    states.set(String(project.id), { scenario, session: fixture(scenario, 'session-initial'), intake, questions: fixture(scenario, 'questions') })
    for (const label of ['understanding', 'understanding-edited']) {
      const understanding = fixture(scenario, label)
      packs.set(String(understanding.content_pack_id), { projectId: String(project.id), understanding })
    }
    plans.set(String(fixture(scenario, 'plan').plan_id), fixture(scenario, 'plan'))
    if (scenario === 'idea') jobs.set(String(fixture(scenario, 'autopilot').job_id), { scenario, label: 'autopilot', projectId: String(project.id) })
    else {
      jobs.set(String(fixture(scenario, 'style-start').job_id), { scenario, label: 'style', projectId: String(project.id) })
      jobs.set(String(fixture(scenario, 'generation').job_id), { scenario, label: 'generation', projectId: String(project.id) })
    }
  }
  function state(id: string): SessionState {
    const saved = states.get(id)
    if (saved) return saved
    const project = store.project(id)
    const session = fixture('idea', 'session-initial')
    session.artifacts = { template_id: project.template_id, content_pack_id: project.content_pack_id }
    const created = { scenario: 'idea' as const, session, intake: {}, questions: fixture('idea', 'questions') }
    states.set(id, created)
    return created
  }
  function mark(projectId: string, step: number, completed: number[]) {
    const current = state(projectId)
    current.session = { ...current.session, step, completed_steps: completed }
  }
  function pack(id: string): PackState {
    const current = packs.get(id)
    if (!current) throw notFound('Content pack', id)
    return current
  }
  function plan(id: string): Object {
    const current = plans.get(id)
    if (!current) throw notFound('Plan', id)
    return current
  }
  function editPack(id: string, update: (understanding: Object) => Object): Object {
    const current = pack(id)
    const packId = prefixedId('pack')
    const understanding = { ...update(structuredClone(current.understanding)), content_pack_id: packId }
    packs.set(packId, { projectId: current.projectId, understanding })
    const currentState = state(current.projectId)
    currentState.session.artifacts = { ...object(currentState.session.artifacts), content_pack_id: packId, plan_id: null, preview_id: null, generation_id: null }
    currentState.questions = fixture(currentState.scenario, 'questions')
    mark(current.projectId, 2, [1])
    store.touchProject(current.projectId, { content_pack_id: packId })
    return { content_pack_id: packId, filled_from: id, understanding }
  }
  const { route } = router
  return [
    http.get(`*${API_BASE}/artifacts/:artifactId/download`, async ({ params }) => {
      const load = artifacts[`../fixtures/assistant/artifact-${String(params.artifactId)}.json`]
      if (!load) return
      const { body } = await load()
      const bytes = Uint8Array.from(atob(body.base64), (char) => char.charCodeAt(0))
      return new HttpResponse(bytes, { headers: { 'Content-Type': body.mime_type } })
    }),
    route('get', '/projects/:projectId/session', ({ param }) => json(state(param('projectId')).session)),
    route('post', '/projects/:projectId/intake', async ({ request, param }) => {
      const projectId = param('projectId')
      const current = state(projectId)
      const form = await request.formData()
      const files = form.getAll('files').filter((file): file is File => typeof file !== 'string')
      const idea = form.get('idea')
      if (!files.length && !(typeof idea === 'string' && idea.trim())) throw validationError('files', 'Добавьте файлы или идею')
      const scenario = files.some((file) => /\.(csv|xlsx)$/.test(file.name)) ? 'data' : 'idea'
      const intake = fixture(scenario, 'intake')
      const packId = prefixedId('pack')
      intake.project_id = projectId
      intake.content_pack_id = packId
      intake.files = files.map((file) => {
        const kind = /\.(pptx|potx)$/i.test(file.name) ? 'template' : /\.(csv|xlsx)$/i.test(file.name) ? 'data' : /brand|бренд|tokens/i.test(file.name) ? 'brandbook' : 'content'
        const example = objects(intake.files).find((f) => f.kind === kind) ?? objects(fixture('data', 'brand-intake').files)[0]
        return { ...example, name: file.name, kind, detected_kind: kind, accepted: true, size_bytes: file.size }
      })
      if (!files.some((file) => /\.(pptx|potx)$/i.test(file.name))) intake.template_id = object(current.session.artifacts).template_id ?? null
      if (objects(intake.files).some((file) => file.kind === 'brandbook')) intake.brandbook_id = fixture('data', 'brandbook').id
      current.scenario = scenario
      current.intake = intake
      current.questions = fixture(scenario, 'questions')
      const understanding = fixture(scenario, 'understanding')
      understanding.content_pack_id = packId
      packs.set(packId, { projectId, understanding })
      current.session = { ...fixture(scenario, 'session-initial'), artifacts: { template_id: intake.template_id, content_pack_id: packId, brandbook_id: intake.brandbook_id, plan_id: null, preview_id: null, generation_id: null } }
      mark(projectId, 2, [1])
      store.touchProject(projectId, { template_id: String(intake.template_id ?? ''), content_pack_id: packId })
      return json(intake, 202)
    }),
    route('patch', '/projects/:projectId/intake/files/:name', async ({ request, param }) => {
      const current = state(param('projectId'))
      const body = await readJson(request)
      if (!['template', 'content', 'data', 'brandbook', 'unknown'].includes(String(body.kind))) throw validationError('kind', 'Неизвестный тип файла')
      const file = objects(current.intake.files).find((file) => file.name === param('name'))
      if (!file) throw notFound('Intake file', param('name'))
      file.kind = body.kind
      file.reason = 'тип выбран вручную'
      return json(current.intake)
    }),
    route('get', '/templates/:templateId/summary', ({ param }) => json({ ...fixture('data', 'template-summary'), template_id: param('templateId') })),
    route('get', '/brandbooks/:brandbookId', ({ param }) => json({ ...fixture('data', 'brandbook'), id: param('brandbookId') })),
    route('get', '/brandbooks/:brandbookId/summary', ({ param }) => json({ ...fixture('data', 'brand-summary'), id: param('brandbookId'), priority: priorities.get(param('brandbookId')) ?? 'brandbook' })),
    route('patch', '/brandbooks/:brandbookId', async ({ request, param }) => {
      const body = await readJson(request)
      if (body.priority !== 'template' && body.priority !== 'brandbook') throw validationError('priority', 'Неизвестный приоритет')
      priorities.set(param('brandbookId'), body.priority)
      return json({ ...fixture('data', body.priority === 'template' ? 'brand-priority' : 'brand-summary'), id: param('brandbookId') })
    }),
    route('get', '/content-packs/:packId/understanding', ({ param }) => {
      const current = pack(param('packId'))
      mark(current.projectId, 3, [1, 2])
      return json(current.understanding)
    }),
    route('patch', '/content-packs/:packId/blocks', async ({ request, param }) => {
      const body = await readJson(request)
      return json(editPack(param('packId'), (understanding) => {
        let blocks = objects(understanding.blocks)
        for (const op of objects(body.ops)) {
          const index = blocks.findIndex((block) => block.id === op.block_id)
          if (index < 0) throw notFound('Block', String(op.block_id))
          if (op.op === 'remove') blocks = blocks.filter((block) => block.id !== op.block_id)
          else if (op.op === 'edit') blocks[index] = { ...blocks[index], ...Object.fromEntries(Object.entries(op).filter(([key]) => ['title', 'text', 'items'].includes(key))) }
          else if (op.op === 'move') {
            const [moved] = blocks.splice(index, 1)
            if (moved) blocks.splice(Number(op.index), 0, moved)
          } else if (op.op === 'merge') {
            const target = blocks.find((block) => block.id === op.into)
            if (!target) throw notFound('Block', String(op.into))
            target.text = [target.text, blocks[index]?.text].filter(Boolean).join('\n')
            blocks.splice(index, 1)
          } else throw validationError('op', 'Неизвестное действие')
        }
        return { ...understanding, blocks }
      }))
    }),
    route('patch', '/content-packs/:packId/insights/:insightId', async ({ request, param }) => {
      const current = pack(param('packId'))
      const body = await readJson(request)
      const insight = objects(current.understanding.datasets).flatMap((dataset) => objects(dataset.insights)).find((insight) => insight.id === param('insightId'))
      if (!insight) throw notFound('Insight', param('insightId'))
      Object.assign(insight, body, typeof body.text === 'string' ? { headline: body.text, confirmed: true } : {})
      if (body.confirmed !== undefined && insight.implication) insight.needs_confirmation = !body.confirmed
      return json(insight)
    }),
    route('post', '/content-packs/:packId/notes', async ({ request, param }) => {
      const body = await readJson(request)
      return json(editPack(param('packId'), (understanding) => ({ ...understanding, blocks: [...objects(understanding.blocks), ...Array.isArray(body.items) ? body.items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((text, index) => ({ id: `b:notes:${index}`, kind: 'fact', title: 'Тезисы автора', text })) : []] })))
    }),
    route('get', '/projects/:projectId/questions', ({ param }) => json(state(param('projectId')).questions)),
    route('post', '/projects/:projectId/answers', async ({ request, param }) => {
      const current = state(param('projectId'))
      const body = await readJson(request)
      const response = fixture(current.scenario, 'answers')
      response.brief = { ...object(current.session.brief), ...object(response.brief), ...object(body.answers) }
      current.session.brief = response.brief
      current.questions.questions = []
      mark(param('projectId'), 4, [1, 2, 3])
      return json(response)
    }),
    http.post(`*${API_BASE}/projects/:projectId/plans`, async ({ request, params }) => {
      const projectId = String(params.projectId)
      const current = states.get(projectId)
      if (!current || !current.intake.content_pack_id) return undefined
      const body = object(await request.json())
      const result = fixture(current.scenario, 'plan')
      result.project_id = projectId
      result.content_pack_id = body.content_pack_id
      result.template_id = body.template_id
      plans.set(String(result.plan_id), result)
      current.session.artifacts = { ...object(current.session.artifacts), plan_id: result.plan_id }
      mark(projectId, 5, [1, 2, 3, 4])
      return json(result)
    }),
    ...(['patch', 'post'] as const).map((method) => route(method, `/plans/:planId/slides/:slideId${method === 'post' ? '/actions' : ''}`, async ({ request, param }) => {
      const current = plan(param('planId'))
      const body = await readJson(request)
      const deck = object(objects(current.plans)[0]?.deck_plan)
      const slides = objects(deck.slides)
      const slide = slides.find((slide) => slide.id === param('slideId'))
      if (!slide) throw notFound('Slide', param('slideId'))
      if (method === 'patch') {
        const chart = object(slide.chart)
        const allowed = [chart.type, ...objects(chart.alternatives).map((item) => item.type), 'table']
        if (!allowed.includes(body.chart_type)) throw validationError('chart_type', 'Этот тип не подходит данным')
        slide.chart = { ...chart, type: body.chart_type }
      } else if (body.action === 'remove') deck.slides = slides.filter((item) => item !== slide)
      else if (body.action === 'shorten') {
        slide.content_units = objects(slide.content_units).slice(0, Math.max(1, Math.ceil(objects(slide.content_units).length / 2)))
      } else if (body.action === 'to_diagram' || body.action === 'to_chart') slide.desired_visual = body.action === 'to_chart' ? 'chart' : 'diagram'
      else if (body.action === 'split') deck.slides = slides.flatMap((item) => item === slide ? [slide, { ...structuredClone(slide), id: prefixedId('slide') }] : [item])
      else if (body.action === 'merge_next') {
        const index = slides.indexOf(slide)
        const next = slides[index + 1]
        if (next) { slide.content_units = [...objects(slide.content_units), ...objects(next.content_units)]; deck.slides = slides.filter((item) => item !== next) }
      } else throw validationError('action', 'Неизвестное действие')
      objects(deck.slides).forEach((item, index) => { item.index = index })
      return json(current)
    })),
    route('post', '/plans/:planId/style-previews', ({ param }) => {
      const current = plan(param('planId'))
      const started = fixture('data', 'style-start')
      jobs.set(String(started.job_id), { scenario: 'data', label: 'style', projectId: String(current.project_id) })
      previewProjects.set(String(started.preview_id), String(current.project_id))
      return json(started, 202)
    }),
    route('get', '/style-previews/:previewId', ({ param }) => json({ ...fixture('data', 'style-preview'), preview_id: param('previewId') })),
    route('post', '/projects/:projectId/session/autopilot', async ({ request, param }) => {
      const current = state(param('projectId'))
      const body = await readJson(request)
      if (Number(body.from_step) < 1 || Number(body.from_step) > 7) throw validationError('from_step', 'Неизвестный шаг')
      const response = fixture('idea', 'autopilot')
      current.session.job_id = response.job_id
      mark(param('projectId'), 6, [1, 2, 3, 4, 5])
      jobs.set(String(response.job_id), { scenario: 'idea', label: 'autopilot', projectId: param('projectId') })
      return json(response, 202)
    }),
    http.get(`*${API_BASE}/jobs/:jobId/events`, ({ params, request }) => {
      const current = jobs.get(String(params.jobId))
      if (!current) return undefined
      const url = new URL(request.url)
      const after = Math.max(Number(url.searchParams.get('after') ?? 0), Number(request.headers.get('Last-Event-ID') ?? 0))
      if (!Number.isSafeInteger(after) || after < 0) return json({ error: { code: 'invalid_input', message: 'Invalid cursor' } }, 422)
      const raw = String(fixture(current.scenario, `${current.label}-events`).sse ?? '')
      const frames = raw.replace(/\r\n/g, '\n').split('\n\n').filter((frame) => Number(/^id: (\d+)/m.exec(frame)?.[1] ?? 0) > after)
      const encoder = new TextEncoder()
      let index = 0
      return new HttpResponse(new ReadableStream({
        pull(controller) {
          const frame = frames[index++]
          if (frame === undefined) {
            const currentState = state(current.projectId)
            if (current.label === 'autopilot' || current.label === 'generation') {
              currentState.session = { ...fixture(current.scenario, 'session-final'), job_id: null }
            } else {
              currentState.session.artifacts = { ...object(currentState.session.artifacts), preview_id: fixture('data', 'style-start').preview_id }
            }
            controller.close()
          } else controller.enqueue(encoder.encode(`${frame}\n\n`))
        },
      }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
    }),
    http.get(`*${API_BASE}/jobs/:jobId`, ({ params }) => {
      const current = jobs.get(String(params.jobId))
      return current ? json(fixture(current.scenario, `${current.label}-job`)) : undefined
    }),
    http.post(`*${API_BASE}/projects/:projectId/generations`, async ({ params }) => {
      const current = states.get(String(params.projectId))
      if (!current?.intake.content_pack_id) return
      const detail = fixture(current.scenario, 'generation-detail')
      const response = { generation_id: detail.id, job_id: detail.job_id, variant_ids: objects(detail.variants).map((variant) => variant.id) }
      jobs.set(String(detail.job_id), { scenario: current.scenario, label: current.scenario === 'idea' ? 'autopilot' : 'generation', projectId: String(params.projectId) })
      current.session.job_id = detail.job_id
      current.session.artifacts = { ...object(current.session.artifacts), generation_id: detail.id }
      mark(String(params.projectId), 6, [1, 2, 3, 4, 5])
      return json(response, 202)
    }),
    http.get(`*${API_BASE}/generations/:runId/variants`, ({ params }) => {
      const scenario = (['idea', 'data'] as const).find((scenario) => fixture(scenario, 'generation-detail').id === params.runId)
      return scenario ? json(fixture(scenario, 'variants')) : undefined
    }),
    http.get(`*${API_BASE}/variants/:variantId`, ({ params }) => {
      const variants = (['idea', 'data'] as const).flatMap((scenario) => objects(fixture(scenario, 'variants').items))
      const found = variants.find((variant) => variant.id === params.variantId)
      return found ? json(found) : undefined
    }),
    http.get(`*${API_BASE}/variants/:variantId/slides`, ({ params }) => {
      const scenario = (['idea', 'data'] as const).find((scenario) => objects(fixture(scenario, 'variants').items).some((variant) => variant.id === params.variantId))
      return scenario ? json(fixture(scenario, 'slides')) : undefined
    }),
    http.get(`*${API_BASE}/generations/:runId`, ({ params }) => {
      const found = (['idea', 'data'] as const).map((scenario) => fixture(scenario, 'generation-detail')).find((item) => item.id === params.runId)
      return found ? json(found) : undefined
    }),
    route('get', '/slides/:slideId/explain', ({ param }) => json({ ...fixture('data', param('slideId') === fixture('data', 'chart-slide').id ? 'chart-explain' : 'slide-explain'), slide_id: param('slideId') })),
    http.get(`*${API_BASE}/slides/:slideId`, ({ params }) => {
      const found = (['idea', 'data'] as const).flatMap((scenario) => objects(fixture(scenario, 'slides').items)).find((item) => item.id === params.slideId)
      return found ? json(found) : undefined
    }),
    route('post', '/variants/:variantId/slides/:slideId/regenerate', async ({ request, param }) => {
      const body = await readJson(request)
      if (!['shorter', 'other_layout', 'other_chart', 'style:faithful', 'style:balanced', 'style:visual'].includes(String(body.action))) throw validationError('action', 'Неизвестное действие')
      const result = fixture('data', 'regenerate')
      result.variant_id = param('variantId')
      result.slide = { ...object(result.slide), id: param('slideId'), variant_id: param('variantId') }
      return json(result)
    }),
  ]
}
