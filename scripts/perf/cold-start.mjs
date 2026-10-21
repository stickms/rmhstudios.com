#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Cold-start measurement (docs/server-perf-2026-10-21/01-method.md §2):
 * restart the production server and time the FIRST request to `/`, three times
 * per auth mode.
 *
 *   node scripts/perf/cold-start.mjs [--port 7105] [--runs 3] [--out cold.json]
 *
 * Needs a built tree (`.output/server/index.mjs`) and the worktree's `.env`
 * (DATABASE_URL etc., loaded here). Do NOT run it while another server owns the
 * port. Reports, per run: `bootMs` (spawn -> /api/health answers) and the first
 * `/` request's TTFB and total. "signed" sends the dataset's heavy-user cookie
 * with no `session_data` cache cookie, i.e. a browser's first request after the
 * cookie cache expired - the worst realistic case.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const root = resolve(new URL('../..', import.meta.url).pathname);
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const PORT = Number(arg('port', 7105));
const RUNS = Number(arg('runs', 3));
const OUT = arg('out', null);

if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const dataset = JSON.parse(readFileSync(resolve(root, 'scripts/perf/.dataset.json'), 'utf8'));

function get(path, cookie) {
  return new Promise((res) => {
    const t0 = performance.now();
    const req = http.request(
      { host: 'localhost', port: PORT, path, headers: { 'accept-encoding': 'gzip', ...(cookie ? { cookie } : {}) } },
      (r) => {
        const ttfb = performance.now() - t0;
        r.resume();
        r.on('end', () => res({ status: r.statusCode, ttfb, total: performance.now() - t0 }));
      },
    );
    req.on('error', () => res({ status: 0, ttfb: performance.now() - t0, total: performance.now() - t0 }));
    req.end();
  });
}

async function once(mode) {
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(PORT), RMH_PERF_HEADERS: '1' };
  const t0 = performance.now();
  const child = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: root, env, stdio: 'ignore' });
  try {
    for (;;) {
      const h = await get('/api/health');
      if (h.status === 200) break;
      if (performance.now() - t0 > 90_000) throw new Error('server did not come up in 90 s');
      await new Promise((r) => setTimeout(r, 50));
    }
    const bootMs = performance.now() - t0;
    const first = await get('/', mode === 'signed' ? dataset.cookies.heavy : undefined);
    return { bootMs: Math.round(bootMs), firstStatus: first.status, firstTtfbMs: Math.round(first.ttfb), firstTotalMs: Math.round(first.total) };
  } finally {
    child.kill('SIGKILL'); // the drain plugin makes SIGTERM slow; the next run only needs the port back
    await new Promise((r) => child.once('exit', r));
  }
}

const result = { anon: [], signed: [] };
for (const mode of ['anon', 'signed']) {
  for (let i = 0; i < RUNS; i++) {
    const r = await once(mode);
    result[mode].push(r);
    console.error(`${mode} run ${i + 1}: boot ${r.bootMs} ms, first GET / -> ${r.firstStatus} ttfb ${r.firstTtfbMs} ms total ${r.firstTotalMs} ms`);
    await new Promise((r2) => setTimeout(r2, 500));
  }
}
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const summary = Object.fromEntries(
  Object.entries(result).map(([m, rs]) => [m, { bootMsMedian: med(rs.map((r) => r.bootMs)), firstTtfbMsMedian: med(rs.map((r) => r.firstTtfbMs)), firstTotalMsMedian: med(rs.map((r) => r.firstTotalMs)) }]),
);
const doc = { measuredAt: new Date().toISOString(), runs: result, summary };
if (OUT) writeFileSync(resolve(OUT), JSON.stringify(doc, null, 1) + '\n');
console.log(JSON.stringify(summary, null, 1));
