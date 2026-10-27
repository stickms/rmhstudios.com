/**
 * Lazy access to the vendored "TF2 Default" base HUD.
 *
 * Only `manifest.json` is fetched up front; each file is fetched the first time
 * something needs it (a panel the preview draws, a file the author opens, a
 * diff). Concurrent requests for the same file share one fetch.
 */

import { decodeUtf8 } from '../util/sha1';
import type { BaseIndex } from './types';

export interface BaseLoader {
  manifest(): Promise<unknown>;
  file(path: string): Promise<Uint8Array>;
}

export const BASE_URL = '/tf2-hud/base';
/** Base files synced from the game itself (`scripts/tf2-assets`); absent until a sync has run. */
export const LIVE_BASE_URL = '/api/tf2-hud/base';

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

// The manifest and the files must come from the same copy, so whichever one
// answers for the manifest also serves every file.
let root: Promise<string> | undefined;
function baseRoot(): Promise<string> {
  root ??= fetch(`${LIVE_BASE_URL}/manifest.json`)
    .then((res) => (res.ok ? LIVE_BASE_URL : BASE_URL))
    .catch(() => BASE_URL);
  return root;
}

export const browserLoader: BaseLoader = {
  async manifest() {
    const res = await fetch(`${await baseRoot()}/manifest.json`);
    if (!res.ok) throw new Error(`Base manifest failed (${res.status})`);
    return res.json();
  },
  async file(path) {
    const res = await fetch(`${await baseRoot()}/${encodePath(path)}`);
    if (!res.ok) throw new Error(`Base file ${path} failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  },
};

export function parseManifest(raw: unknown): BaseIndex {
  const m = raw as {
    version?: number;
    source?: BaseIndex['source'];
    files?: [string, number, string][];
  };
  if (!m || !Array.isArray(m.files) || !m.source) throw new Error('Malformed base manifest');
  return {
    version: m.version ?? 2,
    source: m.source,
    files: new Map(m.files.map(([path, size, sha1]) => [path, { size, sha1 }])),
  };
}

const CONCURRENCY = 8;

export class BaseCache {
  index: BaseIndex | undefined;
  private bytes = new Map<string, Uint8Array>();
  private texts = new Map<string, string>();
  private inflight = new Map<string, Promise<void>>();
  private indexPromise: Promise<BaseIndex> | undefined;

  constructor(private readonly loader: BaseLoader = browserLoader) {}

  loadIndex(): Promise<BaseIndex> {
    this.indexPromise ??= this.loader.manifest().then((raw) => {
      this.index = parseManifest(raw);
      return this.index;
    });
    return this.indexPromise;
  }

  has(path: string): boolean {
    return this.index?.files.has(path) ?? false;
  }

  getBytes(path: string): Uint8Array | undefined {
    return this.bytes.get(path);
  }

  getText(path: string): string | undefined {
    const cached = this.texts.get(path);
    if (cached !== undefined) return cached;
    const b = this.bytes.get(path);
    if (!b) return undefined;
    const t = decodeUtf8(b);
    this.texts.set(path, t);
    return t;
  }

  private fetchOne(path: string): Promise<void> {
    let p = this.inflight.get(path);
    if (!p) {
      p = this.loader
        .file(path)
        .then((b) => {
          this.bytes.set(path, b);
        })
        .finally(() => this.inflight.delete(path));
      this.inflight.set(path, p);
    }
    return p;
  }

  /** Fetch every listed base file that is not cached yet (unknown paths are skipped). */
  async ensure(paths: readonly string[]): Promise<void> {
    await this.loadIndex();
    const todo = [...new Set(paths)].filter((p) => this.has(p) && !this.bytes.has(p));
    let next = 0;
    const worker = async () => {
      while (next < todo.length) await this.fetchOne(todo[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  }
}
