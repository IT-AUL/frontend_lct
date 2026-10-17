import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, 'src/shared/api/mocks/fixtures/assistant')
const base = (process.env.API_BASE ?? 'https://deckdna.195-209-218-212.sslip.io/api/v1').replace(/\/$/, '')
const template = process.env.TEMPLATE_PATH ?? '/Users/renat/Downloads/DeckDNA-demo/VK Tech шаблон.pptx'
const data = process.env.DATA_PATH ?? '/Users/renat/dev/LCT-prezi-2026/examples/stage2/purchases.csv'
const brand = process.env.BRAND_PATH ?? '/Users/renat/dev/LCT-prezi-2026/examples/stage2/brandbook/tokens.json'
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
await mkdir(output, { recursive: true })

async function record(scenario, label, path, method = 'GET', body) {
  const filename = resolve(output, `${scenario}-${label}.json`)
  try {
    const saved = JSON.parse(await readFile(filename, 'utf8'))
    if (saved.api_base === base && process.env.RECORD_FRESH !== '1') return saved.status >= 200 && saved.status < 300 ? saved.body : null
  } catch {}
  const started = Date.now()
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : undefined,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(600_000),
  })
  const payload = (response.headers.get('content-type') ?? '').includes('text/event-stream')
    ? { sse: await response.text() }
    : await response.json()
  await writeFile(filename, `${JSON.stringify({ api_base: base, recorded_at: new Date().toISOString(), method, path, status: response.status, request: body instanceof FormData ? [...body.keys()] : body, body: payload }, null, 2)}\n`)
  process.stdout.write(`${scenario} ${label}: ${response.status} (${Date.now() - started}ms)\n`)
  if (!response.ok) return null
  return payload
}

async function waitJob(scenario, label, jobId) {
  if (!jobId) return null
  for (let attempt = 0; attempt < 240; attempt++) {
    const response = await fetch(`${base}/jobs/${jobId}`, { signal: AbortSignal.timeout(30_000) })
    const job = await response.json()
    if (['completed', 'failed', 'canceled'].includes(job.state)) {
      await record(scenario, `${label}-job`, `/jobs/${jobId}`)
      await record(scenario, `${label}-events`, `/jobs/${jobId}/events?after=0`)
      return job
    }
    await delay(1500)
  }
  throw new Error(`Job ${jobId} timed out`)
}

for (const scenario of ['idea', 'data']) {
  const project = await record(scenario, 'project', '/projects', 'POST', { name: `T01 fixtures ${scenario} ${new Date().toISOString()}`, default_language: 'ru', target_slide_count: 5 })
  if (!project?.id) throw new Error('Project creation failed')
  await record(scenario, 'session-initial', `/projects/${project.id}/session`)
  const form = new FormData()
  for (const file of scenario === 'data' ? [template, data] : [template]) {
    form.append('files', new Blob([await readFile(file)]), basename(file))
  }
  form.append('idea', 'Итоги продаж за год для совета директоров')
  let intake = await record(scenario, 'intake', `/projects/${project.id}/intake`, 'POST', form)
  if (!intake?.content_pack_id) throw new Error('Intake failed')
  await record(scenario, 'template-summary', `/templates/${intake.template_id}/summary`)
  const filename = scenario === 'data' ? basename(data) : basename(template)
  const revised = await record(scenario, 'intake-kind', `/projects/${project.id}/intake/files/${encodeURIComponent(filename)}`, 'PATCH', { kind: scenario === 'data' ? 'data' : 'template' })
  if (revised?.content_pack_id) intake = revised
  let packId = intake.content_pack_id
  await record(scenario, 'understanding', `/content-packs/${packId}/understanding?use_llm=false`)
  const notes = await record(scenario, 'notes', `/content-packs/${packId}/notes`, 'POST', { items: ['Обсудить итоги продаж и следующие шаги.'] })
  if (notes?.content_pack_id) packId = notes.content_pack_id
  const block = notes?.understanding?.blocks?.find((item) => item.kind === 'topic')
  if (block) {
    const edited = await record(scenario, 'blocks', `/content-packs/${packId}/blocks`, 'PATCH', { ops: [{ op: 'edit', block_id: block.id, title: block.title }] })
    if (edited?.content_pack_id) packId = edited.content_pack_id
  }
  const understood = await record(scenario, 'understanding-edited', `/content-packs/${packId}/understanding?use_llm=false`)
  const insight = understood?.datasets?.flatMap((item) => item.insights ?? [])[0]
  if (insight) await record(scenario, 'insight', `/content-packs/${packId}/insights/${insight.id}`, 'PATCH', { confirmed: true })
  const questions = await record(scenario, 'questions', `/projects/${project.id}/questions`)
  const answers = Object.fromEntries((questions?.questions ?? []).map((q) => [q.id, q.options.find((o) => o.recommended)?.value ?? q.options[0]?.value]).filter(([, v]) => v !== undefined))
  const answered = await record(scenario, 'answers', `/projects/${project.id}/answers`, 'POST', { answers })
  await record(scenario, 'session-understood', `/projects/${project.id}/session`)
  let plan = await record(scenario, 'plan', `/projects/${project.id}/plans`, 'POST', { content_pack_id: packId, template_id: intake.template_id, strategies: ['balanced'], brief: { ...answered.brief, content_fill: 'shrink' }, use_llm: false })
  const slides = plan?.plans?.[0]?.deck_plan?.slides ?? []
  const chart = slides.find((slide) => slide.chart?.type)
  if (chart) plan = await record(scenario, 'plan-patch', `/plans/${plan.plan_id}/slides/${chart.id}`, 'PATCH', { chart_type: chart.chart.type }) ?? plan
  const target = plan?.plans?.[0]?.deck_plan?.slides?.find((slide) => slide.purpose !== 'title')
  if (target) plan = await record(scenario, 'plan-action', `/plans/${plan.plan_id}/slides/${target.id}/actions`, 'POST', { action: 'shorten' }) ?? plan
  if (scenario === 'idea') {
    const auto = await record(scenario, 'autopilot', `/projects/${project.id}/session/autopilot`, 'POST', { from_step: 4, use_llm: false })
    const job = await waitJob(scenario, 'autopilot', auto?.job_id)
    if (job?.result_ids?.generation_id) {
      await record(scenario, 'generation-detail', `/generations/${job.result_ids.generation_id}`)
      const variants = await record(scenario, 'variants', `/generations/${job.result_ids.generation_id}/variants`)
      if (variants?.items?.[0]) await record(scenario, 'slides', `/variants/${variants.items[0].id}/slides`)
    }
  } else {
    const previews = await record(scenario, 'style-start', `/plans/${plan.plan_id}/style-previews`, 'POST', { respond_async: true })
    await waitJob(scenario, 'style', previews?.job_id)
    await record(scenario, 'style-preview', `/style-previews/${previews.preview_id}`)
    const generation = await record(scenario, 'generation', `/projects/${project.id}/generations`, 'POST', { content_pack_id: plan.content_pack_id, template_id: intake.template_id, brief: plan.plans[0].deck_plan.brief, deck_plan: plan.plans[0].deck_plan, preview_id: previews.preview_id, variants: [{ strategy: 'balanced' }], use_llm: false })
    await waitJob(scenario, 'generation', generation?.job_id)
    if (generation?.generation_id) {
      await record(scenario, 'generation-detail', `/generations/${generation.generation_id}`)
      const variants = await record(scenario, 'variants', `/generations/${generation.generation_id}/variants`)
      const variant = variants?.items?.[0]
      if (variant) {
        const page = await record(scenario, 'slides', `/variants/${variant.id}/slides`)
        const chartIds = new Set(plan.plans[0].deck_plan.slides.filter((item) => item.chart).map((item) => item.id))
        const slide = page?.items?.find((item) => chartIds.has(item.slide_plan_id)) ?? page?.items?.[0]
        if (slide) {
          await record(scenario, 'slide', `/slides/${slide.id}`)
          await record(scenario, 'slide-explain', `/slides/${slide.id}/explain`)
          const chartSlide = page.items.find((item) => chartIds.has(item.slide_plan_id))
          if (chartSlide) {
            await record(scenario, 'chart-slide', `/slides/${chartSlide.id}`)
            await record(scenario, 'chart-explain', `/slides/${chartSlide.id}/explain`)
          }
          await record(scenario, 'regenerate', `/variants/${variant.id}/slides/${slide.id}/regenerate`, 'POST', { action: 'shorter' })
        }
      }
    }
    const brandForm = new FormData()
    brandForm.append('files', new Blob([await readFile(brand)]), basename(brand))
    const branded = await record(scenario, 'brand-intake', `/projects/${project.id}/intake`, 'POST', brandForm)
    if (branded?.brandbook_id) {
      await record(scenario, 'brandbook', `/brandbooks/${branded.brandbook_id}`)
      await record(scenario, 'brand-summary', `/brandbooks/${branded.brandbook_id}/summary`)
      await record(scenario, 'brand-priority', `/brandbooks/${branded.brandbook_id}`, 'PATCH', { priority: 'template' })
    }
  }
  await record(scenario, 'session-final', `/projects/${project.id}/session`)
}

const artifactIds = new Set()
function collect(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (['image_artifact_id', 'preview_artifact_id', 'montage_artifact_id'].includes(key) && typeof item === 'string') artifactIds.add(item)
    else if (item && typeof item === 'object') collect(item)
  }
}
for (const name of await readdir(output)) {
  if (!name.startsWith('artifact-') && name.endsWith('.json')) collect(JSON.parse(await readFile(resolve(output, name), 'utf8')).body)
}
for (const id of artifactIds) {
  const filename = resolve(output, `artifact-${id}.json`)
  try { await readFile(filename); continue } catch {}
  const response = await fetch(`${base}/artifacts/${id}/download`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Artifact ${id}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  await writeFile(filename, `${JSON.stringify({ api_base: base, recorded_at: new Date().toISOString(), method: 'GET', path: `/artifacts/${id}/download`, status: response.status, body: { mime_type: response.headers.get('content-type'), base64: bytes.toString('base64') } }, null, 2)}\n`)
  process.stdout.write(`artifact ${id}: ${bytes.byteLength} bytes\n`)
}
