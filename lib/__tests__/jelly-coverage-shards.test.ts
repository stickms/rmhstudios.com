import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARD_DIR, loadShards, shardOf } from './jelly-coverage-shards';

const ROOT = process.cwd();

it.each([
  ['app/routes/rmhbox/index.tsx', 'app-routes-rmhbox'],
  ['app/routes/rmhbox/minigames/$minigameId/history.tsx', 'app-routes-rmhbox'],
  ['app/root.tsx', 'app'],
  ['components/rmhbox/minigames/rhyme-time/RhymeTimeInput.tsx', 'components-rmhbox'],
  ['components/ui/slider.tsx', 'components-ui'],
])('%s → %s', (file, shard) => expect(shardOf(file)).toBe(shard));

function countRaw(role: string): number {
  let n = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== 'node_modules' && e.name !== '__tests__') walk(rel);
      } else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) {
        if (rel.startsWith('components/ui/')) continue;
        n += (readFileSync(join(ROOT, rel), 'utf8').match(new RegExp(`role="${role}"`, 'g')) ?? [])
          .length;
      }
    }
  };
  walk('components');
  walk('app');
  return n;
}

describe('sharded baseline', () => {
  const sum = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);

  it('the totals survive the split', () => {
    const merged = loadShards();
    // Surfaces: the codemod's report is the independent count the gate is kept identical to.
    const report = execFileSync('node', ['scripts/codemods/jelly-roles.mjs', '--report'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const surfaces = Number(/hand-rolled surfaces: (\d+)/.exec(report)?.[1]);
    expect(sum(merged.surfaces)).toBe(surfaces);
    expect(sum(merged.dialogs)).toBe(countRaw('dialog'));
    expect(sum(merged.switches)).toBe(countRaw('switch'));
  }, 60_000);

  it('every entry lives in its own shard, shards are sorted, and none is empty', () => {
    expect(existsSync(join(ROOT, 'lib/__tests__/jelly-coverage.baseline.json'))).toBe(false);
    const files = readdirSync(SHARD_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(1);
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(SHARD_DIR, f), 'utf8')) as Record<
        string,
        Record<string, number>
      >;
      let entries = 0;
      for (const kind of ['surfaces', 'dialogs', 'switches']) {
        const keys = Object.keys(data[kind] ?? {});
        entries += keys.length;
        expect(keys, `${f} ${kind} sorted`).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
        for (const k of keys) expect(`${shardOf(k)}.json`, k).toBe(f);
      }
      expect(entries, `${f} is empty`).toBeGreaterThan(0);
    }
  });
});
