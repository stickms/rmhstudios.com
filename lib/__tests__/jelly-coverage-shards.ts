/**
 * The jelly coverage baseline is sharded: one JSON file per directory under `jelly-coverage.baseline/`, so PRs that
 * clean different areas lower different files and never conflict. Each shard has the shape `{ surfaces, dialogs,
 * switches }` (maps sorted by key, files with no debt omitted, no empty shard files).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface Measured {
  surfaces: Record<string, number>;
  dialogs: Record<string, number>;
  switches: Record<string, number>;
}

export const KINDS = ['surfaces', 'dialogs', 'switches'] as const;
export const SHARD_DIR = join(process.cwd(), 'lib/__tests__/jelly-coverage.baseline');

/** `app/routes/<x>/…` → `app-routes-<x>`; `app/<file>` → `app`; `components/<x>/…` → `components-<x>`. */
export function shardOf(file: string): string {
  const p = file.split('/');
  if (p[0] === 'app') {
    if (p[1] === 'routes' && p.length > 3) return `app-routes-${p[2]}`;
    return p[1] === 'routes' ? 'app-routes' : 'app';
  }
  if (p[0] === 'components' && p.length > 2) return `components-${p[1]}`;
  return p[0] === 'components' ? 'components' : p[0];
}

const empty = (): Measured => ({ surfaces: {}, dialogs: {}, switches: {} });

const sorted = (c: Record<string, number>) =>
  Object.fromEntries(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));

/** Merge every shard file into one baseline. */
export function loadShards(dir = SHARD_DIR): Measured {
  const out = empty();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Partial<Measured>;
    for (const k of KINDS) Object.assign(out[k], data[k] ?? {});
  }
  return out;
}

/** Write `next` as one file per shard (sorted keys, trailing newline); delete shard files that became empty. */
export function writeShards(next: Measured, dir = SHARD_DIR): void {
  const byShard = new Map<string, Measured>();
  for (const k of KINDS) {
    for (const [file, n] of Object.entries(next[k])) {
      const s = shardOf(file);
      if (!byShard.has(s)) byShard.set(s, empty());
      byShard.get(s)![k][file] = n;
    }
  }
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    if (!byShard.has(f.slice(0, -5))) unlinkSync(join(dir, f));
  }
  for (const [s, m] of byShard) {
    const body = {
      surfaces: sorted(m.surfaces),
      dialogs: sorted(m.dialogs),
      switches: sorted(m.switches),
    };
    writeFileSync(join(dir, `${s}.json`), `${JSON.stringify(body, null, 2)}\n`);
  }
}
