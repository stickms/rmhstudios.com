// Deny-list of user ids the hub refuses: how an operator cuts one account off without restarting
// the hub (a restart ends every user's session). Sources: RMHOS_NET_DENY_USERS (comma separated,
// read at start) plus an optional file RMHOS_NET_DENY_FILE (one id per line or comma separated,
// `#` comments), re-read on SIGHUP and every 60 s. A file that cannot be read keeps the last list:
// a typo or a half-written file must not lift a block.
import { readFileSync } from 'node:fs';

export interface DenyList {
  has(userId: string): boolean;
  /** Re-read the file; returns the ids that are newly denied. */
  reload(): string[];
  readonly size: number;
}

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
): DenyList {
  const fromEnv = parse((env.RMHOS_NET_DENY_USERS ?? '').replace(/,/g, '\n'));
  const file = env.RMHOS_NET_DENY_FILE?.trim() ?? '';
  const load = (): Set<string> | null => {
    if (file === '') return new Set(fromEnv);
    try {
      return new Set([...fromEnv, ...parse(readFile(file))]);
    } catch {
      return null;
    }
  };
  let current = load() ?? new Set<string>(fromEnv);
  return {
    has: (id) => current.has(id),
    reload() {
      const next = load();
      if (next === null) return [];
      const added = [...next].filter((id) => !current.has(id));
      current = next;
      return added;
    },
    get size() {
      return current.size;
    },
  };
}
