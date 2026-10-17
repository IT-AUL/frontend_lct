#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = (process.env.API_BASE ?? 'https://deckdna.195-209-218-212.sslip.io/api/v1').replace(/\/+$/, '');
const TEMPLATE_PATH = process.env.TEMPLATE_PATH ?? '/Users/renat/Downloads/DeckDNA-demo/VK Tech шаблон.pptx';
const CSV_DIR = process.env.CSV_DIR ?? '/Users/renat/dev/LCT-prezi-2026/examples/stage2';
const REPORT_PATH = process.env.REPORT_PATH ?? '/Users/renat/dev/frontend_lct/.claude/orchestra/state/contract-probe.md';
const OPENAPI_PATH = process.env.OPENAPI_PATH ?? path.join(ROOT, '.claude/backend-snapshot/openapi.json');
const HTTP_TIMEOUT = Number(process.env.PROBE_HTTP_TIMEOUT ?? 60_000);
const UPLOAD_TIMEOUT = Number(process.env.PROBE_UPLOAD_TIMEOUT ?? 300_000);
const JOB_TIMEOUT = Number(process.env.PROBE_JOB_TIMEOUT ?? 480_000);
const GEN_TIMEOUT = Number(process.env.PROBE_GEN_TIMEOUT ?? 600_000);
const POLL_MS = 2_500;
const IDEA = 'Квартальный отчёт по продажам: динамика по месяцам, каналы, чеки и NPS, выводы и план действий.';
const TERMINAL = new Set(['completed', 'failed', 'canceled']);
const PREFIX = '/api/v1';

const openapi = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8'));
const SCHEMAS = openapi.components?.schemas ?? {};
const PATHS = openapi.paths ?? {};

function resolveSchema(schema, seen = new Set()) {
  let s = schema;
  while (s && s.$ref) {
    const name = s.$ref.replace('#/components/schemas/', '');
    if (seen.has(name) || !SCHEMAS[name]) return {};
    seen.add(name);
    s = SCHEMAS[name];
  }
  return s ?? {};
}

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(value, type) {
  switch (type) {
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return true;
  }
}

function checkValue(value, schema, label, issues, depth) {
  if (depth > 12) return;
  const s = resolveSchema(schema);
  if (!s || Object.keys(s).length === 0) return;
  if (s.anyOf) {
    const ok = s.anyOf.some((sub) => {
      const tmp = [];
      checkValue(value, sub, label, tmp, depth);
      return tmp.length === 0;
    });
    if (!ok) issues.push(`${label}: ни один вариант anyOf не подошёл (получено ${kindOf(value)})`);
    return;
  }
  if (s.allOf) {
    for (const sub of s.allOf) checkValue(value, sub, label, issues, depth);
    return;
  }
  if (s.type && !typeMatches(value, s.type)) {
    issues.push(`${label}: ожидался ${s.type}, получено ${kindOf(value)}`);
    return;
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const req of s.required ?? []) {
      if (!(req in value)) issues.push(`${label}.${req}: обязательное поле отсутствует`);
    }
    if (s.properties) {
      for (const [key, sub] of Object.entries(s.properties)) {
        if (key in value) checkValue(value[key], sub, `${label}.${key}`, issues, depth + 1);
      }
    }
  }
  if (Array.isArray(value) && s.items) {
    const limit = Math.min(value.length, 8);
    for (let i = 0; i < limit; i += 1) checkValue(value[i], s.items, `${label}[${i}]`, issues, depth + 1);
  }
}

function isEmpty(value) {
  return value === null || value === ''
    || (Array.isArray(value) && value.length === 0)
    || (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
}

function validateResponse(body, schema) {
  const resolved = resolveSchema(schema);
  if (resolved.anyOf) {
    let best = null;
    for (const sub of resolved.anyOf) {
      const res = validateResponse(body, sub);
      if (!best || res.issues.length < best.issues.length) best = res;
      if (res.issues.length === 0) { best = res; break; }
    }
    return best ?? { issues: ['anyOf: пустой ответ'], unexpected: [], empty: [] };
  }
  const issues = [];
  checkValue(body, resolved, '$', issues, 0);
  const unexpected = [];
  const empty = [];
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const props = resolved.properties ? Object.keys(resolved.properties) : null;
    if (props && resolved.additionalProperties !== true) {
      for (const key of Object.keys(body)) if (!props.includes(key)) unexpected.push(key);
    }
    for (const [key, value] of Object.entries(body)) if (isEmpty(value)) empty.push(key);
  }
  return { issues, unexpected, empty };
}

function opResponse(method, template, status) {
  const op = PATHS[template]?.[method.toLowerCase()];
  if (!op) return { known: false };
  const code = String(status);
  const res = op.responses?.[code]
    ?? op.responses?.[`${code[0]}XX`]
    ?? op.responses?.[`${code[0]}xx`]
    ?? op.responses?.default;
  if (!res) return { known: true, schema: undefined, documented: Object.keys(op.responses ?? {}) };
  return { known: true, schema: res.content?.['application/json']?.schema ?? null, documented: Object.keys(op.responses ?? {}) };
}

function opSchemas2xx(method, template) {
  const op = PATHS[template]?.[method.toLowerCase()];
  if (!op) return [];
  return Object.entries(op.responses ?? {})
    .filter(([code]) => /^2\d\d$/.test(code))
    .map(([, res]) => res.content?.['application/json']?.schema)
    .filter(Boolean);
}

async function http(method, urlPath, { json, form, accept, timeoutMs = HTTP_TIMEOUT } = {}) {
  const url = `${API_BASE}${urlPath}`;
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = { method, signal: ctrl.signal, headers: {} };
    if (json !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(json);
    }
    if (form) init.body = form;
    if (accept) init.headers.accept = accept;
    const res = await fetch(url, init);
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, ms: Math.round(performance.now() - started), body, contentType: res.headers.get('content-type') ?? '' };
  } finally {
    clearTimeout(timer);
  }
}

function parseSse(raw) {
  const events = [];
  for (const frame of raw.split(/\r?\n\r?\n/)) {
    let event = 'message';
    let data = '';
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += `${line.slice(5).trim()}\n`;
    }
    const trimmed = data.trim();
    if (!trimmed) continue;
    try { events.push({ event, data: JSON.parse(trimmed) }); }
    catch { events.push({ event, data: trimmed }); }
  }
  return events;
}

async function readSse(urlPath, timeoutMs) {
  const url = `${API_BASE}${urlPath}`;
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let raw = '';
  let status = null;
  let timedOut = false;
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'text/event-stream' } });
    status = res.status;
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          if (/event:\s*job\.(completed|failed|canceled)\b/.test(raw)) {
            await reader.cancel().catch(() => {});
            break;
          }
        }
      } catch (err) {
        if (err?.name !== 'AbortError') throw err;
        timedOut = true;
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') timedOut = true;
    else return { status: 'ERR', ms: Math.round(performance.now() - started), events: [], error: `${err.name}: ${err.message}`, timedOut: false };
  } finally {
    clearTimeout(timer);
  }
  return { status, ms: Math.round(performance.now() - started), events: parseSse(raw), timedOut };
}

const rows = [];
const fatal = [];
const notes = [];

function isExpected(status, expected) {
  const list = Array.isArray(expected) ? expected : [expected];
  return list.includes(status);
}

async function step(name, method, urlPath, opts = {}) {
  const row = { name, method, url: urlPath, status: null, ms: 0, problems: [], unexpected: [], empty: [] };
  rows.push(row);
  let res;
  try {
    res = await http(method, urlPath, opts);
  } catch (err) {
    row.status = 'ERR';
    row.ms = 0;
    row.problems.push(`запрос не выполнен: ${err.name === 'AbortError' ? 'таймаут' : `${err.name}: ${err.message}`}`);
    if (opts.critical !== false) fatal.push(`${name}: запрос не выполнен`);
    return { row, body: null, ok: false };
  }
  row.status = res.status;
  row.ms = res.ms;
  if (typeof res.status === 'number' && res.status >= 500) {
    row.problems.push('5xx');
    fatal.push(`${name}: HTTP ${res.status}`);
    return { row, body: res.body, ok: false };
  }
  const tolerated = opts.tolerate ?? [];
  const expected = opts.expect ?? [200, 201, 202, 204];
  if (!isExpected(res.status, expected)) {
    const tag = tolerated.includes(res.status) ? 'capability' : 'bad';
    row.problems.push(`ожидался ${expected.join('/')}, получен ${res.status}${tag === 'capability' ? ' (возможность недоступна)' : ''}`);
    if (tag !== 'capability' && opts.critical !== false) fatal.push(`${name}: HTTP ${res.status}`);
    if (tag === 'capability') row.capability = true;
    return { row, body: res.body, ok: false, capability: tag === 'capability' };
  }
  if (res.body === null || typeof res.body !== 'object' || Array.isArray(res.body)) {
    if (res.status !== 204) row.problems.push('тело ответа не JSON-объект');
    return { row, body: res.body, ok: true };
  }
  if (opts.op) {
    const spec = opResponse(method, opts.op, res.status);
    if (!spec.known) {
      row.problems.push(`ручка отсутствует в OpenAPI-снапшоте: ${opts.op}`);
    } else {
      let schema = spec.schema;
      if (schema === undefined) {
        row.problems.push(`статус ${res.status} не описан в OpenAPI (есть: ${(spec.documented ?? []).join(', ')})`);
        const alt = opSchemas2xx(method, opts.op);
        schema = alt.length === 1 ? alt[0] : alt.length > 1 ? { anyOf: alt } : null;
      }
      if (schema) {
        const out = validateResponse(res.body, schema);
        row.problems.push(...out.issues);
        row.unexpected = out.unexpected;
        row.empty = out.empty;
        if (out.issues.length) fatal.push(`${name}: ${out.issues.length} нарушений схемы`);
      }
    }
    if (res.status >= 200 && res.status < 300) {
      for (const [k, v] of Object.entries(res.body)) if (isEmpty(v) && !row.empty.includes(k)) row.empty.push(k);
    }
  } else if (res.status >= 200 && res.status < 300) {
    for (const [k, v] of Object.entries(res.body)) if (isEmpty(v)) row.empty.push(k);
  }
  for (const key of opts.expectKeys ?? []) {
    if (!(key in res.body)) row.problems.push(`нет задокументированного поля ${key}`);
  }
  return { row, body: res.body, ok: true };
}

async function jobEventsStep(name, jobId, timeoutMs = JOB_TIMEOUT) {
  const row = { name, method: 'GET', url: `/jobs/${jobId}/events`, status: null, ms: 0, problems: [], unexpected: [], empty: [] };
  rows.push(row);
  const res = await readSse(`/jobs/${jobId}/events`, timeoutMs);
  row.status = res.status;
  row.ms = res.ms;
  if (res.status === 'ERR') {
    row.problems.push(`stream: ${res.error}`);
    fatal.push(`${name}: stream error`);
    return { row, events: [], terminal: null, ok: false };
  }
  if (typeof res.status === 'number' && res.status >= 500) {
    row.problems.push('5xx');
    fatal.push(`${name}: HTTP ${res.status}`);
    return { row, events: res.events, terminal: null, ok: false };
  }
  if (res.status !== 200) {
    row.problems.push(`ожидался 200, получен ${res.status}`);
    fatal.push(`${name}: HTTP ${res.status}`);
    return { row, events: res.events, terminal: null, ok: false };
  }
  if (res.events.length === 0) row.problems.push('журнал пуст');
  const terminalEvt = [...res.events].reverse().find((e) => /^job\.(completed|failed|canceled)$/.test(e.event)
    || (e.event === 'job.state_changed' && TERMINAL.has(e.data?.state)));
  if (!terminalEvt) {
    row.problems.push(res.timedOut ? `терминальное событие не получено за ${Math.round(timeoutMs / 1000)}с` : 'поток закрылся без терминального события');
    fatal.push(`${name}: нет терминального события`);
  }
  row.eventsSummary = `${res.events.length} событий${terminalEvt ? `, финал: ${terminalEvt.event}${terminalEvt.data?.state ? ` (${terminalEvt.data.state})` : ''}` : ''}`;
  return { row, events: res.events, terminal: terminalEvt, ok: Boolean(terminalEvt) && !res.timedOut };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function briefShape(raw, fallbackPurpose) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const count = Number(src.target_slide_count);
  return {
    purpose: String(src.purpose || fallbackPurpose),
    audience: String(src.audience ?? ''),
    language: String(src.language || 'ru'),
    target_slide_count: Number.isInteger(count) && count >= 3 && count <= 40 ? count : 6,
    ...(typeof src.tone === 'string' ? { tone: src.tone } : {}),
    ...(typeof src.content_fill === 'string' ? { content_fill: src.content_fill } : {}),
    ...(typeof src.key_message === 'string' ? { key_message: src.key_message } : {}),
    ...(typeof src.call_to_action === 'string' ? { call_to_action: src.call_to_action } : {}),
  };
}

const ctx = { projectId: null, version: null };

async function run() {
  const v = await step('Версия бэка', 'GET', '/version', { critical: false, op: `${PREFIX}/version` });
  if (v.ok && v.body && typeof v.body === 'object') ctx.version = JSON.stringify(v.body);

  const created = await step('Создать проект', 'POST', '/projects', {
    op: `${PREFIX}/projects`,
    json: { name: `contract-probe ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, default_language: 'ru', target_slide_count: 6 },
    expect: 201,
  });
  if (!created.ok || typeof created.body?.id !== 'string') return;
  ctx.projectId = created.body.id;
  const pid = ctx.projectId;

  if (!existsSync(TEMPLATE_PATH)) {
    notes.push(`шаблон не найден: ${TEMPLATE_PATH}`);
    fatal.push(`intake: файл шаблона отсутствует (${TEMPLATE_PATH})`);
    return;
  }
  const csvFiles = readdirSync(CSV_DIR).filter((f) => f.endsWith('.csv')).sort();
  const form = new FormData();
  const tplBuf = await readFile(TEMPLATE_PATH);
  form.append('files', new Blob([tplBuf], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), path.basename(TEMPLATE_PATH));
  for (const name of csvFiles) {
    const buf = await readFile(path.join(CSV_DIR, name));
    form.append('files', new Blob([buf], { type: 'text/csv' }), name);
  }
  form.append('idea', IDEA);
  const intake = await step('Intake файлов', 'POST', `/projects/${pid}/intake`, {
    op: `${PREFIX}/projects/{project_id}/intake`,
    form,
    timeoutMs: UPLOAD_TIMEOUT,
    expect: 202,
    expectKeys: ['job_id', 'template_id', 'content_pack_id', 'files', 'assistant_note'],
  });
  if (!intake.ok) return;
  const templateId = intake.body.template_id;
  const packId = intake.body.content_pack_id;
  if (typeof templateId !== 'string' || typeof packId !== 'string') {
    fatal.push('intake: не вернул template_id/content_pack_id');
    notes.push(`intake вернул template_id=${templateId}, content_pack_id=${packId}`);
    return;
  }

  await step('Сессия помощника', 'GET', `/projects/${pid}/session`, { op: `${PREFIX}/projects/{project_id}/session` });
  const summary = await step('Карточка шаблона', 'GET', `/templates/${templateId}/summary`, {
    op: `${PREFIX}/templates/{template_id}/summary`,
    timeoutMs: UPLOAD_TIMEOUT,
    expectKeys: ['template_id', 'slides', 'palette', 'fonts', 'assistant_note'],
  });
  const understanding = await step('Разбор материала', 'GET', `/content-packs/${packId}/understanding?use_llm=false`, {
    op: `${PREFIX}/content-packs/{pack_id}/understanding`,
    timeoutMs: UPLOAD_TIMEOUT,
    expectKeys: ['content_pack_id', 'blocks', 'summary', 'datasets'],
  });
  const questions = await step('Вопросы', 'GET', `/projects/${pid}/questions`, {
    op: `${PREFIX}/projects/{project_id}/questions`,
    expectKeys: ['questions', 'suggested_brief', 'assistant_note'],
  });
  if (!questions.ok) return;

  const qs = Array.isArray(questions.body?.questions) ? questions.body.questions : [];
  notes.push(`вопросы бэка: ${qs.map((q) => q?.id).filter(Boolean).join(', ') || 'нет'}`);
  const answers = {};
  for (const q of qs) {
    const opts = Array.isArray(q?.options) ? q.options : [];
    const pick = opts.find((o) => o?.recommended)?.value ?? opts[0]?.value;
    if (pick !== undefined) answers[q.id] = pick;
    else if (q?.allow_custom) answers[q.id] = 'Ответ из contract-probe';
  }
  const answered = await step('Ответы на вопросы', 'POST', `/projects/${pid}/answers`, {
    op: `${PREFIX}/projects/{project_id}/answers`,
    json: { answers },
    expectKeys: ['brief', 'assistant_note'],
  });
  const brief = briefShape(
    (answered.ok && answered.body?.brief) || questions.body?.suggested_brief,
    IDEA,
  );

  const planned = await step('План (async)', 'POST', `/projects/${pid}/plans`, {
    op: `${PREFIX}/projects/{project_id}/plans`,
    json: {
      content_pack_id: packId,
      template_id: templateId,
      brief,
      use_llm: false,
      respond_async: true,
    },
    expect: [200, 202],
  });
  if (!planned.ok) return;
  let planId = planned.body?.plan_id;
  let planSet = null;
  if (typeof planned.body?.job_id === 'string' && !Array.isArray(planned.body?.plans)) {
    const ev = await jobEventsStep('События планирования', planned.body.job_id);
    if (!ev.ok) return;
    if (ev.terminal?.event === 'job.failed' || ev.terminal?.data?.state === 'failed') {
      fatal.push('планирование завершилось с ошибкой');
      return;
    }
    const got = await step('План (результат)', 'GET', `/plans/${planId}`, { op: `${PREFIX}/plans/{plan_id}` });
    if (!got.ok) return;
    planSet = got.body;
  } else if (Array.isArray(planned.body?.plans)) {
    planSet = planned.body;
  } else {
    fatal.push('plans: ответ не содержит ни plan_id+job_id, ни plans[]');
    return;
  }
  const planEntries = Array.isArray(planSet?.plans) ? planSet.plans : [];
  const strategies = planEntries.map((e) => e?.strategy).filter((s) => typeof s === 'string');
  notes.push(`стратегии плана: ${strategies.join(', ') || 'нет'}`);
  const planPackId = typeof planSet?.content_pack_id === 'string' ? planSet.content_pack_id : packId;

  let previewId = null;
  let chosenStrategy = strategies[0] ?? 'balanced';
  const previewJob = await step('Пробы стилей (async)', 'POST', `/plans/${planId}/style-previews`, {
    op: `${PREFIX}/plans/{plan_id}/style-previews`,
    json: { respond_async: true },
    expect: [200, 202],
    tolerate: [404, 405, 501],
  });
  if (previewJob.ok) {
    if (typeof previewJob.body?.job_id === 'string' && typeof previewJob.body?.preview_id === 'string') {
      const ev = await jobEventsStep('События проб стилей', previewJob.body.job_id);
      previewId = previewJob.body.preview_id;
      if (!ev.ok || ev.terminal?.event === 'job.failed' || ev.terminal?.data?.state === 'failed') {
        previewId = null;
        fatal.push('пробы стилей завершились с ошибкой');
      }
    } else {
      previewId = typeof previewJob.body?.preview_id === 'string' ? previewJob.body.preview_id : null;
    }
    if (previewId) {
      const prev = await step('Пробы стилей (результат)', 'GET', `/style-previews/${previewId}`, {
        op: `${PREFIX}/style-previews/{preview_id}`,
        expectKeys: ['styles', 'assistant_note'],
        tolerate: [404],
      });
      const styles = Array.isArray(prev.body?.styles) ? prev.body.styles : [];
      const recommended = styles.find((s) => s?.recommended) ?? styles[0];
      if (typeof recommended?.strategy === 'string' && strategies.includes(recommended.strategy)) {
        chosenStrategy = recommended.strategy;
      }
      if (prev.ok && styles.length === 0) notes.push('style-previews: styles[] пуст');
    }
  } else if (!previewJob.capability) {
    return;
  }

  const gen = await step('Сборка варианта', 'POST', `/projects/${pid}/generations`, {
    op: `${PREFIX}/projects/{project_id}/generations`,
    json: {
      template_id: templateId,
      content_pack_id: planPackId,
      brief,
      variants: [{ strategy: chosenStrategy }],
      deck_plan_id: planId,
      ...(previewId ? { preview_id: previewId } : {}),
      use_llm: false,
    },
    expect: 202,
  });
  if (!gen.ok || typeof gen.body?.generation_id !== 'string') return;
  const runId = gen.body.generation_id;
  const genJobId = gen.body.job_id;
  const variantIds = Array.isArray(gen.body.variant_ids) ? gen.body.variant_ids : [];

  const deadline = Date.now() + GEN_TIMEOUT;
  let detail = null;
  let polls = 0;
  let pollErr = null;
  while (Date.now() < deadline) {
    polls += 1;
    const res = await http('GET', `/generations/${runId}`, { timeoutMs: HTTP_TIMEOUT });
    if (res.status >= 500) { pollErr = `HTTP ${res.status}`; break; }
    if (res.status === 200 && res.body && typeof res.body === 'object') {
      detail = res.body;
      if (TERMINAL.has(detail.state)) break;
    }
    await sleep(POLL_MS);
  }
  const genRow = { name: 'Ожидание сборки', method: 'GET', url: `/generations/${runId} (×${polls})`, status: detail ? 200 : 'timeout', ms: GEN_TIMEOUT - Math.max(0, deadline - Date.now()), problems: [], unexpected: [], empty: [] };
  rows.push(genRow);
  if (pollErr) { genRow.problems.push(pollErr); fatal.push(`generations poll: ${pollErr}`); }
  if (!detail || !TERMINAL.has(detail.state)) {
    genRow.problems.push('не дождались терминального состояния');
    fatal.push('generations: таймаут ожидания');
    return;
  }
  const spec = opResponse('GET', `${PREFIX}/generations/{run_id}`, 200);
  if (spec.schema) {
    const out = validateResponse(detail, spec.schema);
    genRow.problems.push(...out.issues);
    genRow.unexpected = out.unexpected;
    genRow.empty = out.empty;
    if (out.issues.length) fatal.push(`generation detail: ${out.issues.length} нарушений схемы`);
  }
  genRow.eventsSummary = `state=${detail.state}`;
  if (detail.state !== 'completed') {
    fatal.push(`сборка завершилась состоянием ${detail.state}`);
    return;
  }
  if (typeof genJobId === 'string') await jobEventsStep('События сборки', genJobId, 30_000);

  let variantId = variantIds[0];
  if (typeof variantId !== 'string') {
    const variants = await step('Список вариантов', 'GET', `/generations/${runId}/variants`, { op: `${PREFIX}/generations/{run_id}/variants` });
    variantId = variants.body?.items?.[0]?.id;
  }
  if (typeof variantId !== 'string') {
    fatal.push('нет variant_id для проверки слайдов');
    return;
  }
  const slides = await step('Слайды варианта', 'GET', `/variants/${variantId}/slides`, { op: `${PREFIX}/variants/{variant_id}/slides` });
  const items = Array.isArray(slides.body?.items) ? slides.body.items : [];
  if (items.length === 0) {
    fatal.push('вариант без слайдов');
    return;
  }
  const chartSlideIds = new Set();
  for (const entry of planEntries) {
    if (entry?.strategy !== chosenStrategy) continue;
    for (const s of entry?.deck_plan?.slides ?? []) {
      if (s?.chart && typeof s?.id === 'string') chartSlideIds.add(s.id);
    }
  }
  const plannedSlides = items.filter((s) => typeof s?.slide_plan_id === 'string');
  const slide = plannedSlides.find((s) => chartSlideIds.has(s.slide_plan_id)) ?? plannedSlides[0] ?? items[0];
  notes.push(`слайдов в варианте: ${items.length}, стратегия: ${chosenStrategy}`);
  if (typeof slide?.id !== 'string') {
    fatal.push('slides: нет slide.id');
    return;
  }

  await step('Объяснение слайда', 'GET', `/slides/${slide.id}/explain`, {
    op: `${PREFIX}/slides/{slide_id}/explain`,
    expectKeys: ['slide_id', 'assistant_note'],
    tolerate: [404, 405, 501],
  });
  await step('Пересборка слайда', 'POST', `/variants/${variantId}/slides/${slide.id}/regenerate`, {
    op: `${PREFIX}/variants/{variant_id}/slides/{slide_id}/regenerate`,
    json: { action: 'shorter' },
    timeoutMs: UPLOAD_TIMEOUT,
    expectKeys: ['slide', 'deck_revision', 'assistant_note'],
    tolerate: [404, 405, 501],
  });
}

async function cleanup() {
  if (!ctx.projectId) return;
  const res = await step('Удаление проекта', 'DELETE', `/projects/${ctx.projectId}`, {
    op: `${PREFIX}/projects/{project_id}`,
    expect: 204,
    tolerate: [404, 405, 501],
    critical: false,
  });
  if (!res.ok && !res.capability) {
    notes.push(`проект ${ctx.projectId} не удалён (HTTP ${res.row.status})`);
  } else if (res.capability) {
    notes.push(`DELETE /projects не поддержан, проект оставлен: ${ctx.projectId}`);
  }
}

function fmtProblems(row) {
  const parts = [...row.problems];
  if (row.unexpected?.length) parts.push(`лишние поля: ${row.unexpected.join(', ')}`);
  if (row.empty?.length) parts.push(`пустые: ${row.empty.join(', ')}`);
  if (row.eventsSummary) parts.push(row.eventsSummary);
  return parts.join('; ') || '—';
}

function buildReport() {
  const lines = [];
  const ok = fatal.length === 0;
  lines.push(`# Contract probe — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- Стенд: \`${API_BASE}\`${ctx.version ? ` · version: \`${ctx.version}\`` : ''}`);
  lines.push(`- Проект: \`${ctx.projectId ?? 'не создан'}\``);
  lines.push(`- Шаблон: \`${TEMPLATE_PATH}\` · CSV: \`${CSV_DIR}\` (${readdirSync(CSV_DIR).filter((f) => f.endsWith('.csv')).length} файлов)`);
  lines.push(`- Итог: **${ok ? 'OK' : 'FAIL'}**${fatal.length ? ` — ${fatal.length} критических` : ''}`);
  lines.push('');
  lines.push('| Шаг | Ручка | Код | Время, мс | Расхождения |');
  lines.push('|---|---|---|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.name} | \`${row.method} ${row.url}\` | ${row.status} | ${row.ms} | ${fmtProblems(row)} |`);
  }
  lines.push('');
  lines.push('## Нарушения контракта');
  lines.push('');
  if (fatal.length === 0) lines.push('- не обнаружено');
  for (const f of fatal) lines.push(`- ${f}`);
  lines.push('');
  lines.push('## Неожиданные и пустые поля');
  lines.push('');
  let any = false;
  for (const row of rows) {
    const bits = [];
    if (row.unexpected?.length) bits.push(`неожиданные: ${row.unexpected.join(', ')}`);
    if (row.empty?.length) bits.push(`пустые: ${row.empty.join(', ')}`);
    if (bits.length) { any = true; lines.push(`- ${row.name} (\`${row.method} ${row.url}\`): ${bits.join('; ')}`); }
  }
  if (!any) lines.push('- не обнаружено');
  lines.push('');
  lines.push('## Просьбы к бэку');
  lines.push('');
  const asks = rows.filter((r) => r.problems.length || r.unexpected?.length);
  if (asks.length === 0 && fatal.length === 0) {
    lines.push('- замечаний нет: контракт соответствует снапшоту OpenAPI');
  } else {
    for (const row of asks) {
      lines.push(`- \`${row.method} ${row.url}\`: ${[...row.problems, ...(row.unexpected?.length ? [`лишние поля: ${row.unexpected.join(', ')}`] : [])].join('; ')}`);
    }
  }
  lines.push('');
  lines.push('## Заметки');
  lines.push('');
  if (notes.length === 0) lines.push('- нет');
  for (const n of notes) lines.push(`- ${n}`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const started = Date.now();
  try {
    await run();
  } catch (err) {
    fatal.push(`необработанная ошибка: ${err?.name}: ${err?.message}`);
    notes.push(String(err?.stack ?? err));
  } finally {
    try { await cleanup(); }
    catch (err) { notes.push(`cleanup: ${err?.message}`); }
    let report;
    try { report = buildReport(); }
    catch (err) { report = `# Contract probe\n\nreport build failed: ${err?.message}\n`; }
    try {
      await mkdir(path.dirname(REPORT_PATH), { recursive: true });
      await writeFile(REPORT_PATH, report, 'utf8');
    } catch (err) {
      console.error(`cannot write report to ${REPORT_PATH}: ${err?.message}`);
      console.log(report);
    }
  }
  const secs = Math.round((Date.now() - started) / 1000);
  const ok = fatal.length === 0;
  console.log(`contract-probe: ${ok ? 'OK' : 'FAIL'} за ${secs}с, шагов: ${rows.length}, проект: ${ctx.projectId ?? '-'}`);
  for (const f of fatal) console.log(`  FAIL ${f}`);
  console.log(`отчёт: ${REPORT_PATH}`);
  process.exitCode = ok ? 0 : 2;
}

await main();
