/**
 * Regenerate `data/bums-rush/levels/index.json` from the level files on disk.
 *
 * The manifest is the only thing that ships in the initial bundle — the world
 * map, the solo/co-op marks and the "0 / 9" progress counters all render from
 * it before a single world's JSON is fetched (design doc §6.1). That makes it
 * duplicated data, and duplicated data drifts: a level file nobody lists is a
 * level nobody can play, and a listed level with no file is a loader throw.
 * `lib/bums-rush/__tests__/level-schema.test.ts` asserts the two agree in both
 * directions, and this is how you make them agree rather than hand-editing an
 * index by hand for what will eventually be eight worlds of nine.
 *
 *   pnpm bums:manifest           # rewrite the manifest
 *   pnpm bums:manifest --check   # exit 1 if it is stale (for CI/the gate)
 *
 * Deliberately dumb: it reads the fields it needs straight out of each level
 * and sorts deterministically, so running it twice cannot produce two different
 * files and a diff always means the levels really changed.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LEVELS_DIR = join(process.cwd(), 'data', 'bums-rush', 'levels');
const MANIFEST = join(LEVELS_DIR, 'index.json');

interface LevelFile {
  id: string;
  world: number;
  index: number;
  name: string;
  minPlayers: number;
  parSeconds: number;
  showdownRounds?: string[];
}

function readLevels(dir: string): LevelFile[] {
  return readdirSync(join(LEVELS_DIR, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(LEVELS_DIR, dir, f), 'utf-8')) as LevelFile)
    .map((l) => ({
      id: l.id,
      world: l.world,
      index: l.index,
      name: l.name,
      minPlayers: l.minPlayers,
      parSeconds: l.parSeconds,
      ...(l.showdownRounds ? { showdownRounds: l.showdownRounds } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const worldDirs = readdirSync(LEVELS_DIR)
  .filter((d) => /^w\d+$/.test(d) && statSync(join(LEVELS_DIR, d)).isDirectory())
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

const manifest = {
  version: 1 as const,
  worlds: worldDirs.map((dir) => {
    const world = Number(dir.slice(1));
    const levels = readLevels(dir).sort((a, b) => a.index - b.index);
    return { world, name: `bums.world.w${world}.name`, levels };
  }),
  showdown: readLevels('showdown'),
};

const next = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = (() => {
    try {
      return readFileSync(MANIFEST, 'utf-8');
    } catch {
      return '';
    }
  })();
  if (current !== next) {
    console.error("Bum's Rush level manifest is stale — run `pnpm bums:manifest`.");
    process.exit(1);
  }
  console.log("Bum's Rush level manifest is up to date.");
} else {
  writeFileSync(MANIFEST, next);
  const levelCount = manifest.worlds.reduce((n, w) => n + w.levels.length, 0);
  console.log(
    `Wrote manifest: ${manifest.worlds.length} worlds, ${levelCount} levels, ${manifest.showdown.length} showdown arenas.`,
  );
}
