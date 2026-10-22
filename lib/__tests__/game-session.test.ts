import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The game session contract (plan U3), as an executable gate.
 *
 * Every catalog game should mount `useGameSession` (`hooks/useGameSession.ts`):
 * keep the screen on during a run, pause a solo run when the tab hides, and
 * publish its restart key. Before the hook, eight games paused on hide, three
 * held a wake lock, and the rest kept simulating — and dying — in a background
 * tab.
 *
 * `EXEMPT` is the backlog of games that do not mount it yet, each with the
 * reason. It is ONE-DIRECTIONAL: entries come out, they do not go in. The
 * second test fails when an exempt game starts using the hook, so a fixed
 * entry cannot linger.
 */

const ROOT = process.cwd();

/** Catalog id → the directories its runtime lives in. Defaults to `components/<id>`. */
const DIRS: Record<string, string[]> = {
  'rochester-offensive': ['components/breakpoint'],
  'daily-puzzles': ['components/daily-puzzles'],
};

const EXEMPT: Record<string, string> = {
  altair: 'turn-paced co-op board; no live clock to pause',
  cookgame: 'cozy sim with no fail state',
  'daily-puzzles': 'untimed puzzles',
  'gabriels-horn': 'online-only table game; cannot pause for the table',
  isleworks: 'untimed builder',
  'rmh-farming-sim': 'shared persistent farm; the world keeps time server-side',
  rmhbox: 'party game hosted for a room; the host screen drives timing',
  'rochester-offensive': 'online-first; pause needs a host-side design first',
  'temple-of-joy': 'idle game — it is meant to keep running while hidden',
  velum2099: 'text adventure with no clock',
  versecraft: 'narrative puzzle with no clock',
};

function catalogIds(): string[] {
  return readdirSync(join(ROOT, 'lib/catalog/games'))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''));
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

function usesHook(id: string): boolean {
  const dirs = DIRS[id] ?? [`components/${id}`];
  return dirs.some((d) =>
    walk(join(ROOT, d)).some((file) => /\buseGameSession\(/.test(readFileSync(file, 'utf8'))),
  );
}

describe('game session contract (U3)', () => {
  const ids = catalogIds();

  it('every catalog game mounts useGameSession or is a documented exemption', () => {
    const missing = ids.filter((id) => !(id in EXEMPT) && !usesHook(id));
    expect(missing, 'mount useGameSession in these games (hooks/useGameSession.ts)').toEqual([]);
  });

  it('the exemption list only shrinks — remove entries that now use the hook', () => {
    const stale = Object.keys(EXEMPT).filter((id) => usesHook(id));
    expect(stale).toEqual([]);
  });

  it('every exemption names a real catalog game', () => {
    const unknown = Object.keys(EXEMPT).filter((id) => !ids.includes(id));
    expect(unknown).toEqual([]);
  });
});
