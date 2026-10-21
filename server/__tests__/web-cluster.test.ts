// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * `server/web-cluster.mjs` is the web container's PID 1. Nitro's own node-cluster primary forked its workers once and
 * never replaced one, so on 2026-10-21 two worker deaths in a row left nothing listening, the primary exited, and the
 * site served Apache's 503 until the container restarted. These run the real primary against fixture workers and pin
 * the two things that took it down: a killed worker is replaced (and the death is logged with its signal), and a
 * SIGTERM reaches the workers and waits for them, so `docker stop` drains instead of cutting them off.
 */

const PRIMARY = resolve(__dirname, '../web-cluster.mjs');

const WORKER = `
import http from 'node:http';
import { writeFileSync } from 'node:fs';
const dir = process.env.FIXTURE_DIR;
const server = http.createServer((req, res) => {
  if (req.url === '/die') {
    res.end('bye');
    // What the kernel's OOM killer does: no exit code, no chance to clean up.
    setTimeout(() => process.kill(process.pid, 'SIGKILL'), 10);
    return;
  }
  res.end(String(process.pid));
});
process.on('SIGTERM', () => {
  writeFileSync(dir + '/drained-' + process.pid, process.env.WORKER_ID);
  server.close(() => process.exit(0));
});
// Ready = listening with its SIGTERM handler installed (the tests wait for every worker, not just the first).
server.listen(Number(process.env.PORT), () => writeFileSync(dir + '/ready-' + process.pid, ''));
`;

async function freePort(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer().listen(0, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });
}

async function get(port: number, path = '/'): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(1000),
    });
    return await res.text();
  } catch {
    return null;
  }
}

/** The fixture workers that are up: listening, SIGTERM handler installed. */
const readyPids = () => readdirSync(dir).filter((f) => f.startsWith('ready-')).map((f) => f.slice(6));

async function until<T>(fn: () => Promise<T | null | false>, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as T;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

let child: ChildProcess | null = null;
let dir = '';
afterEach(() => {
  child?.kill('SIGKILL');
  child = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function start(files: Record<string, string>, port: number, workers = 2) {
  dir = mkdtempSync(join(tmpdir(), 'web-cluster-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  let out = '';
  child = spawn(process.execPath, [PRIMARY], {
    env: {
      ...process.env,
      WEB_SERVER_DIR: dir,
      FIXTURE_DIR: dir,
      PORT: String(port),
      NITRO_CLUSTER_WORKERS: String(workers),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout!.on('data', (d) => (out += d));
  child.stderr!.on('data', (d) => (out += d));
  return { log: () => out };
}

describe('the web cluster primary', () => {
  it('replaces workers the OOM killer takes, even all of them, and keeps serving', async () => {
    const port = await freePort();
    const { log } = start({ 'worker.mjs': WORKER }, port);
    const before = new Set(await until(async () => (readyPids().length === 2 ? readyPids() : null)));
    await until(() => get(port));

    // Kill every worker, one after the other: under Nitro's primary this is the outage.
    for (let i = 0; i < 2; i++) await get(port, '/die');

    const after = await until(async () => {
      const pid = await get(port);
      return pid && !before.has(pid) ? pid : null;
    });
    expect(before.has(after)).toBe(false);
    expect(child!.exitCode).toBeNull();
    expect(log()).toMatch(/exited with signal SIGKILL \(likely the OOM killer\)/);
  }, 40_000);

  it('forwards SIGTERM to every worker and exits once they have drained', async () => {
    const port = await freePort();
    start({ 'worker.mjs': WORKER }, port);
    await until(async () => readyPids().length === 2);
    const exited = new Promise<number | null>((ok) => child!.on('exit', (code) => ok(code)));
    child!.kill('SIGTERM');
    expect(await exited).toBe(0);
    const drained = readdirSync(dir).filter((f) => f.startsWith('drained-'));
    expect(drained).toHaveLength(2);
  }, 40_000);

  it('runs a single-process build (no worker.mjs) in place', async () => {
    const port = await freePort();
    start(
      {
        'index.mjs': `import http from 'node:http'; http.createServer((q, s) => s.end('single')).listen(${port});`,
      },
      port,
    );
    expect(await until(() => get(port))).toBe('single');
    expect(existsSync(join(dir, 'worker.mjs'))).toBe(false);
  }, 40_000);
});
