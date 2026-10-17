#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pick = (envName, candidates) => {
  const fromEnv = process.env[envName];
  if (fromEnv) return path.resolve(fromEnv);
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0];
};
const API_BASE = (process.env.API_BASE ?? 'https://deckdna.it-aul.ru/api/v1').replace(/\/+$/, '');
const CORPUS_DIR = pick('CORPUS_DIR', [
  path.join(ROOT, '../../orchestra/inputs/templates'),
  path.join(ROOT, '.claude/orchestra/inputs/templates'),
]);
const OUT_DIR = process.env.OUT_DIR
  ? path.resolve(process.env.OUT_DIR)
  : path.join(path.dirname(CORPUS_DIR), '../research/corpus-run');
const CSV_PATH = pick('CSV_PATH', [
  '/Users/renat/dev/LCT-prezi-2026/examples/stage2/sales_monthly.csv',
  path.join(ROOT, '../../LCT-prezi-2026/examples/stage2/sales_monthly.csv'),
]);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim()).filter(Boolean)) : null;
const CONCURRENCY = Math.max(1, Math.min(2, Number(process.env.CORPUS_CONCURRENCY ?? 2)));
const HTTP_TIMEOUT = Number(process.env.CORPUS_HTTP_TIMEOUT ?? 60_000);
const UPLOAD_TIMEOUT = Number(process.env.CORPUS_UPLOAD_TIMEOUT ?? 300_000);
const JOB_TIMEOUT = Number(process.env.CORPUS_JOB_TIMEOUT ?? 480_000);
const GEN_TIMEOUT = Number(process.env.CORPUS_GEN_TIMEOUT ?? 900_000);
const POLL_MS = 2_500;
const TERMINAL = new Set(['completed', 'failed', 'canceled']);
const NOTES_TEXT = 'Краткий отчёт по продажам: выручка растёт двенадцать месяцев подряд, Москва — драйвер, регионы проседают. Предлагаем пересмотреть план работы каналов и закрепить успех ведущих менеджеров.';
const BRIEF = { purpose: 'project', audience: 'руководство', language: 'ru', target_slide_count: 8, tone: 'professional', content_fill: 'shrink' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(method, urlPath, { json, form, raw, timeoutMs = HTTP_TIMEOUT } = {}) {
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
    const res = await fetch(`${API_BASE}${urlPath}`, init);
    if (raw) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: res.status, ms: Math.round(performance.now() - started), buf };
    }
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, ms: Math.round(performance.now() - started), body };
  } finally {
    clearTimeout(timer);
  }
}

function errText(body) {
  if (body && typeof body === 'object') {
    const e = body.error ?? body;
    const parts = [e.code, e.message, e.stage ? `stage=${e.stage}` : null].filter(Boolean);
    if (parts.length) return parts.join(' | ');
    return JSON.stringify(body).slice(0, 400);
  }
  return String(body).slice(0, 400);
}

async function waitJob(jobId, timeoutMs = JOB_TIMEOUT) {
  const started = performance.now();
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const res = await http('GET', `/jobs/${jobId}`);
    if (res.status === 200 && res.body && typeof res.body === 'object') {
      last = res.body;
      if (TERMINAL.has(last.state)) {
        return { ok: last.state === 'completed', ms: Math.round(performance.now() - started), state: last.state, error: last.error ? errText({ error: last.error }) : null, body: last };
      }
    }
    await sleep(POLL_MS);
  }
  return { ok: false, ms: Math.round(performance.now() - started), state: last?.state ?? 'timeout', error: 'job timeout', body: last };
}

async function waitGeneration(runId) {
  const started = performance.now();
  const deadline = Date.now() + GEN_TIMEOUT;
  let last = null;
  while (Date.now() < deadline) {
    const res = await http('GET', `/generations/${runId}`);
    if (res.status === 200 && res.body && typeof res.body === 'object') {
      last = res.body;
      if (TERMINAL.has(last.state)) {
        return { ok: last.state === 'completed', ms: Math.round(performance.now() - started), state: last.state, body: last };
      }
    }
    await sleep(POLL_MS);
  }
  return { ok: false, ms: Math.round(performance.now() - started), state: last?.state ?? 'timeout', error: 'generation timeout', body: last };
}

const CATEGORY_PREFIXES = { accessibility: 'accessibility', chart: 'chart', density: 'density', editability: 'editability', image: 'image', integrity: 'integrity', layout: 'layout', template: 'template', text: 'text' };

function ruleCategory(code) {
  const head = String(code).split('.')[0];
  return CATEGORY_PREFIXES[head] ?? 'other';
}

async function runOne(file) {
  const rec = { file, size_bytes: null, result: 'failed', failed_stage: null, error: null, stages: {}, started_at: new Date().toISOString() };
  const t0 = performance.now();
  let projectId = null;
  const fail = (stage, message) => {
    rec.failed_stage = rec.failed_stage ?? stage;
    rec.error = rec.error ?? message;
  };
  try {
    const filePath = path.join(CORPUS_DIR, file);
    const buf = await readFile(filePath);
    rec.size_bytes = buf.length;

    const created = await http('POST', '/projects', { json: { name: `t40-corpus ${file}`.slice(0, 200), default_language: 'ru', target_slide_count: 8 } });
    rec.stages.create = { status: created.status, ms: created.ms };
    if (created.status !== 201 && created.status !== 200 || typeof created.body?.id !== 'string') {
      fail('create', `HTTP ${created.status}: ${errText(created.body)}`);
      return rec;
    }
    projectId = created.body.id;

    const form = new FormData();
    const mime = file.endsWith('.potx')
      ? 'application/vnd.openxmlformats-officedocument.presentationml.template'
      : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    form.append('file', new Blob([buf], { type: mime }), file);
    const up = await http('POST', `/projects/${projectId}/templates`, { form, timeoutMs: UPLOAD_TIMEOUT });
    rec.stages.upload = { status: up.status, ms: up.ms, validation: up.body?.validation_status };
    if (up.status !== 200 && up.status !== 201 || typeof up.body?.id !== 'string') {
      fail('upload', `HTTP ${up.status}: ${errText(up.body)}`);
      return rec;
    }
    const templateId = up.body.id;

    const ana = await http('POST', `/templates/${templateId}/analyze`, { json: {}, timeoutMs: UPLOAD_TIMEOUT });
    if ((ana.status !== 200 && ana.status !== 202) || typeof ana.body?.job_id !== 'string') {
      rec.stages.analyze = { status: ana.status, ms: ana.ms };
      fail('analyze', `HTTP ${ana.status}: ${errText(ana.body)}`);
      return rec;
    }
    const anaJob = await waitJob(ana.body.job_id);
    rec.stages.analyze = { status: anaJob.state, ms: ana.ms + anaJob.ms };
    if (!anaJob.ok) {
      fail('analyze', `job ${anaJob.state}: ${anaJob.error ?? ''}`.trim());
      return rec;
    }

    const dna = await http('GET', `/templates/${templateId}/design-dna`, { timeoutMs: UPLOAD_TIMEOUT });
    if (dna.status === 200 && dna.body && typeof dna.body === 'object') {
      const d = dna.body;
      rec.stages.dna = {
        status: 200, ms: dna.ms,
        slides: Array.isArray(d.slides) ? d.slides.length : (Array.isArray(d.slide_roles) ? d.slide_roles.length : null),
        layouts: Array.isArray(d.layouts) ? d.layouts.length : (Array.isArray(d.declared?.masters?.[0]?.layout_parts) ? d.declared.masters[0].layout_parts.length : null),
        palette: Array.isArray(d.palette) ? d.palette.length : null,
        fonts: Array.isArray(d.fonts) ? d.fonts.length : null,
        aspect: d.slide_size?.aspect_ratio ?? null,
        unsupported: Array.isArray(d.unsupported) ? d.unsupported.length : (Array.isArray(d.unsupported_features) ? d.unsupported_features.length : null),
      };
    } else {
      rec.stages.dna = { status: dna.status, ms: dna.ms };
    }

    const packForm = new FormData();
    const csvBuf = await readFile(CSV_PATH);
    packForm.append('files', new Blob([csvBuf], { type: 'text/csv' }), 'sales_monthly.csv');
    packForm.append('files', new Blob([NOTES_TEXT], { type: 'text/plain' }), 'notes.txt');
    const pack = await http('POST', `/projects/${projectId}/content-packs`, { form: packForm, timeoutMs: UPLOAD_TIMEOUT });
    rec.stages.pack = { status: pack.status, ms: pack.ms };
    const packId = pack.body?.content_pack?.id ?? pack.body?.id;
    if ((pack.status !== 200 && pack.status !== 201 && pack.status !== 202) || typeof packId !== 'string') {
      fail('pack', `HTTP ${pack.status}: ${errText(pack.body)}`);
      return rec;
    }
    rec.stages.pack.datasets = Array.isArray(pack.body?.content_pack?.datasets) ? pack.body.content_pack.datasets.length : null;

    const gen = await http('POST', `/projects/${projectId}/generations`, {
      timeoutMs: UPLOAD_TIMEOUT,
      json: {
        template_id: templateId,
        content_pack_id: packId,
        use_llm: false,
        brief: BRIEF,
        variants: [{ strategy: 'balanced' }],
      },
    });
    rec.stages.generate_post = { status: gen.status, ms: gen.ms };
    if (gen.status !== 202 && gen.status !== 200 || typeof gen.body?.generation_id !== 'string') {
      fail('generate', `HTTP ${gen.status}: ${errText(gen.body)}`);
      return rec;
    }
    const runId = gen.body.generation_id;
    const variantId = Array.isArray(gen.body.variant_ids) ? gen.body.variant_ids[0] : null;
    const run = await waitGeneration(runId);
    rec.stages.generate = { status: run.state, ms: run.ms };
    if (!run.ok) {
      const variants = Array.isArray(run.body?.variants) ? run.body.variants : [];
      const bad = variants.find((v) => v?.error) ?? variants[0];
      let jobErr = '';
      const genJobId = run.body?.job_id ?? gen.body?.job_id;
      if (typeof genJobId === 'string') {
        const j = await http('GET', `/jobs/${genJobId}`).catch(() => null);
        if (j?.body?.error) jobErr = ` | job: ${errText({ error: j.body.error })}`;
      }
      fail('generate', `state=${run.state}${run.error ? `: ${run.error}` : ''}${bad?.error ? ` | variant: ${errText({ error: bad.error })}` : ''}${bad?.stage ? ` (stage ${bad.stage})` : ''}${jobErr}`.slice(0, 500));
      return rec;
    }
    const slides = Array.isArray(run.body?.variants?.[0]?.slides) ? run.body.variants[0].slides.length : null;
    rec.stages.generate.slides = slides;
    rec.stages.generate.variant_id = variantId;
    if (typeof variantId !== 'string') {
      fail('generate', 'no variant_id');
      return rec;
    }

    const audit = await http('POST', `/variants/${variantId}/audits`, { json: {} });
    let issues = [];
    if ((audit.status === 200 || audit.status === 202) && typeof audit.body?.audit_id === 'string') {
      if (typeof audit.body.job_id === 'string') {
        const aj = await waitJob(audit.body.job_id);
        if (!aj.ok) rec.stages.audit_job = { status: aj.state, ms: aj.ms, error: aj.error };
      }
      let cursor = null;
      let guard = 0;
      do {
        const url = `/audits/${audit.body.audit_id}/issues?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const res = await http('GET', url);
        if (res.status !== 200 || !res.body || typeof res.body !== 'object') break;
        const items = Array.isArray(res.body.items) ? res.body.items : [];
        issues.push(...items);
        cursor = res.body.next_cursor ?? null;
        guard += 1;
      } while (cursor && guard < 10);
    }
    rec.stages.audit = { status: audit.status, issues_total: issues.length };
    const byRule = {};
    const byCat = {};
    for (const i of issues) {
      const code = i?.rule_code ?? 'unknown';
      byRule[code] = (byRule[code] ?? 0) + 1;
      const cat = ruleCategory(code);
      byCat[cat] = (byCat[cat] ?? 0) + 1;
    }
    rec.stages.audit.by_rule = byRule;
    rec.stages.audit.by_category = byCat;

    const slug = file.replace(/\.(pptx|potx)$/i, '').replace(/[^\w.-]+/g, '_');
    const itemDir = path.join(OUT_DIR, slug);
    await mkdir(itemDir, { recursive: true });

    const exp = await http('POST', `/variants/${variantId}/exports`, { json: { formats: ['pdf'] } });
    rec.stages.export = { status: exp.status, ms: exp.ms };
    if ((exp.status !== 200 && exp.status !== 202) || typeof exp.body?.export_id !== 'string') {
      fail('export', `HTTP ${exp.status}: ${errText(exp.body)}`);
      return rec;
    }
    if (typeof exp.body.job_id === 'string') {
      const ej = await waitJob(exp.body.job_id);
      if (!ej.ok) {
        fail('export', `job ${ej.state}: ${ej.error ?? ''}`.trim());
        return rec;
      }
      rec.stages.export.ms += ej.ms;
    }
    const expRec = await http('GET', `/exports/${exp.body.export_id}`);
    const pdfArt = (Array.isArray(expRec.body?.artifacts) ? expRec.body.artifacts : []).find((a) => a?.format === 'pdf');
    if (typeof pdfArt?.artifact_id !== 'string') {
      fail('export', `no pdf artifact (HTTP ${expRec.status})`);
      return rec;
    }
    const dl = await http('GET', `/artifacts/${pdfArt.artifact_id}/download`, { raw: true, timeoutMs: UPLOAD_TIMEOUT });
    if (dl.status !== 200 || !dl.buf || dl.buf.length < 500) {
      fail('download', `HTTP ${dl.status}, ${dl.buf?.length ?? 0} bytes`);
      return rec;
    }
    const pdfPath = path.join(itemDir, 'deck.pdf');
    await writeFile(pdfPath, dl.buf);

    const ppm = spawnSync('pdftoppm', ['-r', '50', '-png', pdfPath, path.join(itemDir, 'slide')], { encoding: 'utf8', timeout: 120_000 });
    rec.stages.pdftoppm = { code: ppm.status, stderr: (ppm.stderr ?? '').slice(0, 300) };
    if (ppm.status !== 0) {
      fail('pdftoppm', `exit ${ppm.status}: ${(ppm.stderr ?? '').slice(0, 200)}`);
      return rec;
    }
    rec.stages.pdftoppm.pages = readdirSync(itemDir).filter((f) => f.endsWith('.png')).length;

    rec.result = 'built';
    return rec;
  } catch (err) {
    fail('exception', `${err?.name === 'AbortError' ? 'timeout' : `${err?.name}: ${err?.message}`}`);
    return rec;
  } finally {
    rec.total_ms = Math.round(performance.now() - t0);
    if (projectId) {
      try {
        let del = await http('DELETE', `/projects/${projectId}`, { timeoutMs: 30_000 });
        if (del.status !== 204 && del.status !== 200 && del.status !== 404) {
          await sleep(5_000);
          del = await http('DELETE', `/projects/${projectId}`, { timeoutMs: 30_000 });
        }
        rec.cleanup = del.status;
      } catch {
        rec.cleanup = 'error';
      }
    }
  }
}

async function main() {
  if (!existsSync(CORPUS_DIR)) {
    console.error(`corpus dir not found: ${CORPUS_DIR}`);
    process.exit(2);
  }
  if (!existsSync(CSV_PATH)) {
    console.error(`csv not found: ${CSV_PATH}`);
    process.exit(2);
  }
  await mkdir(OUT_DIR, { recursive: true });
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => /\.(pptx|potx)$/i.test(f))
    .filter((f) => !ONLY || ONLY.has(f))
    .sort();
  console.log(`corpus: ${files.length} files from ${CORPUS_DIR}`);
  console.log(`api: ${API_BASE}  out: ${OUT_DIR}  concurrency: ${CONCURRENCY}`);

  const results = [];
  const queue = [...files];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const file = queue.shift();
      const started = Date.now();
      const rec = await runOne(file);
      results.push(rec);
      const tag = rec.result === 'built' ? 'OK  ' : 'FAIL';
      console.log(`${tag} ${file}  ${rec.result === 'built' ? `${Math.round(rec.total_ms / 1000)}s, issues=${rec.stages.audit?.issues_total ?? 0}` : `@${rec.failed_stage}: ${(rec.error ?? '').slice(0, 160)}`}`);
      await writeFile(path.join(OUT_DIR, 'corpus-run.json'), JSON.stringify({ api: API_BASE, corpus_dir: CORPUS_DIR, generated_at: new Date().toISOString(), results }, null, 2), 'utf8').catch(() => {});
    }
  });
  await Promise.all(workers);

  results.sort((a, b) => files.indexOf(a.file) - files.indexOf(b.file));
  const lines = [];
  lines.push(`# Corpus run — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`API: \`${API_BASE}\``);
  lines.push(`Corpus: \`${CORPUS_DIR}\` (${files.length} files)`);
  lines.push('');
  lines.push('| File | Size | Result | Stage | Error | Parse ms | Build ms | Issues | Pages |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.file} | ${r.size_bytes ?? '?'} | ${r.result} | ${r.failed_stage ?? '-'} | ${(r.error ?? '-').slice(0, 120).replace(/\|/g, '/')} | ${r.stages.analyze?.ms ?? '-'} | ${r.stages.generate?.ms ?? '-'} | ${r.stages.audit?.issues_total ?? '-'} | ${r.stages.pdftoppm?.pages ?? '-'} |`);
  }
  lines.push('');
  await writeFile(path.join(OUT_DIR, 'corpus-run.json'), JSON.stringify({ api: API_BASE, corpus_dir: CORPUS_DIR, generated_at: new Date().toISOString(), results }, null, 2), 'utf8');
  await writeFile(path.join(OUT_DIR, 'corpus-run.md'), lines.join('\n'), 'utf8');
  const ok = results.filter((r) => r.result === 'built').length;
  console.log(`done: ${ok}/${results.length} built, report: ${path.join(OUT_DIR, 'corpus-run.md')}`);
  process.exitCode = ok === results.length ? 0 : 2;
}

await main();
