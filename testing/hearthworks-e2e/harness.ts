/**
 * The machinery of the real-browser Hearthworks e2e: bundle the player page, serve it, launch Chromium
 * processes, and give each player a typed handle on its `window.hw` probe (page/entry.ts).
 *
 * Players live in two Chromium PROCESSES so a "closed tab" can be a hard kill: the host's browser is its own
 * process and `kill -9` takes it down with no `close` frame, no `bye`, no socket FIN from the page — exactly
 * what a crash, a pulled cable or a closed laptop lid looks like to the others. Everyone else shares the
 * other process, one browser context (separate renderer, separate WebRTC stack) each.
 */

import { existsSync } from 'node:fs';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type BrowserServer, type Page } from 'playwright';
import type { Probe } from './page/entry';
import { startHub, type HubAccount, type HubOptions, type TestHub } from './hub';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

/* ─── Bundle and static server ───────────────────────────────────────────── */

export async function bundlePage(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(here, 'page/entry.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    sourcemap: 'inline',
    tsconfig: path.join(root, 'tsconfig.json'),
    logLevel: 'error',
    define: {
      'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'e2e' }),
      'process.env.NODE_ENV': '"development"',
    },
  });
  return out.outputFiles[0].text;
}

export interface Page404 {
  url: string;
  close(): Promise<void>;
}

/** Serves `/?c=<json>` as the player page with its config inlined, and `/bundle.js`. */
export async function servePage(bundle: string): Promise<Page404> {
  const server: HttpServer = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    if (u.pathname === '/bundle.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end(bundle);
      return;
    }
    const config = u.searchParams.get('c') ?? '{}';
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>hearthworks e2e</title><body>` +
        `<script>window.__HW_CONFIG__=${config.replace(/</g, '\\u003c')}</script><script src="/bundle.js"></script></body>`,
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))),
  };
}

/* ─── Browsers ───────────────────────────────────────────────────────────── */

/**
 * The repo's Playwright can want a newer Chromium build than the box has; fall back to whatever
 * `CHROMIUM_PATH` / `/opt/pw-browsers/chromium` / a system Chrome provides.
 */
function executablePath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* fall through */
  }
  for (const p of ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']) if (existsSync(p)) return p;
  return undefined;
}

const CHROMIUM_ARGS = [
  // Loopback host candidates must be plain IPs, not mDNS names (a sandbox has no multicast DNS).
  '--disable-features=WebRtcHideLocalIpsWithMdns',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--autoplay-policy=no-user-gesture-required',
];

export interface BrowserProc {
  server: BrowserServer;
  browser: Browser;
  /** SIGKILL: no close frame, no FIN — a crash. */
  kill(): void;
  /** SIGSTOP the whole process group: a frozen tab / a laptop lid closed. Sockets stay open, nothing answers. */
  freeze(): void;
  thaw(): void;
  close(): Promise<void>;
}

function groupSignal(pid: number | undefined, sig: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, sig); // Playwright starts the browser in its own process group
  } catch {
    try {
      process.kill(pid, sig);
    } catch {
      /* already gone */
    }
  }
}

export async function launchBrowser(): Promise<BrowserProc> {
  const server = await chromium.launchServer({ executablePath: executablePath(), args: CHROMIUM_ARGS, headless: true });
  const browser = await chromium.connect(server.wsEndpoint());
  return {
    server,
    browser,
    kill: () => void server.process().kill('SIGKILL'),
    freeze: () => groupSignal(server.process().pid, 'SIGSTOP'),
    thaw: () => groupSignal(server.process().pid, 'SIGCONT'),
    async close() {
      await browser.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}

/* ─── Players ────────────────────────────────────────────────────────────── */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Player {
  readonly page: Page;
  readonly errors: string[] = [];
  constructor(
    readonly label: string,
    readonly account: HubAccount,
    page: Page,
    readonly context: BrowserContext,
  ) {
    this.page = page;
    page.on('pageerror', (e) => this.errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(`console.error: ${m.text()}`);
    });
  }

  /** Run `fn` in the page with the probe (`window.hw`). */
  async ev<R, A = void>(fn: (hw: Probe, arg: A) => R | Promise<R>, arg?: A): Promise<R> {
    return this.page.evaluate(
      ({ src, a }) => {
        return new Function('hw', 'arg', `return (${src})(hw, arg)`)((window as unknown as { hw: Probe }).hw, a);
      },
      { src: fn.toString(), a: arg },
    ) as Promise<R>;
  }

  /** Wait until `fn(hw)` is truthy in the page. */
  async until<A = void>(desc: string, fn: (hw: Probe, arg: A) => unknown, timeoutMs = 30_000, arg?: A): Promise<void> {
    const started = Date.now();
    try {
      await this.page.waitForFunction(
        ({ src, a }) => {
            return !!new Function('hw', 'arg', `return (${src})(hw, arg)`)((window as unknown as { hw: Probe }).hw, a);
        },
        { src: fn.toString(), a: arg },
        { timeout: timeoutMs, polling: 50 },
      );
    } catch (err) {
      const logs = await this.page.evaluate(() => (window as unknown as { hw: Probe }).hw?.logs?.().slice(-25) ?? []).catch(() => ['(page gone)']);
      throw new Error(`[${this.label}] timed out after ${Date.now() - started} ms waiting for: ${desc}\n${String(err).split('\n')[0]}\nlast logs:\n  ${logs.join('\n  ')}`, { cause: err });
    }
  }
}

export interface Harness {
  hub: TestHub;
  pageServer: Page404;
  hostProc: BrowserProc;
  groupProc: BrowserProc;
  players: Player[];
  /** Stop the hub and start a fresh one (no rooms) on the same port: what a deploy or a crash does to it. */
  restartHub(): Promise<void>;
  /** Open a new player; `proc` picks which Chromium process it lives in. */
  newPlayer(label: string, account: HubAccount, opts?: { proc?: 'host' | 'group'; size?: number; seed?: number }): Promise<Player>;
  close(): Promise<void>;
}

export async function startHarness(accounts: Record<string, HubAccount>, hubOpts: HubOptions = {}): Promise<Harness> {
  const hub = await startHub(accounts, hubOpts);
  const bundle = await bundlePage();
  const pageServer = await servePage(bundle);
  const [hostProc, groupProc] = [await launchBrowser(), await launchBrowser()];
  const players: Player[] = [];
  const h: Harness = {
    hub,
    pageServer,
    hostProc,
    groupProc,
    players,
    async restartHub() {
      const { port } = h.hub;
      await h.hub.close();
      h.hub = await startHub(accounts, { ...hubOpts, port });
    },
    async newPlayer(label, account, opts = {}) {
      const token = [...h.hub.accounts.entries()].find(([, a]) => a.id === account.id)?.[0];
      if (!token) throw new Error(`no token for ${account.id}`);
      const proc = opts.proc === 'host' ? hostProc : groupProc;
      const context = await proc.browser.newContext();
      // tsx compiles with keepNames, and a function serialised into the page keeps its `__name(...)` calls.
      await context.addInitScript('window.__name = (f) => f;');
      const page = await context.newPage();
      const config = { hubUrl: h.hub.url, token, account, seed: opts.seed ?? 20261104, size: opts.size ?? 32 };
      await page.goto(`${pageServer.url}/?c=${encodeURIComponent(JSON.stringify(config))}`);
      await page.waitForFunction(() => !!(window as unknown as { hw: Probe }).hw, null, { timeout: 15_000 });
      const p = new Player(label, account, page, context);
      players.push(p);
      return p;
    },
    async close() {
      // A frozen browser cannot be closed until it runs again.
      hostProc.thaw();
      groupProc.thaw();
      await Promise.all([hostProc.close(), groupProc.close()]).catch(() => {});
      await pageServer.close().catch(() => {});
      await h.hub.close().catch(() => {});
    },
  };
  return h;
}
