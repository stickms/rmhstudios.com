// Deny-list of user ids the hub refuses: how an operator cuts one account off without restarting
// the hub (a restart ends every user's session). Sources: RMHOS_NET_DENY_USERS (comma separated,
// read at start) plus an optional file RMHOS_NET_DENY_FILE (one id per line or comma separated,
// `#` comments), re-read on SIGHUP and every 60 s.
//
// A reload must never LIFT a block by accident, so:
//   - a file that cannot be read, or that has been deleted, keeps the last list (one warning when it
//     goes from readable to missing, not one per reload: no deny file is the normal state);
//   - a file whose list differs from the one in force while it was modified less than 2 s ago (empty,
//     shorter, or truncated mid-line to the same count) is treated as a half-written save: the reload
//     is retried once, 2 s later, and only that second read is believed;
//   - a file that is older than 2 s is believed at once, so an operator who really empties it clears
//     the list, and the hub logs how many entries that removed.
import { readFileSync, statSync } from 'node:fs';

export const SETTLE_MS = 2000;

export interface DenyList {
  has(userId: string): boolean;
  /**
   * Re-read the file; returns the ids that are newly denied. When the file looks half-written the
   * answer is `[]` now and the retry 2 s later reports through `onRetry` (the caller enforces there).
   */
  reload(onRetry?: (added: string[]) => void): string[];
  /** Operational log lines (warnings, removals); the hub points this at its JSON logger. */
  onEvent: (line: Record<string, unknown>) => void;
  readonly size: number;
}

export interface DenyIo {
  /** mtime of the file in epoch ms, or null when it cannot be stat'ed. */
  mtimeMs: (path: string) => number | null;
  now: () => number;
  /** Schedule the one retry. Default: an unref'd setTimeout. */
  later: (fn: () => void, ms: number) => void;
}

const defaultIo: DenyIo = {
  mtimeMs: (p) => {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return null;
    }
  },
  now: () => Date.now(),
  later: (fn, ms) => {
    setTimeout(fn, ms).unref();
  },
};

function parse(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*$/, ''))
    .flatMap((line) => line.split(','))
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

export function createDenyList(
  env: NodeJS.ProcessEnv,
  readFile: (path: string) => string = (p) => readFileSync(p, 'utf8'),
  ioOverrides: Partial<DenyIo> = {},
): DenyList {
  const io = {
    ...defaultIo,
    ...ioOverrides,
  };
  const fromEnv = parse((env.RMHOS_NET_DENY_USERS ?? '').replace(/,/g, '\n'));
  const file = env.RMHOS_NET_DENY_FILE?.trim() ?? '';
  let current = new Set<string>(fromEnv);
  // Whether the last read of the file worked; the start-up read below sets it.
  let fileReadable = false;
  const list: DenyList = {
    has: (id) => current.has(id),
    onEvent: () => {},
    reload(onRetry) {
      return apply(false, onRetry);
    },
    get size() {
      return current.size;
    },
  };

  // The file read into memory in one go, or null (with a warning) when it cannot be read.
  function read(): Set<string> | null {
    try {
      const set = new Set([...fromEnv, ...parse(readFile(file))]);
      fileReadable = true;
      return set;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      const missing = code === 'ENOENT' || (err instanceof Error && err.message.includes('ENOENT'));
      // Warn when the file goes from readable to unreadable, not on every reload: no deny file at
      // all is the normal production state and must not log a line a minute.
      if (fileReadable) {
        fileReadable = false;
        list.onEvent({
          evt: 'rmhos-net.deny.warn',
          reason: missing ? 'file-missing' : 'file-unreadable',
          keeping: current.size,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return null;
    }
  }

  function apply(isRetry: boolean, onRetry?: (added: string[]) => void): string[] {
    if (file === '') return [];
    const next = read();
    if (next === null) return [];
    // A file written less than 2 s ago may be half-written whatever its size (an editor truncating
    // mid-line leaves the same count with a shorter id), so a changed list is believed only once the
    // file has settled. An unchanged list needs no second look.
    const unchanged = next.size === current.size && [...next].every((id) => current.has(id));
    if (!isRetry && !unchanged) {
      const mtime = io.mtimeMs(file);
      if (mtime !== null && io.now() - mtime < SETTLE_MS) {
        list.onEvent({
          evt: 'rmhos-net.deny.warn',
          reason: 'file-changed-while-fresh',
          had: current.size,
          read: next.size,
        });
        io.later(() => {
          const added = apply(true);
          onRetry?.(added);
        }, SETTLE_MS);
        return [];
      }
    }
    const added = [...next].filter((id) => !current.has(id));
    const removed = [...current].filter((id) => !next.has(id)).length;
    current = next;
    if (removed > 0)
      list.onEvent({
        evt: 'rmhos-net.deny.removed',
        removed,
        total: current.size,
      });
    return added;
  }

  // Start-up: an unreadable file is an empty list (there is nothing earlier to keep).
  if (file !== '') {
    try {
      current = new Set([...fromEnv, ...parse(readFile(file))]);
      fileReadable = true;
    } catch {
      current = new Set(fromEnv);
    }
  }
  return list;
}
