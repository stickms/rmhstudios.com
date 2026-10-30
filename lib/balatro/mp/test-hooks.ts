/**
 * The multiplayer test surface — TEST BUILDS ONLY (PLAN §3.e, §4 WS14).
 *
 * `window.__balatroMp` lets Playwright drive a real /balatro page: it sends
 * autopilot commands to Lua (`test_cmd` → `test_res` over the mailbox,
 * bridge-protocol.ts) and exposes whatever session state the session runtime
 * hands it. It exists only when the build sets `VITE_BALATRO_MP_TEST=1`, and the
 * caller must import this module behind that same check so production builds
 * drop it entirely:
 *
 *   if (import.meta.env.VITE_BALATRO_MP_TEST === '1') {
 *     void import('./test-hooks').then((m) => m.installTestHooks({ bridge, fs, state }));
 *   }
 *
 * scripts/balatro/bundle-budget.ts fails the build when the string `__balatroMp`
 * reaches a non-test bundle.
 *
 * Installing also writes the Lua driver (lib/balatro/lua/mp_test/{autopilot,sched,json}.lua)
 * to /Balatro/rmh_mp_test/ and the marker /rmh/test/enabled; the MP pack's
 * bootstrap requires `rmh_mp_test.autopilot` and calls `install()` only when that
 * marker exists, and the autopilot refuses to install without it.
 */
import jsonLua from '../lua/mp_test/json.lua?raw';
import autopilotLua from '../lua/mp_test/autopilot.lua?raw';
import schedLua from '../lua/mp_test/sched.lua?raw';

export const TEST_MARKER = '/rmh/test/enabled';
export const DRIVER_DIR = '/Balatro/rmh_mp_test';
export const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

/** The slice of the mailbox (bridge.ts) the test surface needs. */
export interface TestBridge {
  send(type: 'test_cmd', data: { id: string; cmd: string; args: unknown[] }): void;
  on(
    type: 'test_res',
    handler: (data: { id: string; ok: boolean; data?: unknown }) => void,
  ): void | (() => void);
}

/** The slice of Emscripten's FS the test surface needs. */
export interface TestFs {
  mkdir(path: string): void;
  writeFile(path: string, data: string | Uint8Array): void;
  analyzePath(path: string): { exists: boolean };
}

export interface BalatroMpTestApi {
  /** Runs an autopilot command in Lua; rejects with the Lua error text. */
  cmd<T = unknown>(
    cmd: string,
    args?: unknown[] | Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T>;
  /** Session state supplied by the session runtime (WS5), read lazily. */
  state(): unknown;
  /** Commands still waiting for their test_res. */
  pending(): number;
  uninstall(): void;
}

declare global {
  interface Window {
    __balatroMp?: BalatroMpTestApi;
  }
}

/** True only in a build made with VITE_BALATRO_MP_TEST=1. */
export function testHooksEnabled(flag: unknown = import.meta.env.VITE_BALATRO_MP_TEST): boolean {
  return flag === '1';
}

export const DRIVER_FILES: ReadonlyArray<{ path: string; source: string }> = [
  { path: `${DRIVER_DIR}/json.lua`, source: jsonLua },
  { path: `${DRIVER_DIR}/sched.lua`, source: schedLua },
  { path: `${DRIVER_DIR}/autopilot.lua`, source: autopilotLua },
];

function mkdirp(fs: TestFs, dir: string) {
  let at = '';
  for (const part of dir.split('/').filter(Boolean)) {
    at += `/${part}`;
    if (!fs.analyzePath(at).exists) fs.mkdir(at);
  }
}

/** Writes the Lua driver and the marker into the game's filesystem. */
export function writeDriver(fs: TestFs): void {
  mkdirp(fs, DRIVER_DIR);
  for (const f of DRIVER_FILES) fs.writeFile(f.path, f.source);
  mkdirp(fs, TEST_MARKER.slice(0, TEST_MARKER.lastIndexOf('/')));
  fs.writeFile(TEST_MARKER, '1');
}

const COMMAND = /^[a-z_]{1,64}$/;

export function installTestHooks(opts: {
  bridge: TestBridge;
  fs: TestFs;
  state?: () => unknown;
  flag?: unknown;
  target?: { __balatroMp?: BalatroMpTestApi };
}): BalatroMpTestApi | null {
  if (!testHooksEnabled(opts.flag ?? import.meta.env.VITE_BALATRO_MP_TEST)) return null;
  const target = opts.target ?? (typeof window !== 'undefined' ? window : undefined);
  writeDriver(opts.fs);

  let seq = 0;
  const waiting = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const off = opts.bridge.on('test_res', (res) => {
    const w = waiting.get(res.id);
    if (!w) return;
    waiting.delete(res.id);
    clearTimeout(w.timer);
    if (res.ok) w.resolve(res.data);
    else {
      const err =
        res.data && typeof res.data === 'object' && 'error' in res.data
          ? String((res.data as { error: unknown }).error)
          : 'failed';
      w.reject(new Error(err));
    }
  });

  const api: BalatroMpTestApi = {
    cmd<T>(
      cmd: string,
      args: unknown[] | Record<string, unknown> = [],
      timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    ) {
      if (!COMMAND.test(cmd)) return Promise.reject(new Error(`bad command name: ${cmd}`));
      const id = `t${++seq}`;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new Error(`test command ${cmd} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        waiting.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        // The wire carries args as an array (bridge-protocol.ts); an object travels as its only element.
        opts.bridge.send('test_cmd', { id, cmd, args: Array.isArray(args) ? args : [args] });
      });
    },
    state: () => opts.state?.() ?? null,
    pending: () => waiting.size,
    uninstall() {
      if (typeof off === 'function') off();
      for (const w of waiting.values()) {
        clearTimeout(w.timer);
        w.reject(new Error('test hooks uninstalled'));
      }
      waiting.clear();
      if (target && target.__balatroMp === api) delete target.__balatroMp;
    },
  };
  if (target) target.__balatroMp = api;
  return api;
}
