/**
 * The engine-spec harness page (PLAN §4 WS14, §6.1 "Lua L2 in-engine").
 *
 * Boots the real game exactly as /balatro does — lib/balatro/runtime.ts, the
 * core pack from data/balatro-pack, love.wasm from public/balatro/engine — with
 * no account, hub or database (cloud saves off). On top it:
 *   1. captures the Emscripten module through a `window.Love` accessor, and adds
 *      one preRun step after the runtime's own: the test driver and the specs
 *      (lib/balatro/lua/mp_test/**) go to /Balatro/rmh_mp_test, the marker
 *      /rmh/test/enabled is written, and main.lua gets
 *      `require "rmh_mp_test.harness"` appended (after its last line, so no line
 *      number moves);
 *   2. optionally (`?mp=1`, once the manifest has an `mp` pack) extracts the MP
 *      pack into /Balatro before the game starts;
 *   3. runs the page side of the file channel (testing/balatro-e2e/lib/channel.ts)
 *      and exposes it as `window.__balatroEngine` for Playwright;
 *   4. answers a spec's request for an optional pack (EX-14: Lua writes the kind to
 *      /rmh/test/want_pack) through the production chain the session runtime uses
 *      (createOptionalPacks → loadPack → unpackPack → mountOptionalFiles), so the
 *      Release ruleset's art is fetched and mounted exactly as in a lobby.
 * Built by testing/balatro-e2e/lib/build-harness.ts, served by static-server.ts.
 */
import pack from '../../../../lib/balatro/game-pack.json';
import {
  bootBalatro,
  loadPack,
  mountOptionalFiles,
  optionalPackInfo,
  optionalPackMarker,
  unpackPack,
} from '../../../../lib/balatro/runtime';
import { createOptionalPacks } from '../../../../lib/balatro/mp/optional-packs';
import { attachTextInput, TEXT_FILE } from '../../../../lib/balatro/text-input';
import { extractEntry, readZip } from '../../../../lib/balatro/zip';
import luaFiles from 'virtual:balatro-mp-test-lua';
import {
  CHANNEL,
  encodeCommand,
  parseMessages,
  type HarnessMessage,
  type SpecResult,
} from '../../lib/channel';

interface Fs {
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array | string): void;
  readFile(path: string, opts?: { encoding: 'utf8' }): Uint8Array | string;
  unlink(path: string): void;
  analyzePath(path: string): { exists: boolean };
}
interface LoveModuleLike {
  FS?: Fs;
  preRun?: Array<() => void>;
}
type LoveFn = (m: LoveModuleLike) => Promise<unknown>;

type Status = 'booting' | 'ready' | 'crashed' | 'failed';
interface Pending {
  resolve: (v: { ok: boolean; data: unknown }) => void;
}

const params = new URLSearchParams(location.search);
const state = {
  status: 'booting' as Status,
  version: '',
  error: '',
  logs: [] as string[],
  specs: [] as SpecResult[],
  badLines: [] as string[],
  phases: [] as string[],
};
const pending = new Map<string, Pending>();
let fs: Fs | null = null;
let seq = 0;

/** Lines not yet handed to the test runner (drain()). */
let fresh: string[] = [];
const log = (line: string) => {
  state.logs.push(line);
  if (fresh.length < 5000) fresh.push(line);
  if (state.logs.length > 5000) state.logs.splice(0, 1000);
};

function mkdirp(target: Fs, dir: string) {
  let at = '';
  for (const part of dir.split('/').filter(Boolean)) {
    at += `/${part}`;
    if (!target.analyzePath(at).exists) target.mkdir(at);
  }
}

function writeTree(target: Fs, files: Array<{ path: string; data: Uint8Array | string }>) {
  for (const f of files) {
    const full = `/Balatro/${f.path}`;
    mkdirp(target, full.slice(0, full.lastIndexOf('/')));
    target.writeFile(full, f.data);
  }
}

let mpFiles: Array<{ path: string; data: Uint8Array }> = [];

async function loadMpPack(): Promise<void> {
  const info = (pack as Record<string, unknown>).mp as { file?: string } | undefined;
  if (params.get('mp') !== '1') return;
  if (!info?.file) throw new Error('mp=1 but lib/balatro/game-pack.json has no mp pack yet');
  const res = await fetch(`/api/balatro/pack/${info.file}`);
  if (!res.ok) throw new Error(`mp pack HTTP ${res.status}`);
  const zip = readZip(new Uint8Array(await res.arrayBuffer()));
  for (const entry of zip.entries) {
    if (entry.name.endsWith('/')) continue;
    const rel = entry.name.startsWith('rmh_mp/') ? entry.name : `rmh_mp/${entry.name}`;
    mpFiles.push({ path: rel, data: await extractEntry(zip, entry) });
  }
  log(`mp pack: ${mpFiles.length} files`);
}

let installStep = 'start';
function install(target: Fs) {
  fs = target;
  installStep = 'lua files';
  writeTree(
    target,
    luaFiles.map((f) => ({ path: f.path, data: f.text })),
  );
  if (mpFiles.length) writeTree(target, mpFiles);
  mpFiles = [];
  installStep = 'main.lua';
  const main = target.readFile('/Balatro/main.lua', { encoding: 'utf8' }) as string;
  target.writeFile('/Balatro/main.lua', `${main}\nrequire "rmh_mp_test.harness"\n`);
  installStep = 'channel';
  mkdirp(target, CHANNEL.DIR);
  target.writeFile(CHANNEL.MARKER, '1');
}

// The runtime calls window.Love(module); wrap it to add the harness's preRun step.
let realLove: LoveFn | undefined;
Object.defineProperty(window, 'Love', {
  configurable: true,
  get() {
    return (
      realLove &&
      ((m: LoveModuleLike) => {
        m.preRun = m.preRun ?? [];
        // Emscripten runs Module.preRun in REVERSE array order (each entry is
        // unshifted onto its queue), so the first entry runs last: after the
        // runtime's own step has written the pack into /Balatro.
        m.preRun.unshift(() => {
          if (!m.FS) throw new Error('harness: engine has no FS export');
          try {
            install(m.FS);
          } catch (e) {
            const err = e as { errno?: number; code?: string; message?: string };
            throw new Error(
              `harness install failed at ${installStep}: ${err.code ?? err.errno ?? ''} ${err.message ?? String(e)}`,
              { cause: e },
            );
          }
        });
        return realLove!(m);
      })
    );
  },
  set(v: LoveFn) {
    realLove = v;
  },
});

function handle(msg: HarnessMessage) {
  switch (msg.t) {
    case 'ready':
      state.status = 'ready';
      state.version = msg.version;
      break;
    case 'spec':
      state.specs.push(msg.r);
      log(
        `${msg.r.skip ? 'skip' : msg.r.ok ? 'ok  ' : 'FAIL'} ${msg.r.name}${msg.r.msg ? `: ${msg.r.msg}` : ''}`,
      );
      break;
    case 'crash':
      state.status = 'crashed';
      state.error = msg.msg;
      log(`CRASH ${msg.msg}`);
      for (const p of pending.values())
        p.resolve({ ok: false, data: { error: `engine crashed: ${msg.msg}` } });
      pending.clear();
      break;
    case 'res': {
      const p = msg.id ? pending.get(msg.id) : undefined;
      if (msg.id) pending.delete(msg.id);
      if (p) p.resolve({ ok: msg.ok, data: msg.data });
      else log(`unmatched result ${JSON.stringify(msg)}`);
      break;
    }
  }
}

const WANT_PACK = '/rmh/test/want_pack';
const optionalPacks = createOptionalPacks({
  mounted: (kind) => !!fs?.analyzePath(optionalPackMarker(kind)).exists,
  fetch: async (kind) => {
    const info = optionalPackInfo(kind);
    if (!info) throw new Error(`lib/balatro/game-pack.json has no ${kind} pack`);
    return unpackPack(await loadPack(kind, info));
  },
  mount: (kind, files) => {
    if (fs) mountOptionalFiles(fs, kind, files, optionalPackInfo(kind)?.sha256.slice(0, 12) ?? 'dev');
  },
  log: (m, isError) => log(`${isError ? 'ERR ' : ''}${m}`),
});

function pollPackRequest() {
  if (!fs || !fs.analyzePath(WANT_PACK).exists) return;
  const kind = String(fs.readFile(WANT_PACK, { encoding: 'utf8' })).trim();
  fs.unlink(WANT_PACK);
  if (kind !== 'release') return log(`ERR unknown optional pack ${kind}`);
  void optionalPacks.ensure(kind).then((ok) => {
    if (!ok && fs) fs.writeFile('/rmh/test/pack_error', kind);
  });
}

function poll() {
  pollPackRequest();
  if (!fs || !fs.analyzePath(CHANNEL.RES).exists) return;
  const text = fs.readFile(CHANNEL.RES, { encoding: 'utf8' }) as string;
  fs.unlink(CHANNEL.RES);
  const { messages, bad } = parseMessages(text);
  for (const line of bad) {
    state.badLines.push(line);
    log(`bad line ${line.slice(0, 200)}`);
  }
  for (const m of messages) handle(m);
}

function call(
  cmd: string,
  args: unknown[] | Record<string, unknown> = [],
): Promise<{ ok: boolean; data: unknown }> {
  if (!fs) return Promise.resolve({ ok: false, data: { error: 'engine not started' } });
  if (state.status === 'crashed')
    return Promise.resolve({ ok: false, data: { error: 'engine crashed' } });
  const id = `c${++seq}`;
  const line = encodeCommand(id, cmd, args);
  const prior = fs.analyzePath(CHANNEL.CMD).exists
    ? (fs.readFile(CHANNEL.CMD, { encoding: 'utf8' }) as string)
    : '';
  fs.writeFile(CHANNEL.CMD, prior + line);
  return new Promise((resolve) => pending.set(id, { resolve }));
}

const drain = () => {
  const out = fresh;
  fresh = [];
  return out;
};
/** What Lua published for the phone keyboard (lib/balatro/text-input.ts). */
const text = () =>
  fs && fs.analyzePath(TEXT_FILE).exists ? (fs.readFile(TEXT_FILE, { encoding: 'utf8' }) as string) : null;
const api = { state, call, drain, text };
(window as unknown as { __balatroEngine: typeof api }).__balatroEngine = api;

window.setInterval(poll, 25);

const t0 = performance.now();
void (async () => {
  try {
    await loadMpPack();
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const frame = document.getElementById('frame')!;
    attachTextInput({ frame, canvas, read: text });
    await bootBalatro({
      canvas,
      frame,
      cloud: null,
      onPhase: (p) => {
        if (p === 'start' || p === 'running')
          state.phases.push(`${p}@${Math.round(performance.now() - t0)}ms`);
      },
      onLog: (line, isError) => log(`${isError ? 'ERR ' : ''}${line}`),
      onAudioError: (e) => log(`audio pack unavailable: ${String(e)}`),
    });
  } catch (e) {
    state.status = 'failed';
    state.error = e instanceof Error ? e.message : String(e);
    log(`FATAL ${state.error}`);
  }
})();
