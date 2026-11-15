/**
 * The ONE typed, SSR-safe JSON wrapper over Web Storage (redesign audit A4).
 *
 * Reading or writing `localStorage` can throw (Safari private mode, a blocked
 * storage API, a full quota, a sandboxed iframe) and returns `null` on the
 * server; the value under a key can be corrupt, or written by an older build.
 * Every call site used to re-solve this with its own try/catch + `JSON.parse`.
 * These helpers never throw:
 *
 *   readJson('rmh-foo', { n: 0 })                    // value, or the fallback
 *   readJson('rmh-foo', [], { validate: isStringArray })
 *   writeJson('rmh-foo', value)                      // false on quota/blocked
 *   removeKey('rmh-foo')
 *   const store = persisted({ key, version: 2, fallback, migrate, validate })
 *
 * `validate` turns the parsed `unknown` into the real type (return `undefined`
 * to reject it and fall back); that is where shape checks and clamping live, so
 * the caller never casts. `{ storage: 'session' }` targets sessionStorage.
 * Raw `getItem` + `JSON.parse` pairs outside `lib/core` are ratcheted down by
 * `lib/__tests__/persist-ratchet.test.ts`.
 */

export type StorageKind = 'local' | 'session';

export interface WriteOptions {
  storage?: StorageKind;
}

export interface ReadOptions<T> extends WriteOptions {
  /** Turn the parsed value into `T`, or return `undefined` to reject it. */
  validate?: (value: unknown) => T | undefined;
}

function area(kind: StorageKind | undefined): Storage | null {
  try {
    // `window` in a page; `globalThis` in a worker (or a test that stubs the global).
    const host: Pick<typeof globalThis, 'localStorage' | 'sessionStorage'> =
      typeof window !== 'undefined' ? window : globalThis;
    return (kind === 'session' ? host.sessionStorage : host.localStorage) ?? null;
  } catch {
    return null;
  }
}

/** The raw string under `key`, or `null` (missing, blocked, or on the server). */
export function readString(key: string, opts: WriteOptions = {}): string | null {
  try {
    return area(opts.storage)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Store a raw string. `false` if storage is blocked or full. */
export function writeString(key: string, value: string, opts: WriteOptions = {}): boolean {
  try {
    const s = area(opts.storage);
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** The JSON value under `key`, `validate`d; otherwise `fallback`. Never throws. */
export function readJson<T>(key: string, fallback: T, opts: ReadOptions<T> = {}): T {
  const raw = readString(key, opts);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!opts.validate) return parsed as T;
    const checked = opts.validate(parsed);
    return checked === undefined ? fallback : checked;
  } catch {
    return fallback;
  }
}

/** Store `value` as JSON. `false` if storage is blocked/full or `value` is unserialisable. */
export function writeJson(key: string, value: unknown, opts: WriteOptions = {}): boolean {
  try {
    return writeString(key, JSON.stringify(value), opts);
  } catch {
    return false;
  }
}

/** Delete `key`. Never throws. */
export function removeKey(key: string, opts: WriteOptions = {}): void {
  try {
    area(opts.storage)?.removeItem(key);
  } catch {
    /* blocked storage: nothing to remove */
  }
}

export interface PersistedOptions<T> extends WriteOptions {
  key: string;
  fallback: T;
  /** Current schema version; stored beside the value. Default 1. */
  version?: number;
  /** Upgrade a value written at `from` (an older version) to the current shape. */
  migrate?: (value: unknown, from: number) => unknown;
  validate?: (value: unknown) => T | undefined;
}

export interface Persisted<T> {
  read(): T;
  write(value: T): boolean;
  clear(): void;
}

interface Envelope {
  v: number;
  d: unknown;
}

function isEnvelope(x: unknown): x is Envelope {
  return typeof x === 'object' && x !== null && typeof (x as Envelope).v === 'number' && 'd' in x;
}

/**
 * A versioned value, stored as `{ v, d }`. An older `v` goes through `migrate`;
 * a newer one (a rollback) or a failed `validate` reads as the fallback.
 */
export function persisted<T>(opts: PersistedOptions<T>): Persisted<T> {
  const version = opts.version ?? 1;
  const where: WriteOptions = opts.storage ? { storage: opts.storage } : {};
  return {
    read() {
      const env = readJson<unknown>(opts.key, undefined, where);
      if (!isEnvelope(env) || env.v > version) return opts.fallback;
      try {
        const data = env.v < version && opts.migrate ? opts.migrate(env.d, env.v) : env.d;
        if (!opts.validate) return data as T;
        return opts.validate(data) ?? opts.fallback;
      } catch {
        return opts.fallback;
      }
    },
    write(value) {
      return writeJson(opts.key, { v: version, d: value } satisfies Envelope, where);
    },
    clear() {
      removeKey(opts.key, where);
    },
  };
}
