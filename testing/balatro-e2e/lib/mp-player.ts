/**
 * One real player in a match e2e (PLAN §6.3): a signed-in browser context on the
 * test build's /balatro (VITE_BALATRO_MP_TEST=1), with multiplayer opened and the
 * autopilot reachable through `window.__balatroMp` (lib/balatro/mp/test-hooks.ts).
 *
 *   const p = await openMpPlayer(player, stack.baseUrl);
 *   await p.ui('create', { queueMode: 'pvp_nemesis' });     // MP.test.ui{op='create'}
 *   const code = (await p.waitSnap((s) => !!s.code)).code;
 *   await q.ui('join', { code });
 *   await p.cmd('win_blind');                              // any autopilot command
 *
 * Errors: page errors, `[lua:error]` lines (mp_log from Lua) and `[mp]` errors the
 * session logs are collected in `errors`; `luaErrors()` filters the ones a match must
 * never produce.
 */
import type { BrowserContext, Page } from 'playwright';
import type { Player } from './accounts';
import { waitFor } from './stack';

export const MP_BOOT_TIMEOUT_MS = Number(process.env.BALATRO_E2E_BOOT_TIMEOUT_MS ?? 300_000);

/** The session runtime's snapshot (lib/balatro/mp/lobby/runtime.ts RuntimeSnapshot). */
export interface MpSnap {
  me: string | null;
  role: 'host' | 'member' | 'spectator' | 'practice' | null;
  code: string | null;
  lobby: {
    code: string;
    kind: 'private' | 'casual' | 'party';
    queueMode: string;
    hostId: string;
    successorId: string | null;
    version: number;
    players: { id: string; name: string; ready: boolean; connected: boolean; away: boolean; role: string; conn: string; team?: string }[];
    options: Record<string, unknown>;
    started: { runId: string; seed: string; [k: string]: unknown } | null;
    setup: unknown;
    kicked: string[];
  } | null;
  runId: string | null;
  hub: string | null;
  lastHs: number;
  result: 'win' | 'lose' | 'draw' | null;
  target: string | null;
  lives: Record<string, number>;
  checkpointSeq: number | null;
}

export interface MpPlayer {
  label: string;
  page: Page;
  context: BrowserContext;
  errors: string[];
  /** Every console line of the page (bounded). */
  logs: string[];
  cmd<T = unknown>(cmd: string, args?: unknown[] | Record<string, unknown>, timeoutMs?: number): Promise<T>;
  /** MP.test.<fn>(args) through the autopilot's `mp` command. */
  mp<T = unknown>(fn: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
  /** MP.test.ui{op, ...}: drive an out-of-run screen action. */
  ui(op: string, args?: Record<string, unknown>): Promise<UiState>;
  uiState(): Promise<UiState>;
  snap(): Promise<MpSnap>;
  waitSnap(pred: (s: MpSnap) => boolean, what?: string, timeoutMs?: number): Promise<MpSnap>;
  waitUi(pred: (s: UiState) => boolean, what?: string, timeoutMs?: number): Promise<UiState>;
  luaErrors(): string[];
  close(): Promise<void>;
}

export interface UiState {
  screen?: string;
  overlay?: string;
  hub?: string;
  queue?: string;
  lobby?: { code: string; kind: string; isHost: boolean; canStart: boolean; players: number; version: number };
  setup?: { kind: string; phase: string; stepId: string };
  toasts?: number;
}

/** Lines that mean the match is broken (Lua errors, protocol drops, crashes). */
export const FATAL_LINE =
  /\[lua:error\]|CRASH|frame hook failed|mailbox failed|dropped (in|out) |session failed|pack failed|pageerror/;

export interface OpenOptions {
  /** Path + query (default `/balatro`). */
  path?: string;
  /** Test overrides read by lib/balatro/mp/index.ts (`window.__rmhBalatroTest`). */
  overrides?: Record<string, unknown>;
  /** Open MP from the menu (default true). A `?lobby=` path opens it by itself. */
  open?: boolean;
  /** An existing page (reload scenarios). */
  page?: Page;
  /** With `page`: it is already loaded (or reloading); do not navigate. */
  skipGoto?: boolean;
}

export async function openMpPlayer(
  player: Player,
  baseUrl: string,
  opts: OpenOptions = {},
): Promise<MpPlayer> {
  const { context, account } = player;
  if (opts.overrides) {
    await context.addInitScript((o) => {
      (window as unknown as { __rmhBalatroTest?: unknown }).__rmhBalatroTest = o;
    }, opts.overrides);
  }
  const page = opts.page ?? (await context.newPage());
  const errors: string[] = [];
  const logs: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const text = m.text();
    if (logs.length > 4000) logs.splice(0, 1000);
    logs.push(text.slice(0, 600));
    if (FATAL_LINE.test(text)) errors.push(text.slice(0, 1500));
  });
  const debug = (m: string) => {
    if (process.env.BALATRO_E2E_DEBUG) process.stdout.write(`[${account.label}] ${m}\n`);
  };
  if (!opts.skipGoto) await page.goto(`${baseUrl}${opts.path ?? '/balatro'}`, { timeout: MP_BOOT_TIMEOUT_MS });
  debug('page loaded');

  const cmd = async <T>(c: string, args: unknown[] | Record<string, unknown> = [], timeoutMs = 120_000): Promise<T> =>
    page.evaluate(
      ([c2, a, t]) =>
        (window as unknown as { __balatroMp: { cmd(c: string, a: unknown, t: number): Promise<unknown> } }).__balatroMp.cmd(
          c2 as string,
          a,
          t as number,
        ),
      [c, args, timeoutMs] as const,
    ) as Promise<T>;

  if (opts.open !== false) {
    await page.waitForFunction(() => typeof (window as unknown as { __rmhBalatroOpenMp?: unknown }).__rmhBalatroOpenMp === 'function', undefined, {
      timeout: MP_BOOT_TIMEOUT_MS,
      polling: 500,
    });
    debug('engine running; opening MP');
    await page.evaluate(() => (window as unknown as { __rmhBalatroOpenMp(i: string): void }).__rmhBalatroOpenMp('menu'));
  }
  await page.waitForFunction(() => !!(window as unknown as { __balatroMp?: unknown }).__balatroMp, undefined, {
    timeout: MP_BOOT_TIMEOUT_MS,
    polling: 500,
  });
  // The driver is written when the hooks install; the Lua side picks it up on the MP
  // pack's init. Wait until a round trip answers.
  await waitFor(
    `${account.label}: autopilot answers`,
    async () => {
      await cmd('state', [], 5000);
      return true;
    },
    MP_BOOT_TIMEOUT_MS,
    1000,
  );
  debug('autopilot answers');
  await cmd('speed', [4]).catch(() => {});
  // The page opened the session from JS, which mounts the pack without MP.open: open
  // the menu as the MULTIPLAYER button would, so the UI test surface (MP.test.ui) exists.
  if (opts.open !== false) await cmd('mp_open', { intent: 'menu' });

  const snap = () =>
    page.evaluate(() => (window as unknown as { __balatroMp: { state(): unknown } }).__balatroMp.state()) as Promise<MpSnap>;
  const mp = <T>(fn: string, args: Record<string, unknown> = {}, timeoutMs?: number) =>
    cmd<T>('mp', { fn, args }, timeoutMs);
  const uiState = () => mp<UiState>('ui_state');
  const poll = async <S>(read: () => Promise<S>, pred: (s: S) => boolean, what: string, timeoutMs: number) => {
    let last: S | undefined;
    await waitFor(
      `${account.label}: ${what}`,
      async () => {
        last = await read();
        return pred(last);
      },
      timeoutMs,
      500,
    ).catch((e: Error) => {
      throw new Error(`${e.message}\nlast: ${JSON.stringify(last)?.slice(0, 2000)}\nerrors: ${errors.join('\n')}`);
    });
    return last as S;
  };

  return {
    label: account.label,
    page,
    context,
    errors,
    logs,
    cmd,
    mp,
    ui: (op, args = {}) => mp<UiState>('ui', { op, ...args }),
    uiState,
    snap,
    waitSnap: (pred, what = 'session state', timeoutMs = 120_000) => poll(snap, pred, what, timeoutMs),
    waitUi: (pred, what = 'ui state', timeoutMs = 120_000) => poll(uiState, pred, what, timeoutMs),
    luaErrors: () => errors.filter((e) => !/favicon|AudioContext|audio/i.test(e)),
    close: () => page.close(),
  };
}
