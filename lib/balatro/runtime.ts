/**
 * Boots a player's own copy of Balatro on love.js — LÖVE 11 compiled to
 * WebAssembly by Emscripten (`public/balatro/engine/`, vendored by
 * `scripts/balatro/vendor-lovejs.sh`).
 *
 * The pipeline, end to end:
 *   1. The player picks Balatro.exe (a fused LÖVE executable: the engine with the
 *      game's zip appended), Balatro.love, or a zip of the game folder.
 *      `readGameSource` finds the zip inside it — nothing is uploaded.
 *   2. `bootBalatro` extracts every file into Emscripten's in-memory filesystem at
 *      /Balatro, adds the platform layer (`lua/rmh_web.lua` and its LuaJIT ports
 *      under rmh/) and prefixes
 *      `require "rmh_web";` onto main.lua, then starts LÖVE with /Balatro as the
 *      game. The directory name is the save identity, so saves land in
 *      /home/web_user/love/Balatro — the same layout as %AppData%\Balatro.
 *   3. love.js mounts /home/web_user/love on IDBFS (IndexedDB). It only flushes on
 *      `beforeunload`, which mobile browsers and crashes skip, so this module also
 *      flushes whenever the game writes (the shim drops /rmh/dirty), when the tab
 *      is hidden, and on a slow interval.
 */
import bitSource from './lua/bit.lua?raw';
import randomSource from './lua/luajit_random.lua?raw';
import shimSource from './lua/rmh_web.lua?raw';
import u32Source from './lua/u32.lua?raw';
import { extractEntry, readZip, writeZip, type ZipArchive } from './zip';

export const ENGINE_BASE = '/balatro/engine/';
export const GAME_DIR = '/Balatro';
export const SAVE_ROOT = '/home/web_user/love';
export const SAVE_DIR = `${SAVE_ROOT}/Balatro`;

/** What Emscripten's FS looks like from here (exported by the vendor patch). */
interface EmscriptenFS {
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array | string): void;
  readFile(path: string): Uint8Array;
  readdir(path: string): string[];
  unlink(path: string): void;
  rmdir(path: string): void;
  stat(path: string): { mode: number };
  isDir(mode: number): boolean;
  analyzePath(path: string): { exists: boolean };
  syncfs(populate: boolean, callback: (err: unknown) => void): void;
}

interface LoveModule {
  arguments: string[];
  INITIAL_MEMORY: number;
  canvas: HTMLCanvasElement;
  locateFile: (path: string) => string;
  print: (text: string) => void;
  printErr: (text: string) => void;
  preRun: Array<() => void>;
  setStatus: (text: string) => void;
  monitorRunDependencies?: (left: number) => void;
  FS?: EmscriptenFS;
  pauseMainLoop?: () => void;
  resumeMainLoop?: () => void;
  addRunDependency: (id: string) => void;
  removeRunDependency: (id: string) => void;
}

declare global {
  interface Window {
    Love?: (module: Partial<LoveModule>) => Promise<unknown>;
  }
}

export class GameSourceError extends Error {
  constructor(public readonly code: 'not-a-zip' | 'not-balatro') {
    super(code);
  }
}

export interface GameSource {
  /** The bare zip (the executable prefix, if any, cut off). */
  zip: Uint8Array;
  /** Balatro's version string from version.jkr, e.g. "1.0.1o-FULL". */
  version: string;
}

/** The files a Balatro source must have. */
const REQUIRED = ['main.lua', 'game.lua', 'globals.lua', 'version.jkr'];

/** Finds and validates the game inside a picked file. */
export async function readGameSource(bytes: Uint8Array): Promise<GameSource> {
  let archive: ZipArchive;
  try {
    archive = readZip(bytes);
  } catch {
    throw new GameSourceError('not-a-zip');
  }
  const names = new Set(archive.entries.map((e) => e.name));
  if (!REQUIRED.every((n) => names.has(n))) throw new GameSourceError('not-balatro');
  const versionEntry = archive.entries.find((e) => e.name === 'version.jkr')!;
  const version = new TextDecoder().decode(await extractEntry(archive, versionEntry)).split(/\r?\n/)[0].trim();
  return { zip: archive.prefix ? bytes.slice(archive.prefix) : bytes, version };
}

/** main.lua with the platform layer required first, on the same line. */
export function patchMain(source: string): string {
  return `require "rmh_web"; ${source}`;
}

// ── IndexedDB cache of the player's own copy (stays in their browser) ─────────

const CACHE_DB = 'rmh-balatro';
const CACHE_STORE = 'source';
const CACHE_KEY = 'game';

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openCache();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(CACHE_STORE, mode).objectStore(CACHE_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadCachedSource(): Promise<GameSource | null> {
  try {
    const value = await cacheRequest<GameSource | undefined>('readonly', (s) => s.get(CACHE_KEY));
    return value && value.zip instanceof Uint8Array ? value : null;
  } catch {
    return null;
  }
}

export async function storeCachedSource(source: GameSource): Promise<void> {
  // Ask the browser not to evict the copy (and, more importantly, the saves).
  void navigator.storage?.persist?.();
  await cacheRequest('readwrite', (s) => s.put(source, CACHE_KEY));
}

export async function clearCachedSource(): Promise<void> {
  await cacheRequest('readwrite', (s) => s.delete(CACHE_KEY));
}

// ── Engine ─────────────────────────────────────────────────────────────────────

let engineScript: Promise<void> | null = null;

/**
 * Starts fetching the engine (love.wasm, the large part) while the player is
 * still on the loader page, so it is in the HTTP cache by the time they press
 * Play or pick their file.
 */
export function prefetchEngine(): void {
  if (document.querySelector('link[data-balatro-engine]')) return;
  for (const [file, as] of [
    ['love.wasm', 'fetch'],
    ['love.js', 'script'],
  ] as const) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = `${ENGINE_BASE}${file}`;
    if (as === 'fetch') link.crossOrigin = 'anonymous';
    link.dataset.balatroEngine = '';
    document.head.appendChild(link);
  }
}

function loadEngineScript(): Promise<void> {
  if (window.Love) return Promise.resolve();
  engineScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${ENGINE_BASE}love.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      engineScript = null;
      reject(new Error('engine-load-failed'));
    };
    document.head.appendChild(script);
  });
  return engineScript;
}

// Every AudioContext the engine opens (SDL's and OpenAL's), so a paused or left
// game goes silent. Installed once, before the engine script runs.
const audioContexts = new Set<AudioContext>();
let audioTracked = false;

function trackAudioContexts() {
  if (audioTracked || typeof window.AudioContext === 'undefined') return;
  audioTracked = true;
  const Native = window.AudioContext;
  const Tracked = class extends Native {
    constructor(options?: AudioContextOptions) {
      super(options);
      audioContexts.add(this);
    }
  };
  window.AudioContext = Tracked;
}

export type BootPhase = 'engine' | 'unpack' | 'start' | 'running';

export interface BootOptions {
  canvas: HTMLCanvasElement;
  /** The element whose size the game follows (the canvas's frame). */
  frame: HTMLElement;
  source: GameSource;
  onPhase?: (phase: BootPhase, progress?: number) => void;
  onLog?: (line: string, isError: boolean) => void;
}

export interface BalatroSession {
  /** Flushes the save directory to IndexedDB now. */
  flushSaves(): Promise<void>;
  /** The save directory as a zip (profiles 1–3, settings.jkr …). */
  exportSaves(): Promise<Uint8Array>;
  /** Replaces the save directory with a zip's .jkr files; reload to take effect. */
  importSaves(zip: Uint8Array): Promise<number>;
  pause(): void;
  resume(): void;
  /** Stops the frame loop and audio for good (the page is being left). */
  stop(): void;
}

function mkdirp(fs: EmscriptenFS, path: string) {
  let at = '';
  for (const part of path.split('/').filter(Boolean)) {
    at += `/${part}`;
    if (!fs.analyzePath(at).exists) fs.mkdir(at);
  }
}

function listFiles(fs: EmscriptenFS, dir: string, prefix = ''): { name: string; path: string }[] {
  const out: { name: string; path: string }[] = [];
  for (const entry of fs.readdir(dir)) {
    if (entry === '.' || entry === '..') continue;
    const path = `${dir}/${entry}`;
    if (fs.isDir(fs.stat(path).mode)) out.push(...listFiles(fs, path, `${prefix}${entry}/`));
    else out.push({ name: `${prefix}${entry}`, path });
  }
  return out;
}

/** A save path from an imported zip, made relative to the save directory. */
export function saveImportPath(name: string): string | null {
  const parts = name.replace(/\\/g, '/').split('/').filter(Boolean);
  // Accept a zip of the Balatro folder itself or of its contents.
  const at = parts.findIndex((p) => p.toLowerCase() === 'balatro');
  const rel = at >= 0 ? parts.slice(at + 1) : parts;
  if (!rel.length || !rel[rel.length - 1].toLowerCase().endsWith('.jkr')) return null;
  if (rel.some((p) => p === '..' || p === '.')) return null;
  // Settings at the root; everything else inside a profile folder 1–3.
  if (rel.length === 1) return rel[0];
  if (rel.length === 2 && /^[123]$/.test(rel[0])) return rel.join('/');
  return null;
}

export async function bootBalatro(options: BootOptions): Promise<BalatroSession> {
  const { canvas, frame, source, onPhase, onLog } = options;
  onPhase?.('engine');
  trackAudioContexts();
  await loadEngineScript();

  onPhase?.('unpack', 0);
  const archive = readZip(source.zip);
  const files: { name: string; data: Uint8Array }[] = [];
  const entries = archive.entries.filter((e) => !e.name.endsWith('/'));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    let data = await extractEntry(archive, entry);
    if (entry.name === 'main.lua') data = new TextEncoder().encode(patchMain(new TextDecoder().decode(data)));
    files.push({ name: entry.name, data });
    if (i % 16 === 0) onPhase?.('unpack', i / entries.length);
  }
  const enc = new TextEncoder();
  files.push(
    { name: 'rmh_web.lua', data: enc.encode(shimSource) },
    { name: 'rmh/u32.lua', data: enc.encode(u32Source) },
    { name: 'rmh/bit.lua', data: enc.encode(bitSource) },
    { name: 'rmh/luajit_random.lua', data: enc.encode(randomSource) },
  );

  onPhase?.('start');
  let fs: EmscriptenFS | null = null;
  let flushing: Promise<void> | null = null;
  let flushAgain = false;

  const flushSaves = (): Promise<void> => {
    if (!fs) return Promise.resolve();
    if (flushing) {
      flushAgain = true;
      return flushing;
    }
    const target = fs;
    flushing = new Promise<void>((resolve) => {
      target.syncfs(false, (err) => {
        if (err) onLog?.(`save sync failed: ${String(err)}`, true);
        resolve();
      });
    }).then(() => {
      flushing = null;
      if (flushAgain) {
        flushAgain = false;
        return flushSaves();
      }
    });
    return flushing;
  };

  const writeSize = () => {
    if (!fs) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(frame.clientWidth * dpr));
    const h = Math.max(1, Math.round(frame.clientHeight * dpr));
    try {
      fs.writeFile('/rmh/size', `${w} ${h}`);
    } catch {
      /* FS not ready */
    }
  };

  const module: Partial<LoveModule> = {
    arguments: [GAME_DIR],
    INITIAL_MEMORY: 256 * 1024 * 1024,
    canvas,
    locateFile: (path) => `${ENGINE_BASE}${path}`,
    print: (text) => onLog?.(text, false),
    printErr: (text) => onLog?.(text, true),
    setStatus: () => {},
    preRun: [
      () => {
        const m = module as LoveModule;
        fs = m.FS ?? null;
        if (!fs) throw new Error('engine-missing-fs-export');
        for (const file of files) {
          const path = `${GAME_DIR}/${file.name}`;
          mkdirp(fs, path.slice(0, path.lastIndexOf('/')));
          fs.writeFile(path, file.data);
        }
        files.length = 0;
        mkdirp(fs, '/rmh');
        writeSize();
      },
    ],
  };

  await window.Love!(module);
  onPhase?.('running');

  const observer = new ResizeObserver(writeSize);
  observer.observe(frame);

  // The shim marks writes; flush them promptly, and anyway every 30 s.
  const poll = window.setInterval(() => {
    if (!fs) return;
    if (fs.analyzePath('/rmh/dirty').exists) {
      fs.unlink('/rmh/dirty');
      void flushSaves();
    }
  }, 500);
  const slow = window.setInterval(() => void flushSaves(), 30_000);
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSaves();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  const m = module as LoveModule;
  let stopped = false;

  return {
    flushSaves,
    async exportSaves() {
      await flushSaves();
      if (!fs || !fs.analyzePath(SAVE_DIR).exists) return writeZip([]);
      const target = fs;
      return writeZip(
        listFiles(target, SAVE_DIR).map((f) => ({ name: `Balatro/${f.name}`, data: target.readFile(f.path) })),
      );
    },
    async importSaves(zipBytes) {
      if (!fs) return 0;
      const target = fs;
      const archive = readZip(zipBytes);
      const incoming: { path: string; data: Uint8Array }[] = [];
      for (const entry of archive.entries) {
        const rel = saveImportPath(entry.name);
        if (rel) incoming.push({ path: rel, data: await extractEntry(archive, entry) });
      }
      if (!incoming.length) return 0;
      if (target.analyzePath(SAVE_DIR).exists) {
        for (const f of listFiles(target, SAVE_DIR)) target.unlink(f.path);
      }
      for (const file of incoming) {
        const path = `${SAVE_DIR}/${file.path}`;
        mkdirp(target, path.slice(0, path.lastIndexOf('/')));
        target.writeFile(path, file.data);
      }
      await flushSaves();
      return incoming.length;
    },
    pause() {
      m.pauseMainLoop?.();
      for (const ctx of audioContexts) void ctx.suspend().catch(() => {});
    },
    resume() {
      if (stopped) return;
      m.resumeMainLoop?.();
      for (const ctx of audioContexts) void ctx.resume().catch(() => {});
    },
    stop() {
      if (stopped) return;
      stopped = true;
      void flushSaves();
      observer.disconnect();
      window.clearInterval(poll);
      window.clearInterval(slow);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      m.pauseMainLoop?.();
      for (const ctx of audioContexts) void ctx.close().catch(() => {});
      audioContexts.clear();
    },
  };
}
