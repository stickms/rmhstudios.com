/**
 * The console's files: the player's `.cfg` scripts (`autoexec.cfg`, the
 * machine-written `config.cfg`, anything they `cfg_save`) and the command
 * history, one set per game, in localStorage under
 * `rmh:tf2-game:console:<game>:…`. Every read and write tolerates a storage
 * that is missing, full or throws (private mode, blocked site data): reads
 * come back empty and writes report false, and the console carries on in
 * memory.
 *
 * Environment-agnostic (the storage is injected; the browser's is the default).
 */

/** The slice of the Storage API the console uses. */
export interface ConsoleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A cfg name: letters, digits, `_ - .` and one level of `/` (no `..`), ending `.cfg`. */
const CFG_NAME_RE = /^(?:[a-z0-9_\-.]{1,40}\/)?[a-z0-9_\-.]{1,60}\.cfg$/;
/** The biggest script kept (the engine reads cfgs into a 64 KB buffer too). */
export const CFG_MAX_BYTES = 64 * 1024;
export const HISTORY_MAX = 100;
/** Files a game may keep. */
export const CFG_MAX_FILES = 64;

/** `foo` → `foo.cfg`, lower-cased; null for a name that is not a valid cfg path. */
export function cfgName(raw: string): string | null {
  let n = raw.trim().toLowerCase().replace(/\\/g, '/');
  if (n.startsWith('cfg/')) n = n.slice(4);
  if (!n.endsWith('.cfg')) n = `${n}.cfg`;
  if (n.includes('..') || !CFG_NAME_RE.test(n)) return null;
  return n;
}

/** `window.localStorage`, or null where touching it throws or it does not exist. */
export function browserConsoleStorage(): ConsoleStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export class ConsoleFiles {
  private readonly prefix: string;

  constructor(
    game: string,
    private readonly storage: ConsoleStorage | null = browserConsoleStorage(),
  ) {
    this.prefix = `rmh:tf2-game:console:${game}:`;
  }

  private get(key: string): string | null {
    if (!this.storage) return null;
    try {
      return this.storage.getItem(this.prefix + key);
    } catch {
      return null;
    }
  }

  private put(key: string, value: string): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.prefix + key, value);
      return true;
    } catch {
      return false;
    }
  }

  private drop(key: string): void {
    try {
      this.storage?.removeItem(this.prefix + key);
    } catch {
      /* nothing to do */
    }
  }

  /** The cfg names kept (an index, so listing never scans foreign keys). */
  list(): string[] {
    const raw = this.get('cfgs');
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && cfgName(x) === x).sort() : [];
    } catch {
      return [];
    }
  }

  read(name: string): string | null {
    const n = cfgName(name);
    return n ? this.get(`cfg:${n}`) : null;
  }

  /** False when the name is invalid, the text too big, the file limit reached or the storage refused. */
  write(name: string, text: string): boolean {
    const n = cfgName(name);
    if (!n || text.length > CFG_MAX_BYTES) return false;
    const names = this.list();
    if (!names.includes(n)) {
      if (names.length >= CFG_MAX_FILES) return false;
      names.push(n);
    }
    if (!this.put(`cfg:${n}`, text)) return false;
    this.put('cfgs', JSON.stringify(names));
    return true;
  }

  remove(name: string): boolean {
    const n = cfgName(name);
    if (!n) return false;
    this.drop(`cfg:${n}`);
    this.put('cfgs', JSON.stringify(this.list().filter((x) => x !== n)));
    return true;
  }

  loadHistory(): string[] {
    const raw = this.get('history');
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 510).slice(-HISTORY_MAX) : [];
    } catch {
      return [];
    }
  }

  saveHistory(lines: readonly string[]): boolean {
    return this.put('history', JSON.stringify(lines.slice(-HISTORY_MAX)));
  }
}
