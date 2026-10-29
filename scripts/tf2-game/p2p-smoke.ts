/**
 * Real-browser smoke test of peer-to-peer play (not part of any suite):
 * headless Chromium pages on the local dev stack, three signed-in accounts.
 *
 *   1. Page A hosts a P2P game on ctf_2fort (the lobby's "Host a P2P game").
 *   2. Page B opens A's invite link (`/tf2/play?lobby=CODE`): the hub says it
 *      is a P2P room, B joins over WebRTC — asserts a **Direct** connection,
 *      snapshots arriving over the DataChannel, B moving, and A seeing B move.
 *   3. Page C joins with every ICE candidate dropped on both sides (the
 *      `__tf2P2pTest` hook: no STUN, no host candidates — a direct path can
 *      never form): after the 8 s direct timeout the hub relays it — asserts
 *      **Relayed**, snapshots, C moving, A seeing it, and the host's
 *      scoreboard column. Measures the fallback time and each member's
 *      bandwidth. With `--turn`, C instead gathers only TURN candidates
 *      (`relayOnly`) with the credentials the hub minted for it — asserts
 *      **TURN** (a relay candidate pair), before any hub relay.
 *   4. `--background`: the host's tab goes to the background — hidden, its
 *      animation frames stopped and its page timers throttled to once a
 *      second, as a browser does to a background tab — for 20 s; asserts the
 *      members keep receiving ≥ 30 snapshots/s (the worker sends them and keeps
 *      the room's clock) and that the host sees its notice.
 *   5. `--migration`: the host's browser is closed mid-match (no goodbye);
 *      asserts one member becomes the host from its checkpoint, the other is
 *      re-admitted by it and keeps receiving snapshots and moving, both see
 *      "Host migrated", and the new host's pause menu has the Server view.
 *   6. `--screenshot`: `screenshot` in a member's console; the PNG (the game
 *      view with its HUD) is saved to --out.
 *
 * Setup (no TF2 install needed: game assets are proxied from production,
 * cached under --cache):
 *
 *   # a throwaway Postgres with the schema (accounts are real: multiplayer needs sign-in)
 *   DATABASE_URL=postgresql://…/scratch pnpm exec prisma migrate deploy
 *   # the games hub (signaling + relay; TF2_MATCH_HOST=echo: no dedicated matches needed).
 *   # On a busy machine, software-rendered pages can stall past socket.io's 45 s ping
 *   # window; SOCKET_PING_TIMEOUT=120000 keeps the hub from dropping them.
 *   SOCKET_CORS_ORIGIN=http://localhost:7997 DATABASE_URL=… TF2_MATCH_HOST=echo \
 *     pnpm exec tsx server/socket-server/index.ts
 *   # the site
 *   DATABASE_URL=… BETTER_AUTH_SECRET=<32+ chars> BETTER_AUTH_URL=http://localhost:7997 \
 *     VITE_SOCKET_URL=http://localhost:7001 pnpm exec vite dev --port 7997
 *   # the test (NODE_USE_ENV_PROXY=1 when the network needs the env proxy)
 *   pnpm exec tsx scripts/tf2-game/p2p-smoke.ts --base http://localhost:7997 --out /tmp/p2p-smoke \
 *     [--assets https://rmhstudios.com] [--cache /tmp/tf2-asset-cache] [--chromium <chrome binary>] [--skip-relay]
 *
 * Exit code 1 when an assertion fails; `report.json` in --out has what each page saw.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k: string, d?: string): string | undefined => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (k: string) => argv.includes(`--${k}`);
const BASE = arg('base', 'http://localhost:7997')!;
const OUT = arg('out', path.resolve('p2p-smoke-out'))!;
const ASSETS = arg('assets', 'https://rmhstudios.com')!;
const CACHE = arg('cache', path.join(OUT, 'asset-cache'))!;
const LOAD_TIMEOUT = Number(arg('timeout', '420000'));
const SKIP_RELAY = flag('skip-relay');
/** A TURN server for C (the hub must mint credentials for it: TURN_URL / TURN_SECRET). */
const TURN = arg('turn');
const BACKGROUND = flag('background');
const MIGRATION = flag('migration');
const SCREENSHOT = flag('screenshot');
/** Echo every console line of every page (debugging a run). */
const VERBOSE = flag('verbose');
const pages: Array<{ label: string; page: Page }> = [];

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });
const report: Record<string, unknown> = {};
const failures: string[] = [];
const log = (...a: unknown[]) => process.stdout.write(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n');
const check = (ok: boolean, what: string) => {
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

type Debug = {
  localEntity: number;
  alive: boolean;
  origin: { x: number; y: number; z: number } | null;
  snapshots: number;
  players: Array<{ id: number; x: number; y: number; z: number; alive: boolean }>;
  p2p: Record<string, unknown> | null;
  stats: { pingMs: number | null; fps: number };
};

// ─── Game assets, proxied from a deployment and cached on disk ──────────────

const inflight = new Map<string, Promise<{ status: number; body: Buffer; type: string; encoding?: string }>>();

async function fetchAsset(urlPath: string): Promise<{ status: number; body: Buffer; type: string; encoding?: string }> {
  const key = createHash('sha1').update(urlPath).digest('hex');
  const file = path.join(CACHE, key);
  if (existsSync(file)) {
    const meta = JSON.parse(readFileSync(`${file}.json`, 'utf8')) as { status: number; type: string; encoding?: string };
    return { ...meta, body: readFileSync(file) };
  }
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      let res: Response | null = null;
      // A CDN in front of the deployment answers 52x now and then under a burst: retry those.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          res = await fetch(ASSETS + urlPath, { headers: { 'accept-encoding': 'identity' } });
          if (res.status < 500) break;
        } catch (e) {
          if (attempt === 3) throw e;
        }
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
      if (!res) throw new Error('no response');
      const body = Buffer.from(await res.arrayBuffer());
      const meta = { status: res.status, type: res.headers.get('content-type') ?? 'application/octet-stream' };
      if (res.status === 200 || res.status === 404) {
        writeFileSync(file, body);
        writeFileSync(`${file}.json`, JSON.stringify(meta));
      }
      return { ...meta, body };
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function proxyAssets(ctx: BrowserContext): Promise<void> {
  // The listen server (a worker) reads the map package from the same API, and context routes cover workers.
  await ctx.route(/\/api\/(tf2-game\/assets|tf2-loadout\/(catalog|models|particles))\//, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.continue();
    try {
      const r = await fetchAsset(url.pathname + url.search);
      await route.fulfill({ status: r.status, body: r.body, headers: { 'content-type': r.type, 'cache-control': 'no-store' } });
    } catch (e) {
      log(`  asset ${url.pathname}: ${e instanceof Error ? e.message : String(e)}`);
      await route.fulfill({ status: 502, body: '' });
    }
  });
}

// ─── Pages ──────────────────────────────────────────────────────────────────

async function signUp(ctx: BrowserContext, label: string): Promise<string> {
  const email = `p2p-${label}-${Date.now()}@example.test`;
  const name = `P2P ${label.toUpperCase()}`;
  const res = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, {
    data: { email, password: 'p2p-smoke-password-1', name },
    headers: { origin: BASE },
  });
  if (!res.ok()) throw new Error(`sign-up ${label}: HTTP ${res.status()} ${await res.text()}`);
  return name;
}

async function debug(page: Page): Promise<Debug | null> {
  return page.evaluate(() => {
    const g = (window as unknown as { __rmhGame?: { debug?: () => unknown } }).__rmhGame;
    return (g?.debug?.() as Debug) ?? null;
  });
}

async function hudCommand(page: Page, cmd: Record<string, unknown>): Promise<void> {
  await page.evaluate((c) => {
    const g = (window as unknown as { __rmhGame?: { store: { send(c: unknown): void } } }).__rmhGame;
    g?.store.send(c);
  }, cmd);
}

async function hold(page: Page, actions: string[], ms: number): Promise<void> {
  await page.evaluate((a) => {
    const g = (window as unknown as { __rmhGame?: { input: { held: { key: Set<string> } } } }).__rmhGame;
    for (const x of a) g?.input.held.key.add(x);
  }, actions);
  await page.waitForTimeout(ms);
  await page.evaluate((a) => {
    const g = (window as unknown as { __rmhGame?: { input: { held: { key: Set<string> } } } }).__rmhGame;
    for (const x of a) g?.input.held.key.delete(x);
  }, actions);
}

/**
 * Pretends the tab is hidden (or visible again): the game loop pauses — no frames,
 * no rendering — while the match, the links and the hub socket carry on. Three
 * pages rendering 2Fort in software starve each other's main threads (a host frozen
 * for 45 s loses its hub socket), so only the page being looked at draws.
 */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  // A string, not a function: tsx's name-keeping helper would not exist in the page.
  await page.evaluate(
    `Object.defineProperty(document, 'visibilityState', { configurable: true, get() { return '${hidden ? 'hidden' : 'visible'}'; } });
     document.dispatchEvent(new Event('visibilitychange'));`,
  );
}

/**
 * A background tab, as the browser makes one: hidden, no animation frames (the game loop stops),
 * and the page's timers throttled to at most once a second. Workers are not throttled.
 */
const THROTTLE_INIT = `(() => {
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window);
  const hidden = () => document.visibilityState === 'hidden';
  window.__tf2Throttled = { timeouts: 0, intervals: 0 };
  window.setTimeout = (fn, ms, ...a) => st(fn, hidden() ? Math.max(1000, ms || 0) : ms, ...a);
  window.setInterval = (fn, ms, ...a) => {
    let last = 0;
    return si((...b) => {
      if (hidden()) {
        const now = performance.now();
        if (now - last < 1000) { window.__tf2Throttled.intervals++; return; }
        last = now;
      }
      fn(...b);
    }, ms, ...a);
  };
})();`;

async function waitRunning(page: Page, label: string, timeout = LOAD_TIMEOUT): Promise<void> {
  const t0 = Date.now();
  await page.waitForFunction(
    () => {
      const p = document.querySelector('.tf2g-stage')?.getAttribute('data-phase');
      return p === 'running' || p === 'error' || p === 'ended';
    },
    undefined,
    { timeout, polling: 500 },
  );
  const phase = await page.getAttribute('.tf2g-stage', 'data-phase');
  log(`${label}: ${phase} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (phase === 'error') throw new Error(`${label} failed: ${await page.locator('.tf2g-stage').innerText()}`);
}

async function until<T>(page: Page, what: string, fn: (d: Debug) => T | null | undefined | false, timeoutMs = 60_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const d = await debug(page);
    const v = d ? fn(d) : null;
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out: ${what} (last: ${JSON.stringify(d?.p2p ?? null).slice(0, 300)})`);
    await page.waitForTimeout(500);
  }
}

/** Team and class, then wait until alive. */
async function spawn(page: Page, team: 'red' | 'blue', label: string): Promise<void> {
  await hudCommand(page, { kind: 'team', team });
  await page.waitForTimeout(500);
  await hudCommand(page, { kind: 'class', cls: 'scout' });
  await until(page, `${label} alive`, (d) => d.alive && d.origin, 90_000);
}

/** Walks `page` forward and checks it moved, and that `watcher` saw its entity move. */
async function walkAndWatch(page: Page, watcher: Page, label: string, turns: readonly number[] = [0, 90]): Promise<void> {
  const me = (await debug(page))!;
  await setHidden(watcher, false);
  await watcher.waitForTimeout(3000);
  const seenBefore = (await debug(watcher))?.players.find((p) => p.id === me.localEntity);
  // Two legs at right angles (a wall may stop one).
  let moved = 0;
  let from = me.origin;
  for (const turn of turns) {
    await page.evaluate(`(window.__rmhGame && (window.__rmhGame.input.lookYaw += ${turn}))`);
    await hold(page, ['forward'], 1500);
    await page.waitForTimeout(300);
    const at = (await debug(page))!.origin;
    if (from && at) moved += Math.hypot(at.x - from.x, at.y - from.y);
    from = at;
  }
  await page.waitForTimeout(1000);
  const after = (await debug(page))!;
  const dbg = (d: Debug | null) => (d ? { origin: d.origin, alive: d.alive, ...(d as unknown as Record<string, unknown>), players: undefined, stats: undefined } : null);
  report[`walk-${label}`] = { before: dbg(me), after: dbg(after) };
  check(moved > 100, `${label} moves (${moved.toFixed(0)} units walked)`);
  await watcher.waitForTimeout(2500);
  const seenAfter = (await debug(watcher))?.players.find((p) => p.id === me.localEntity);
  await setHidden(watcher, true);
  const seenMoved = seenBefore && seenAfter ? Math.hypot(seenAfter.x - seenBefore.x, seenAfter.y - seenBefore.y) : 0;
  const ownNet = me.origin && after.origin ? Math.hypot(after.origin.x - me.origin.x, after.origin.y - me.origin.y) : 0;
  check(seenMoved > 50 && Math.abs(seenMoved - ownNet) < 64, `the host sees ${label} move (${seenMoved.toFixed(0)} units; ${label} itself ${ownNet.toFixed(0)})`);
  const gap = seenAfter && after.origin ? Math.hypot(seenAfter.x - after.origin.x, seenAfter.y - after.origin.y) : Infinity;
  check(gap < 64, `the host draws ${label} where ${label} is (${gap.toFixed(1)} units apart)`);
}

/** Each connected member's link as the host sees it, over 10 s. */
async function measure(host: Page, phase: string): Promise<void> {
  type Peer = { peerId: string; relayed: boolean; stats: { sentBytes: number; receivedBytes: number; rttMs: number | null; loss: number; jitterMs: number; maxUnreliableBytes: number; droppedUnreliable: number } };
  const t0 = await debug(host);
  await host.waitForTimeout(10_000);
  const t1 = await debug(host);
  const peers0 = (t0?.p2p?.peers ?? []) as Peer[];
  const peers1 = (t1?.p2p?.peers ?? []) as Peer[];
  report[`bandwidth-${phase}`] = peers1.map((p) => {
    const before = peers0.find((q) => q.peerId === p.peerId);
    const down = before ? (p.stats.sentBytes - before.stats.sentBytes) / 10 / 1024 : null;
    const up = before ? (p.stats.receivedBytes - before.stats.receivedBytes) / 10 / 1024 : null;
    log(`  member ${p.peerId} (${p.relayed ? 'relayed' : 'direct'}): host → member ${down?.toFixed(1)} KB/s, member → host ${up?.toFixed(1)} KB/s, rtt ${p.stats.rttMs?.toFixed(1)} ms, loss ${(p.stats.loss * 100).toFixed(1)} %, max datagram ${p.stats.maxUnreliableBytes} B, dropped ${p.stats.droppedUnreliable}`);
    check(p.stats.maxUnreliableBytes <= 1200, `no datagram above 1200 bytes (${p.stats.maxUnreliableBytes})`);
    return { peerId: p.peerId, relayed: p.relayed, downKBps: down, upKBps: up, stats: p.stats };
  });
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const browsers: Array<import('playwright').Browser> = [];
  const open = async (label: string, init?: string) => {
    // One browser per player, as in life: a shared one shares its GPU process, and three pages
    // compiling 2Fort's shaders in software (SwiftShader) stall each other's main threads.
    const browser = await chromium.launch({
      headless: true,
      executablePath: arg('chromium') ?? process.env.CHROMIUM_PATH,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    browsers.push(browser);
    // Small and on the low tier: three pages render 2Fort in software at once.
    const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
    await proxyAssets(ctx);
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('rmh:tf2-game:settings:tf2', JSON.stringify({ quality: 'low' }));
      } catch {
        /* storage blocked: the default tier */
      }
    });
    if (init) await ctx.addInitScript(init);
    const name = await signUp(ctx, label);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${label}: ${m.text()}`);
      if (VERBOSE) log(`  [${label} console.${m.type()}] ${m.text().slice(0, 300)}`);
    });
    page.on('crash', () => {
      errors.push(`${label}: the page crashed`);
      log(`  ${label}: PAGE CRASHED`);
    });
    pages.push({ label, page });
    return { ctx, page, name, browser };
  };

  try {
    // ── 1. A hosts. ──
    // The host's tab is the one that may go to the background (its page timers throttled then).
    const a = await open('a', BACKGROUND ? THROTTLE_INIT : undefined);
    await a.page.goto(`${BASE}/tf2/play`, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 30; i++) {
      const btn = a.page.getByRole('button', { name: /Host a P2P game/i });
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click();
        if (await a.page.waitForSelector('.tf2g-stage', { timeout: 3000 }).catch(() => null)) break;
      }
      await a.page.waitForTimeout(1000);
    }
    await waitRunning(a.page, 'host');
    const code = await until(a.page, 'room code', (d) => (d.p2p?.code as string | null) ?? null);
    log(`hosted ${code}`);
    await a.page.screenshot({ path: path.join(OUT, 'host.png') });
    await spawn(a.page, 'red', 'host');
    await setHidden(a.page, true);

    // ── 2. B joins by the invite link: direct. ──
    const b = await open('b');
    const tB = Date.now();
    await b.page.goto(`${BASE}/tf2/play?lobby=${code}`, { waitUntil: 'domcontentloaded' });
    await waitRunning(b.page, 'member B', 240_000);
    const bConn = await until(b.page, 'B connection', (d) => (d.p2p?.connection as string | null) ?? null);
    report.directJoinMs = Date.now() - tB;
    report.directConnectMs = Math.round(Number((await debug(b.page))?.p2p?.connectMs ?? NaN));
    check(bConn === 'direct', `B is connected directly (${bConn}, ${String(report.directConnectMs)} ms from admission to an open link)`);
    const s0 = (await debug(b.page))!.snapshots;
    await b.page.waitForTimeout(2000);
    const s1 = (await debug(b.page))!.snapshots;
    check(s1 - s0 > 40, `B receives snapshots over the DataChannel (${s1 - s0} in 2 s)`);
    await spawn(b.page, 'blue', 'B');
    await walkAndWatch(b.page, a.page, 'B');
    await b.page.screenshot({ path: path.join(OUT, 'member-b.png') });
    report.b = await debug(b.page);
    const directLinks = Object.values(((await debug(a.page))?.p2p?.links ?? {}) as Record<string, string>);
    check(directLinks.includes('host') && directLinks.includes('direct'), `the host's scoreboard column: ${directLinks.join(', ')}`);
    await measure(a.page, 'direct');

    // ── 4. The host's tab in the background: the members keep their snapshot rate. ──
    if (BACKGROUND) {
      await setHidden(a.page, true);
      const n0 = (await debug(b.page))!.snapshots;
      const up0 = ((await debug(a.page))?.p2p?.peers as Array<{ stats: { receivedPackets: number } }> | undefined)?.[0]?.stats.receivedPackets ?? 0;
      await b.page.waitForTimeout(20_000);
      const n1 = (await debug(b.page))!.snapshots;
      const hostNow = (await debug(a.page))!;
      const rate = (n1 - n0) / 20;
      report.backgroundSnapshotRate = rate;
      report.backgroundThrottled = await a.page.evaluate('window.__tf2Throttled');
      check(rate >= 30, `with the host's tab in the background, B receives ${rate.toFixed(1)} snapshots/s (≥ 30)`);
      const peer = (hostNow.p2p?.peers as Array<{ stats: { receivedPackets: number; rttMs: number | null } }> | undefined)?.[0];
      check(!!peer && peer.stats.receivedPackets > up0, `the host's link to B stays alive while hidden (rtt ${peer?.stats.rttMs?.toFixed(0)} ms)`);
      const notices = (hostNow as unknown as { notices: Array<{ kind: string }> }).notices ?? [];
      report.hostNotices = notices;
    }

    if (!MIGRATION) {
      // Two software-rendered pages at a time: B's browser goes before C's comes (its seat is held 30 s).
      await b.browser.close();
    } else {
      await setHidden(b.page, true);
    }

    // ── 3. C joins with no direct path: relayed (or TURN with --turn). ──
    let cPage: Page | null = null;
    if (!SKIP_RELAY || TURN) {
      // Both ends drop their candidates for new connections (A's link to B is already up) — or, with
      // a TURN server, gather only TURN (relay) candidates with the hub's minted credentials.
      const hooks = TURN ? '{ relayOnly: true }' : '{ iceServers: [], blockCandidates: true }';
      await a.page.evaluate(`window.__tf2P2pTest = ${hooks}`);
      const c = await open('c', `window.__tf2P2pTest = ${hooks};`);
      cPage = c.page;
      const tC = Date.now();
      await c.page.goto(`${BASE}/tf2/play?lobby=${code}`, { waitUntil: 'domcontentloaded' });
      await waitRunning(c.page, 'member C', 240_000);
      const cConn = await until(c.page, 'C connection', (d) => (d.p2p?.connection as string | null) ?? null, 60_000);
      report.relayJoinMs = Date.now() - tC;
      report.relayConnectMs = Math.round(Number((await debug(c.page))?.p2p?.connectMs ?? NaN));
      const want = TURN ? 'turn' : 'relayed';
      check(cConn === want, `C ${TURN ? 'connects through the TURN server' : 'falls back to the hub relay'} (${cConn}, ${String(report.relayConnectMs)} ms from admission to an open link)`);
      const c0 = (await debug(c.page))!.snapshots;
      await c.page.waitForTimeout(2000);
      const c1 = (await debug(c.page))!.snapshots;
      check(c1 - c0 > 30, `C receives snapshots (${c1 - c0} in 2 s)`);
      await spawn(c.page, 'blue', 'C');
      await walkAndWatch(c.page, a.page, 'C');
      await c.page.screenshot({ path: path.join(OUT, 'member-c.png') });
      const host = (await debug(a.page))!;
      const links = Object.values((host.p2p?.links ?? {}) as Record<string, string>);
      check(links.includes('host') && links.includes(want), `the host's scoreboard column: ${links.join(', ')}`);
      report.c = await debug(c.page);
      await measure(a.page, TURN ? 'turn' : 'relayed');
      await a.page.evaluate('window.__tf2P2pTest = undefined');
    }

    // ── 5. The host's browser closes mid-match: the match moves to a member. ──
    if (MIGRATION && cPage) {
      // The host has named a successor and sent it checkpoints.
      const succ = await until(a.page, 'a successor with a checkpoint', (d) => ((d.p2p?.checkpointsSent as number) > 0 ? (d.p2p?.successor as number) : null), 60_000);
      report.successor = succ;
      report.checkpointBytes = (await debug(a.page))?.p2p?.checkpointBytes;
      const before = (await debug(b.page))!;
      const tickBefore = before.snapshots;
      const members = [
        { label: 'B', page: b.page },
        { label: 'C', page: cPage },
      ];
      await setHidden(b.page, false);
      await setHidden(cPage, false);
      const tClose = Date.now();
      await a.browser.close();
      // Someone becomes the host.
      let newHost: { label: string; page: Page } | null = null;
      for (let i = 0; i < 120 && !newHost; i++) {
        for (const m of members) {
          const d = await debug(m.page).catch(() => null);
          if ((d as unknown as { role?: string } | null)?.role === 'p2p-host') newHost = m;
        }
        if (!newHost) await b.page.waitForTimeout(500);
      }
      check(!!newHost, `a member became the host (${newHost?.label ?? 'none'}) ${((Date.now() - tClose) / 1000).toFixed(1)} s after the host's browser closed`);
      if (newHost) {
        const other = members.find((m) => m !== newHost)!;
        await waitRunning(newHost.page, `new host ${newHost.label}`, 240_000);
        const otherConn = await until(other.page, `${other.label} reconnected to the new host`, (d) => (d.p2p?.connection as string | null) ?? null, 90_000);
        report.migrationMs = Date.now() - tClose;
        check(!!otherConn, `${other.label} is connected to the new host (${otherConn}) ${(report.migrationMs as number / 1000).toFixed(1)} s after the close`);
        // The notice, while it shows (a few seconds).
        const early = ((await debug(other.page)) as unknown as { notices: Array<{ kind: string; name: string | null }> }).notices;
        check(early.some((n) => n.kind === 'host-migrated' || n.kind === 'migrating'), `${other.label} is told the host migrated (${JSON.stringify(early)})`);
        const o0 = (await debug(other.page))!.snapshots;
        await other.page.waitForTimeout(3000);
        const o1 = (await debug(other.page))!.snapshots;
        check(o1 - o0 > 60, `${other.label} receives snapshots from the new host (${o1 - o0} in 3 s)`);
        void tickBefore;
        const alive = await until(other.page, `${other.label} alive on the new host`, (d) => (d.alive && d.origin) || null, 90_000).catch(() => null);
        if (!alive) await spawn(other.page, 'blue', other.label);
        // Its last walk ended in a corner (facing the wall): turn round first.
        await walkAndWatch(other.page, newHost.page, `${other.label} (after the migration)`, [180, 90]);
        // The pause menu's Server view, on the new host (any device: it is a menu entry, not a corner chip).
        await newHost.page.evaluate('window.__rmhGame.store.dispatchImpulse("menu")');
        const server = await newHost.page
          .getByRole('button', { name: /^Server$/ })
          .first()
          .waitFor({ timeout: 10_000 })
          .then(() => true)
          .catch(() => false);
        check(server, 'the new host has the Server view in its pause menu');
        if (server) {
          await newHost.page.getByRole('button', { name: /^Server$/ }).first().click();
          await newHost.page.waitForTimeout(1000);
          await newHost.page.screenshot({ path: path.join(OUT, 'new-host-server-view.png') });
          const kick = await newHost.page.getByRole('button', { name: /^Kick / }).count();
          check(kick > 0, `the Server view lists the members with Kick (${kick})`);
          await newHost.page.keyboard.press('Escape');
        }
        report.newHost = await debug(newHost.page);
        report.other = await debug(other.page);
        await newHost.page.screenshot({ path: path.join(OUT, 'new-host.png') });
        await other.page.screenshot({ path: path.join(OUT, 'after-migration.png') });
      }
    }

    // ── 6. A screenshot with the HUD. ──
    if (SCREENSHOT) {
      const page = cPage ?? b.page;
      await setHidden(page, false);
      const dl = page.waitForEvent('download', { timeout: 30_000 });
      await page.evaluate('window.__rmhGame.console.console.submit("screenshot")');
      const file = await dl;
      const target = path.join(OUT, 'console-screenshot.png');
      await file.saveAs(target);
      report.screenshot = target;
      check(existsSync(target) && readFileSync(target).byteLength > 10_000, `screenshot saved (${readFileSync(target).byteLength} bytes)`);
    }
    if (!MIGRATION) report.host = await debug(a.page);
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e));
    log(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    for (const { label, page } of pages) {
      await page.screenshot({ path: path.join(OUT, `failure-${label}.png`) }).catch(() => {});
      report[`failure-${label}`] = { text: (await page.locator('body').innerText().catch(() => '')).slice(0, 2000), debug: await debug(page).catch(() => null) };
    }
  }
  report.consoleErrors = errors.slice(0, 80);
  report.failures = failures;
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  log(`report → ${path.join(OUT, 'report.json')} (${errors.length} console errors, ${failures.length} failures)`);
  for (const b of browsers) await b.close().catch(() => {});
  process.exit(failures.length ? 1 : 0);
}

void main();
