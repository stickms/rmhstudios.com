#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Server HTTP harness (docs/server-perf-2026-10-21/01-method.md §1.1).
 *
 *   node scripts/perf/server-bench.mjs --base http://localhost:7105 \
 *     --routes scripts/perf/server-routes.json --auth both \
 *     --warmup 5 --samples 30 --concurrency 16 --duration 5 \
 *     --out docs/server-perf-2026-10-21/results/baseline.json
 *   node scripts/perf/server-bench.mjs --compare before.json after.json
 *   node scripts/perf/server-bench.mjs --summary baseline.json
 *   ... --only '/api/leaderboard*,home'      (glob on route id or path; comma list)
 *
 * No dependencies: node:http + node:zlib + perf_hooks. node:http rather than
 * fetch() because fetch transparently decodes the body, which hides the encoded
 * size, and because TTFB is exactly the `response` event (headers received).
 *
 * Per route x auth mode:
 *   sequential pass  - `warmup` discarded + `samples` timed requests, one at a
 *                      time (latency, no queueing): ttfb p50/p95/p99, total p50/p95
 *   concurrent pass  - `concurrency` workers hammer the route for `duration`
 *                      seconds (GET only): rps and load p95 TTFB
 * and the response facts: status set, decoded/encoded bytes, cache-control,
 * Server-Timing phases (median), x-rmh-queries (median; needs the server to run
 * with RMH_PERF_HEADERS=1), and a body hash so anonymous-invariant GETs can be
 * spotted (anon hash == signed hash, stable across samples).
 *
 * Signed mode sends the dataset's signed session_token cookie (heavy user by
 * default; --user bench|heavy) plus a `session_data` cookie-cache cookie it
 * collects from /api/auth/get-session and refreshes every 4 minutes - that is
 * the shape of a real browser session (lib/auth.ts: cookieCache maxAge 300 s).
 *
 * Route entries (server-routes.json): { id, path, class, auth, method?, body?,
 * load? } with `{a.b.c}` placeholders filled from the dataset manifest
 * (scripts/perf/.dataset.json). `auth`: anon | signed | both. POSTs are timed
 * sequentially only, as the signed user.
 */

import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const HERE = dirname(new URL(import.meta.url).pathname);

/* ─── arg parsing ──────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) a[k] = true;
      else {
        a[k] = next;
        i++;
        // --compare takes two values
        if (k === 'compare' && argv[i + 1] && !argv[i + 1].startsWith('--')) a.compare2 = argv[++i];
      }
    } else a._.push(t);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));

/* ─── stats ────────────────────────────────────────────────────────────── */
const pct = (sorted, p) => {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};
const sortNum = (xs) => [...xs].sort((x, y) => x - y);
const median = (xs) => pct(sortNum(xs), 50);
const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

/* ─── budgets (02-budgets.md §2, provisional until ratified) ───────────── */
const BUDGETS = {
  core: { anon: [60, 120], signed: [120, 250], queries: 12 },
  content: { anon: [60, 120], signed: [100, 200], queries: 10 },
  interactive: { anon: [80, 160], signed: [150, 300], queries: 15 },
  api: { anon: [15, 40], signed: [25, 60], queries: 5 },
  'api-post': { anon: null, signed: [40, 100], queries: 8 },
};
const budgetKey = (route) => (route.method && route.method !== 'GET' ? 'api-post' : route.class);

/* ─── compare / summary modes (no network) ─────────────────────────────── */
if (args.compare) {
  compareMode(args.compare, args.compare2);
  process.exit(0);
}
if (args.summary) {
  summaryMode(args.summary);
  process.exit(0);
}

function loadJson(p) {
  return JSON.parse(readFileSync(resolve(p), 'utf8'));
}

function key(r) {
  return `${r.id}|${r.auth}`;
}

function delta(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return '-';
  const d = b - a;
  const pctv = a === 0 ? 0 : (d / a) * 100;
  return `${r1(a)} → ${r1(b)} (${d >= 0 ? '+' : ''}${r1(pctv)}%)`;
}

function compareMode(fileA, fileB) {
  if (!fileB) {
    console.error('usage: --compare before.json after.json');
    process.exit(2);
  }
  const A = loadJson(fileA);
  const B = loadJson(fileB);
  const mapA = new Map(A.rows.map((r) => [key(r), r]));
  const lines = [];
  lines.push(`| route | auth | ttfb p50 ms | ttfb p95 ms | queries | bytes | rps | flag |`);
  lines.push(`| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |`);
  let regressions = 0;
  for (const b of B.rows) {
    const a = mapA.get(key(b));
    if (!a) {
      lines.push(`| ${b.path} | ${b.auth} | (new) | | | | | |`);
      continue;
    }
    const flags = [];
    if (a.ttfb && b.ttfb) {
      const tol = Math.max(a.ttfb.p50 * 0.1, 5);
      if (b.ttfb.p50 - a.ttfb.p50 > tol) flags.push('REGRESSED p50');
      else if (a.ttfb.p50 - b.ttfb.p50 > tol) flags.push('faster');
    }
    if (a.queries !== null && b.queries !== null && b.queries > a.queries) flags.push('+queries');
    if (b.invalid && !a.invalid) flags.push('NOW INVALID');
    if (flags.some((f) => f.startsWith('REGRESSED') || f === '+queries' || f === 'NOW INVALID')) regressions++;
    lines.push(
      `| ${b.path} | ${b.auth} | ${delta(a.ttfb?.p50, b.ttfb?.p50)} | ${delta(a.ttfb?.p95, b.ttfb?.p95)} | ${delta(a.queries, b.queries)} | ${delta(a.bytes, b.bytes)} | ${delta(a.load?.rps, b.load?.rps)} | ${flags.join(', ')} |`,
    );
  }
  console.log(`Compare: ${fileA} (${A.meta?.commit ?? '?'}) → ${fileB} (${B.meta?.commit ?? '?'})\n`);
  console.log(lines.join('\n'));
  console.log(`\n${regressions} row(s) outside tolerance (larger of 10% or 5 ms on p50 TTFB, or any added query).`);
}

function summaryMode(file) {
  const D = loadJson(file);
  const valid = D.rows.filter((r) => !r.invalid && r.ttfb);
  const signed = valid.filter((r) => r.auth === 'signed');
  const anon = valid.filter((r) => r.auth === 'anon');
  const table = (title, rows, cols) => {
    console.log(`\n### ${title}\n`);
    console.log(`| ${cols.map((c) => c[0]).join(' | ')} |`);
    console.log(`| ${cols.map((c) => (c[2] ? '---:' : '---')).join(' | ')} |`);
    for (const r of rows) console.log(`| ${cols.map((c) => c[1](r)).join(' | ')} |`);
  };
  const base = [
    ['route', (r) => `\`${r.path}\``],
    ['class', (r) => r.class],
  ];
  table(
    'Top 15 by signed p95 TTFB',
    [...signed].sort((a, b) => b.ttfb.p95 - a.ttfb.p95).slice(0, 15),
    [...base, ['p50 ms', (r) => r1(r.ttfb.p50), 1], ['p95 ms', (r) => r1(r.ttfb.p95), 1], ['queries', (r) => r.queries ?? '-', 1], ['KB', (r) => r1(r.bytes / 1024), 1]],
  );
  table(
    'Top 15 by anonymous p95 TTFB',
    [...anon].sort((a, b) => b.ttfb.p95 - a.ttfb.p95).slice(0, 15),
    [...base, ['p50 ms', (r) => r1(r.ttfb.p50), 1], ['p95 ms', (r) => r1(r.ttfb.p95), 1], ['queries', (r) => r.queries ?? '-', 1], ['KB', (r) => r1(r.bytes / 1024), 1]],
  );
  table(
    'Top 15 by query count (signed, then anon)',
    [...valid].filter((r) => r.queries !== null).sort((a, b) => b.queries - a.queries).slice(0, 15),
    [...base, ['auth', (r) => r.auth], ['queries', (r) => r.queries, 1], ['p50 ms', (r) => r1(r.ttfb.p50), 1]],
  );
  const over = valid.filter((r) => r.queries !== null && r.queries > (BUDGETS[budgetKey(r)]?.queries ?? Infinity));
  table(
    `Routes over their query budget (${over.length})`,
    over.sort((a, b) => b.queries - a.queries),
    [...base, ['auth', (r) => r.auth], ['queries', (r) => r.queries, 1], ['budget', (r) => BUDGETS[budgetKey(r)].queries, 1]],
  );
  const overTtfb = valid.filter((r) => {
    const b = BUDGETS[budgetKey(r)]?.[r.auth];
    return b && (r.ttfb.p50 > b[0] || r.ttfb.p95 > b[1]);
  });
  table(
    `Routes over their TTFB budget (${overTtfb.length})`,
    overTtfb.sort((a, b) => b.ttfb.p95 - a.ttfb.p95),
    [...base, ['auth', (r) => r.auth], ['p50/p95 ms', (r) => `${r1(r.ttfb.p50)} / ${r1(r.ttfb.p95)}`], ['budget', (r) => BUDGETS[budgetKey(r)][r.auth].join(' / ')]],
  );
  // anonymous-invariant, uncached API GETs
  const byId = new Map();
  for (const r of valid) byId.set(`${r.id}|${r.auth}`, r);
  const invariant = [];
  for (const r of anon) {
    const s = byId.get(`${r.id}|signed`);
    if (!s || r.method !== 'GET' || !r.path.startsWith('/api/')) continue;
    if (!r.bodyHash || r.bodyHash !== s.bodyHash || !r.stable || !s.stable) continue;
    const cc = (r.cacheControl ?? '').toLowerCase();
    if (/(^|,\s*)(public|s-maxage)/.test(cc)) continue;
    invariant.push({ ...r, signedCc: s.cacheControl });
  }
  table(
    `Uncached GETs whose anon and signed bodies are identical and stable (${invariant.length}) - candidates only; read the handler before declaring public`,
    invariant,
    [...base, ['cache-control', (r) => `\`${r.cacheControl ?? '(none)'}\``], ['p50 ms', (r) => r1(r.ttfb.p50), 1], ['queries', (r) => r.queries ?? '-', 1]],
  );
  const slow5 = [...signed].filter((r) => r.class !== 'api').sort((a, b) => b.ttfb.p95 - a.ttfb.p95).slice(0, 5);
  table(
    'Phase breakdown, the 5 slowest signed pages (median ms; "-" = phase not marked)',
    slow5,
    [...base, ['ttfb p50', (r) => r1(r.ttfb.p50), 1], ...['total', 'sess', 'cache', 'db', 'loader', 'render'].map((p) => [p, (r) => r1(r.phases?.[p]) ?? '-', 1])],
  );
  const invalid = D.rows.filter((r) => r.invalid);
  table(
    `Invalid rows (${invalid.length}) - a non-2xx/3xx status was seen`,
    invalid,
    [...base, ['auth', (r) => r.auth], ['statuses', (r) => JSON.stringify(r.status)]],
  );
}

/* ─── run mode ─────────────────────────────────────────────────────────── */
const BASE = new URL(args.base ?? 'http://localhost:7105');
const WARMUP = Number(args.warmup ?? 5);
const SAMPLES = Number(args.samples ?? 30);
const CONCURRENCY = Number(args.concurrency ?? 16);
const DURATION = Number(args.duration ?? 5);
const AUTH = args.auth ?? 'both';
const USER = args.user ?? 'heavy';
const TIMEOUT_MS = Number(args.timeout ?? 20000);
const routesFile = resolve(args.routes ?? resolve(HERE, 'server-routes.json'));
const datasetFile = resolve(args.dataset ?? resolve(HERE, '.dataset.json'));

if (!['anon', 'signed', 'both'].includes(AUTH)) {
  console.error('--auth must be anon | signed | both');
  process.exit(2);
}
if (!existsSync(datasetFile)) {
  console.error(`dataset manifest not found: ${datasetFile}\n(run seed-perf-db.ts, or copy .dataset.json from the coordinator)`);
  process.exit(2);
}
const dataset = loadJson(datasetFile);
const routeDoc = loadJson(routesFile);

const lookup = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dataset);
// Path placeholders must not be percent-encoded twice, and body strings are raw.
function fillRaw(str) {
  return str.replace(/\{([A-Za-z0-9_.]+)\}/g, (_, p) => {
    const v = lookup(p);
    if (v === undefined || v === null) throw new Error(`dataset has no "${p}" (needed by ${str})`);
    return String(v);
  });
}
const fillBody = (v) =>
  typeof v === 'string' ? fillRaw(v) : Array.isArray(v) ? v.map(fillBody) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillBody(x)])) : v;

const globToRe = (g) => new RegExp('^' + g.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
const onlyRes = args.only && args.only !== true ? String(args.only).split(',').map((s) => globToRe(s.trim())) : null;

const routes = routeDoc.routes.filter((r) => !onlyRes || onlyRes.some((re) => re.test(r.id) || re.test(r.path)));
if (routes.length === 0) {
  console.error('no routes match --only');
  process.exit(2);
}

const agent = new (BASE.protocol === 'https:' ? https : http).Agent({ keepAlive: true, maxSockets: Math.max(CONCURRENCY, 4) });
const lib = BASE.protocol === 'https:' ? https : http;

let ipCounter = (Date.now() % 200) * 65536;
function nextIp() {
  const n = ipCounter++;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

/** One request. Resolves with timing + facts; never rejects. */
function request(route, path, cookie) {
  return new Promise((resolveReq) => {
    const method = route.method ?? 'GET';
    const body = route.body !== undefined ? JSON.stringify(fillBody(route.body)) : undefined;
    const headers = {
      'accept-encoding': 'gzip, br',
      accept: route.accept ?? (path.startsWith('/api/') || path.startsWith('/_serverFn') ? 'application/json' : 'text/html'),
      'user-agent': 'rmh-server-bench/1',
      ...(route.headers ?? {}),
    };
    // A fresh client IP per request. The in-app limiter is per-IP (lib/rate-limit.ts)
    // and a harness at hundreds of rps from one address would measure the 429
    // path instead of the route. The limiter's own work (store round-trip) is
    // still paid on every request, which is what we want to see.
    const ip = nextIp();
    // cf-connecting-ip only: lib/rate-limit.ts reads it first. NOT x-forwarded-for -
    // on the production build Better Auth's isIPv4 is `undefined` (node:net
    // stubbed by the bundler) and any /api/auth/* request carrying that header
    // 500s; see results/ws-0.md Handoffs. Better Auth's own limiter therefore
    // keeps one shared bucket per path (200/min), so routes under /api/auth set
    // `load: false` in server-routes.json.
    headers['cf-connecting-ip'] = ip;
    if (cookie) headers.cookie = cookie;
    if (path.startsWith('/_serverFn/')) {
      // TanStack Start server functions refuse requests without the marker header
      // and a same-origin Origin (403 "Forbidden"); this is what the client sends.
      headers['x-tsr-serverFn'] = 'true';
      headers.origin = BASE.origin;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(body);
      headers.origin = BASE.origin;
    }
    const t0 = performance.now();
    const req = lib.request(
      { hostname: BASE.hostname, port: BASE.port, path, method, headers, agent },
      (res) => {
        const tHeaders = performance.now();
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const tEnd = performance.now();
          const raw = Buffer.concat(chunks);
          let decoded = raw;
          try {
            const enc = res.headers['content-encoding'];
            if (enc === 'gzip') decoded = zlib.gunzipSync(raw);
            else if (enc === 'br') decoded = zlib.brotliDecompressSync(raw);
          } catch {
            /* keep raw */
          }
          resolveReq({
            ok: true,
            status: res.statusCode,
            ttfb: tHeaders - t0,
            total: tEnd - t0,
            bytes: decoded.length,
            encodedBytes: raw.length,
            headers: res.headers,
            hash: crypto.createHash('sha1').update(decoded).digest('hex').slice(0, 12),
          });
        });
        res.on('error', () => resolveReq({ ok: false, status: 0, ttfb: performance.now() - t0, total: performance.now() - t0 }));
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', () => resolveReq({ ok: false, status: 0, ttfb: performance.now() - t0, total: performance.now() - t0 }));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/* ─── signed cookies ───────────────────────────────────────────────────── */
let cookieJar = { value: null, at: 0 };
async function signedCookie() {
  const base = dataset.cookies?.[USER];
  if (!base) throw new Error(`dataset has no cookie for user "${USER}"`);
  if (cookieJar.value && Date.now() - cookieJar.at < 240_000) return cookieJar.value;
  // Collect the cookie-cache cookie a real browser would be holding.
  const res = await request({ method: 'GET', headers: { accept: 'application/json' } }, '/api/auth/get-session', base);
  let extra = '';
  const setCookie = res.headers?.['set-cookie'] ?? [];
  const parts = setCookie
    .map((c) => c.split(';')[0])
    .filter((c) => /session_data|session_token/.test(c) && !/^[^=]+=$/.test(c));
  if (parts.length) extra = parts.join('; ');
  const sessionOk = res.status === 200 && res.bytes > 4;
  if (!sessionOk) console.warn(`warning: /api/auth/get-session returned ${res.status} (${res.bytes} bytes) - signed rows may be anonymous`);
  const value = extra && extra.includes('session_token') ? extra : [base, extra].filter(Boolean).join('; ');
  cookieJar = { value, at: Date.now() };
  return value;
}

function parseServerTiming(h) {
  const out = {};
  if (!h) return out;
  for (const part of String(h).split(',')) {
    const m = part.trim().match(/^([a-z][a-z0-9_-]*);dur=([0-9.]+)/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

async function benchRoute(route, mode) {
  const path = fillRaw(route.path);
  const method = route.method ?? 'GET';
  const cookieFor = async () => (mode === 'signed' ? await signedCookie() : undefined);
  const row = {
    id: route.id,
    path,
    class: route.class,
    auth: mode,
    method,
    status: {},
    invalid: false,
    ttfb: null,
    total: null,
    bytes: null,
    encodedBytes: null,
    phases: {},
    queries: null,
    bodyHash: null,
    stable: null,
    cacheControl: null,
    load: null,
  };
  for (let i = 0; i < WARMUP; i++) await request(route, path, await cookieFor());

  const ttfb = [], total = [], bytes = [], enc = [], queries = [], hashes = [];
  const phases = {};
  for (let i = 0; i < SAMPLES; i++) {
    const res = await request(route, path, await cookieFor());
    row.status[res.status] = (row.status[res.status] ?? 0) + 1;
    if (!res.ok) continue;
    ttfb.push(res.ttfb);
    total.push(res.total);
    bytes.push(res.bytes);
    enc.push(res.encodedBytes);
    hashes.push(res.hash);
    row.cacheControl = res.headers['cache-control'] ?? null;
    const q = res.headers['x-rmh-queries'];
    if (q !== undefined) queries.push(Number(q));
    for (const [k, v] of Object.entries(parseServerTiming(res.headers['server-timing']))) (phases[k] ??= []).push(v);
  }
  const bad = Object.keys(row.status).filter((s) => !(Number(s) >= 200 && Number(s) < 400));
  row.invalid = bad.length > 0 || ttfb.length === 0;
  if (ttfb.length) {
    const s = sortNum(ttfb);
    row.ttfb = { p50: r1(pct(s, 50)), p95: r1(pct(s, 95)), p99: r1(pct(s, 99)) };
    const t = sortNum(total);
    row.total = { p50: r1(pct(t, 50)), p95: r1(pct(t, 95)) };
    row.bytes = Math.round(median(bytes));
    row.encodedBytes = Math.round(median(enc));
    row.bodyHash = hashes[hashes.length - 1];
    row.stable = new Set(hashes).size === 1;
  }
  if (queries.length) row.queries = median(queries);
  for (const [k, v] of Object.entries(phases)) row.phases[k] = r1(median(v));

  // Concurrent pass: GET only, skipped for invalid rows and `load: false`.
  if (DURATION > 0 && method === 'GET' && route.load !== false && !row.invalid) {
    const cookie = await cookieFor();
    const lat = [];
    let done = 0, errors = 0;
    const end = performance.now() + DURATION * 1000;
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (performance.now() < end) {
          const res = await request(route, path, cookie);
          if (res.ok && res.status < 400) {
            lat.push(res.ttfb);
            done++;
          } else errors++;
        }
      }),
    );
    const secs = (performance.now() - t0) / 1000;
    const s = sortNum(lat);
    row.load = { concurrency: CONCURRENCY, rps: r1(done / secs), p50: r1(pct(s, 50)), p95: r1(pct(s, 95)), errors };
  }
  return row;
}

async function main() {
  const modes = AUTH === 'both' ? ['anon', 'signed'] : [AUTH];
  const rows = [];
  const started = Date.now();
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: HERE }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  console.error(`bench ${BASE.origin}: ${routes.length} routes, auth=${AUTH}, user=${USER}, warmup=${WARMUP}, samples=${SAMPLES}, c=${CONCURRENCY}, duration=${DURATION}s`);
  for (const route of routes) {
    const want = route.auth ?? 'both';
    const isWrite = (route.method ?? 'GET') !== 'GET';
    for (const mode of modes) {
      if (want !== 'both' && want !== mode) continue;
      if (isWrite && mode !== 'signed') continue;
      let row;
      try {
        row = await benchRoute(route, mode);
      } catch (err) {
        row = { id: route.id, path: route.path, class: route.class, auth: mode, method: route.method ?? 'GET', invalid: true, status: { error: String(err.message) } };
      }
      rows.push(row);
      const tag = row.invalid ? 'INVALID ' + JSON.stringify(row.status) : `p50 ${row.ttfb?.p50}ms p95 ${row.ttfb?.p95}ms q=${row.queries ?? '-'} ${row.bytes}B${row.load ? ` rps=${row.load.rps}` : ''}`;
      console.error(`  ${mode.padEnd(6)} ${row.method.padEnd(4)} ${row.path.slice(0, 60).padEnd(60)} ${tag}`);
    }
  }
  const doc = {
    meta: {
      commit,
      date: new Date().toISOString(),
      base: BASE.origin,
      node: process.version,
      host: { cpus: os.cpus().length, load1: os.loadavg()[0] },
      args: { auth: AUTH, user: USER, warmup: WARMUP, samples: SAMPLES, concurrency: CONCURRENCY, duration: DURATION, only: args.only ?? null },
      dataset: { scale: dataset.scale, generatedAt: dataset.generatedAt, counts: dataset.counts },
      elapsedSec: Math.round((Date.now() - started) / 1000),
    },
    rows,
  };
  const out = args.out && args.out !== true ? resolve(args.out) : null;
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
    console.error(`wrote ${out} (${rows.length} rows, ${doc.meta.elapsedSec}s)`);
  } else {
    console.log(JSON.stringify(doc, null, 1));
  }
  agent.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
