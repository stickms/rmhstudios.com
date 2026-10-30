/**
 * Boots Balatro on love.js — LÖVE 11 compiled to WebAssembly by Emscripten
 * (`public/balatro/engine/`, vendored by `scripts/balatro/vendor-lovejs.sh`).
 *
 * The pipeline, end to end (docs/balatro-wasm.md):
 *   1. Two content-addressed game packs (scripts/balatro/build-game-pack.py), served
 *      to signed-in players only by /api/balatro/pack/$file: `core` (code,
 *      textures, fonts, ~5 MB) and `audio` (~17 MB). Both are kept in IndexedDB
 *      after the first visit, so later visits start without a download.
 *   2. The core pack is extracted into Emscripten's in-memory filesystem at
 *      /Balatro with the platform layer (`lua/rmh_web.lua` and its LuaJIT ports
 *      under rmh/), and `require "rmh_web";` is prefixed onto main.lua's first
 *      line. LÖVE starts with /Balatro as the game; the directory name is the save
 *      identity, so saves land in /home/web_user/love/Balatro — the same layout as
 *      %AppData%\Balatro.
 *   3. The audio pack is written into /Balatro/resources/sounds whenever it
 *      arrives; the shim starts Balatro's sound thread then (it holds the music
 *      state until it can play it), so the game is playable on the core alone.
 *   4. Saves: love.js mounts /home/web_user/love on IDBFS (IndexedDB) but only
 *      flushes on `beforeunload`, which mobile browsers and crashes skip. This
 *      module flushes whenever the game writes (the shim drops /rmh/dirty), when
 *      the tab is hidden, and every 30 s — and backs the directory up to the
 *      account (cloud-saves.ts), restoring the account copy before the game's
 *      first line runs when it is the newer one.
 */
import pack from './game-pack.json';
import bitSource from './lua/bit.lua?raw';
import randomSource from './lua/luajit_random.lua?raw';
import shimSource from './lua/rmh_web.lua?raw';
import u32Source from './lua/u32.lua?raw';
import { chooseSnapshot, isSavePath, type CloudSaves, type SaveFile } from './cloud-saves';
import { extractEntry, readZip, writeZip } from './zip';

export const ENGINE_BASE = '/balatro/engine/';
export const PACK_BASE = '/api/balatro/pack/';
export const GAME_DIR = '/Balatro';
export const SAVE_ROOT = '/home/web_user/love';
export const SAVE_DIR = `${SAVE_ROOT}/Balatro`;

/** Rendering above this many pixels costs frame time and looks no sharper. */
const MAX_PIXELS = 2560 * 1440;

/** What Emscripten's FS looks like from here (exported by the vendor patch). */
interface EmscriptenFS {
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array | string): void;
  readFile(path: string): Uint8Array;
  readdir(path: string): string[];
  unlink(path: string): void;
  rmdir(path: string): void;
  stat(path: string): { mode: number; mtime: Date };
  utime(path: string, atime: number, mtime: number): void;
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

export interface PackInfo {
  file: string;
  bytes: number;
  sha256: string;
}

export const GAME_VERSION: string = pack.version;

/** main.lua with the platform layer required first, on the same line. */
export function patchMain(source: string): string {
  return `require "rmh_web"; ${source}`;
}

/** The frame's size in device pixels, clamped to MAX_PIXELS (aspect kept). */
export function renderSize(cssW: number, cssH: number, dpr: number): [number, number] {
  let w = Math.max(1, cssW * Math.min(dpr || 1, 2));
  let h = Math.max(1, cssH * Math.min(dpr || 1, 2));
  const over = (w * h) / MAX_PIXELS;
  if (over > 1) {
    const k = Math.sqrt(over);
    w /= k;
    h /= k;
  }
  return [Math.round(w), Math.round(h)];
}

// ── Packs: IndexedDB cache, then the network ──────────────────────────────────

const CACHE_DB = 'rmh-balatro';
const CACHE_STORE = 'packs';

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 held a player-supplied copy of the game; superseded by the packs.
      if (db.objectStoreNames.contains('source')) db.deleteObjectStore('source');
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key: string): Promise<Uint8Array | null> {
  try {
    const db = await openCache();
    try {
      return await new Promise((resolve) => {
        const req = db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(key);
        req.onsuccess = () => resolve(req.result instanceof Uint8Array ? req.result : null);
        req.onerror = () => resolve(null);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Stores one pack and drops any other version of the same kind. */
async function cachePut(kind: string, key: string, bytes: Uint8Array): Promise<void> {
  try {
    void navigator.storage?.persist?.();
    const db = await openCache();
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          for (const k of keys.result) if (String(k).startsWith(`${kind}-`) && k !== key) store.delete(k);
          store.put(bytes, key);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } finally {
      db.close();
    }
  } catch {
    /* private mode or quota: the HTTP cache still has it */
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class PackError extends Error {
  constructor(public readonly status: number) {
    super(`pack-${status}`);
  }
}

/** One pack's bytes: from IndexedDB if present, else downloaded and verified. */
export async function loadPack(
  kind: 'core' | 'audio',
  info: PackInfo,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const cached = await cacheGet(info.file);
  if (cached && cached.length === info.bytes) {
    onProgress?.(1);
    return cached;
  }
  const res = await fetch(`${PACK_BASE}${info.file}`, { credentials: 'same-origin' });
  if (!res.ok || !res.body) throw new PackError(res.status);
  const out = new Uint8Array(info.bytes);
  const reader = res.body.getReader();
  let at = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.length > out.length) throw new PackError(0);
    out.set(value, at);
    at += value.length;
    onProgress?.(at / info.bytes);
  }
  if (at !== info.bytes || (await sha256Hex(out)) !== info.sha256) throw new PackError(0);
  void cachePut(kind, info.file, out);
  return out;
}

async function unpack(bytes: Uint8Array, onProgress?: (fraction: number) => void) {
  const archive = readZip(bytes);
  const entries = archive.entries.filter((e) => !e.name.endsWith('/'));
  const files: { name: string; data: Uint8Array }[] = [];
  // Inflate in parallel batches; DecompressionStream runs off the main thread.
  for (let i = 0; i < entries.length; i += 32) {
    const batch = entries.slice(i, i + 32);
    const datas = await Promise.all(batch.map((e) => extractEntry(archive, e)));
    batch.forEach((e, j) => files.push({ name: e.name, data: datas[j] }));
    onProgress?.(Math.min(1, (i + batch.length) / entries.length));
  }
  return files;
}

// ── Engine ─────────────────────────────────────────────────────────────────────

let engineScript: Promise<void> | null = null;

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

/** Starts fetching love.wasm (the large part) before the engine script asks. */
export function prefetchEngine(): void {
  if (document.querySelector('link[data-balatro-engine]')) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'fetch';
  link.href = `${ENGINE_BASE}love.wasm`;
  link.crossOrigin = 'anonymous';
  link.dataset.balatroEngine = '';
  document.head.appendChild(link);
}

// Every AudioContext the engine opens (SDL's and OpenAL's), so a paused or left
// game goes silent. Installed once, before the engine script runs.
const audioContexts = new Set<AudioContext>();
let audioTracked = false;

function trackAudioContexts() {
  if (audioTracked || typeof window.AudioContext === 'undefined') return;
  audioTracked = true;
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(options?: AudioContextOptions) {
      super(options);
      audioContexts.add(this);
    }
  };
}

export type BootPhase = 'download' | 'unpack' | 'start' | 'running';

export interface BootOptions {
  canvas: HTMLCanvasElement;
  /** The element whose size the game follows (the canvas's frame). */
  frame: HTMLElement;
  /** Account backup of the save directory; null when signed out. */
  cloud: CloudSaves | null;
  onPhase?: (phase: BootPhase, progress?: number) => void;
  onLog?: (line: string, isError: boolean) => void;
  /** The audio pack failed to load (the game keeps running, silent). */
  onAudioError?: (err: unknown) => void;
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
  if (!fs.analyzePath(dir).exists) return [];
  const out: { name: string; path: string }[] = [];
  for (const entry of fs.readdir(dir)) {
    if (entry === '.' || entry === '..') continue;
    const path = `${dir}/${entry}`;
    if (fs.isDir(fs.stat(path).mode)) out.push(...listFiles(fs, path, `${prefix}${entry}/`));
    else out.push({ name: `${prefix}${entry}`, path });
  }
  return out;
}

function readSaveFiles(fs: EmscriptenFS): SaveFile[] {
  return listFiles(fs, SAVE_DIR)
    .filter((f) => isSavePath(f.name))
    .map((f) => ({ path: f.name, data: fs.readFile(f.path), mtime: fs.stat(f.path).mtime.getTime() }));
}

function replaceSaveFiles(fs: EmscriptenFS, files: SaveFile[]) {
  for (const f of listFiles(fs, SAVE_DIR)) if (isSavePath(f.name)) fs.unlink(f.path);
  for (const file of files) {
    const path = `${SAVE_DIR}/${file.path}`;
    mkdirp(fs, path.slice(0, path.lastIndexOf('/')));
    fs.writeFile(path, file.data);
    fs.utime(path, file.mtime, file.mtime);
  }
}

/** A save path from an imported zip, made relative to the save directory. */
export function saveImportPath(name: string): string | null {
  const parts = name.replace(/\\/g, '/').split('/').filter(Boolean);
  // Accept a zip of the Balatro folder itself or of its contents.
  const at = parts.findIndex((p) => p.toLowerCase() === 'balatro');
  const rel = (at >= 0 ? parts.slice(at + 1) : parts).join('/');
  return rel && isSavePath(rel) ? rel : null;
}

export async function bootBalatro(options: BootOptions): Promise<BalatroSession> {
  const { canvas, frame, cloud, onPhase, onLog, onAudioError } = options;
  trackAudioContexts();

  // Everything the boot waits on starts at once.
  onPhase?.('download', 0);
  const engine = loadEngineScript();
  const cloudCopy = cloud ? cloud.read() : Promise.resolve(null);
  const corePack = loadPack('core', pack.core, (f) => onPhase?.('download', f));
  // The audio follows in the background; nothing waits on it.
  const audioFiles = loadPack('audio', pack.audio).then((bytes) => unpack(bytes));

  const coreBytes = await corePack;
  onPhase?.('unpack', 0);
  const files = await unpack(coreBytes, (f) => onPhase?.('unpack', f));
  const enc = new TextEncoder();
  const main = files.find((f) => f.name === 'main.lua');
  if (!main) throw new Error('core-pack-missing-main');
  main.data = enc.encode(patchMain(new TextDecoder().decode(main.data)));
  files.push(
    { name: 'rmh_web.lua', data: enc.encode(shimSource) },
    { name: 'rmh/u32.lua', data: enc.encode(u32Source) },
    { name: 'rmh/bit.lua', data: enc.encode(bitSource) },
    { name: 'rmh/luajit_random.lua', data: enc.encode(randomSource) },
  );
  const cloudFiles = await cloudCopy;
  await engine;

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
    const [w, h] = renderSize(frame.clientWidth, frame.clientHeight, window.devicePixelRatio);
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
        // IDBFS has populated the save directory by now (love.js holds the run
        // on it); the game itself has not started.
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
        if (cloudFiles && chooseSnapshot(readSaveFiles(fs), cloudFiles) === 'cloud') {
          replaceSaveFiles(fs, cloudFiles);
          void flushSaves();
        }
      },
    ],
  };

  await window.Love!(module);
  onPhase?.('running');

  const m = module as LoveModule;
  let stopped = false;

  void audioFiles.then(
    (sounds) => {
      if (stopped || !fs) return;
      for (const file of sounds) {
        const path = `${GAME_DIR}/${file.name}`;
        mkdirp(fs, path.slice(0, path.lastIndexOf('/')));
        fs.writeFile(path, file.data);
      }
      fs.writeFile('/rmh/audio-ready', '1');
    },
    (err) => onAudioError?.(err),
  );

  const observer = new ResizeObserver(writeSize);
  observer.observe(frame);

  const saveFiles = () => (fs ? readSaveFiles(fs) : []);
  // The shim marks writes; flush them promptly, and anyway every 30 s.
  const poll = window.setInterval(() => {
    if (!fs || !fs.analyzePath('/rmh/dirty').exists) return;
    fs.unlink('/rmh/dirty');
    void flushSaves();
    cloud?.schedule(saveFiles);
  }, 500);
  const slow = window.setInterval(() => void flushSaves(), 30_000);
  const onHide = () => {
    if (document.visibilityState !== 'hidden') return;
    void flushSaves();
    cloud?.flush(saveFiles);
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  return {
    flushSaves,
    async exportSaves() {
      await flushSaves();
      return writeZip(saveFiles().map((f) => ({ name: `Balatro/${f.path}`, data: f.data })));
    },
    async importSaves(zipBytes) {
      if (!fs) return 0;
      const archive = readZip(zipBytes);
      const incoming: SaveFile[] = [];
      const now = Date.now();
      for (const entry of archive.entries) {
        const rel = saveImportPath(entry.name);
        if (rel) incoming.push({ path: rel, data: await extractEntry(archive, entry), mtime: now });
      }
      if (!incoming.length) return 0;
      replaceSaveFiles(fs, incoming);
      await flushSaves();
      cloud?.flush(saveFiles);
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
      cloud?.flush(saveFiles);
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
