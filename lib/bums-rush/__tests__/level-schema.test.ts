/**
 * Bum's Rush — level data tests.
 *
 * Two halves, matching `lib/__tests__/catalog.test.ts`'s split for the same
 * reason: schema.ts/validate.ts catch a single level's mistakes at parse
 * time, but "does every shipped file actually get loaded, and does the
 * manifest agree with what's on disk" only makes sense across the whole
 * World 1 + Showdown set, which is what this file is for.
 *
 *  1. every shipped level (World 1's nine, the three Showdown arenas) loads
 *     through the real loader, parses, and passes every validator check;
 *  2. deliberately-broken fixtures are rejected, one per validator rule.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import w1_01 from '@/data/bums-rush/levels/w1/w1-01.json';
import {
  levelSchema,
  validateLevel,
  getLevelIssues,
  loadManifest,
  loadWorld,
  loadShowdownArena,
} from '@/lib/bums-rush/levels';
import type { Level, PropKind } from '@/lib/bums-rush/types';

const LEVELS_DIR = join(process.cwd(), 'data/bums-rush/levels');

/** A deep, mutable clone of a known-good level, for building broken fixtures. */
function cloneBaseLevel(): Record<string, unknown> {
  return structuredClone(w1_01) as Record<string, unknown>;
}

describe("Bum's Rush level manifest + World 1 content", () => {
  it('the manifest lists exactly the files on disk, both directions', async () => {
    const manifest = await loadManifest();
    const worldFiles = readdirSync(join(LEVELS_DIR, 'w1'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    const showdownFiles = readdirSync(join(LEVELS_DIR, 'showdown'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();

    const manifestWorldIds = manifest.worlds
      .flatMap((w) => w.levels)
      .map((l) => l.id)
      .sort();
    const manifestShowdownIds = manifest.showdown.map((l) => l.id).sort();

    expect(manifestWorldIds).toEqual(worldFiles);
    expect(manifestShowdownIds).toEqual(showdownFiles);
  });

  it('loads and validates every World 1 campaign level via the real loader', async () => {
    const levels = await loadWorld(1);
    expect(levels).toHaveLength(9);
    expect(levels.map((l) => l.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    for (const level of levels) {
      // getLevelIssues (non-throwing) and validateLevel (throwing) must agree.
      expect(getLevelIssues(level)).toEqual([]);
      expect(() => validateLevel(level)).not.toThrow();
      expect(level.objectives).toHaveLength(3);
    }
  });

  it.each(['w1-a', 'w1-b', 'w1-c'])('loads and validates showdown arena %s', async (id) => {
    const level = await loadShowdownArena(id);
    expect(level.id).toBe(id);
    expect(getLevelIssues(level)).toEqual([]);
    expect(level.objectives).toHaveLength(3);
  });

  it('§6.7 pacing: levels 01-06 and 09 are solo-viable, 07 and 08 are the team gate', async () => {
    const levels = await loadWorld(1);
    const byIndex = new Map(levels.map((l) => [l.index, l]));
    for (const index of [1, 2, 3, 4, 5, 6, 9]) {
      expect(byIndex.get(index)?.minPlayers, `level ${index}`).toBe(1);
    }
    for (const index of [7, 8]) {
      expect(byIndex.get(index)?.minPlayers, `level ${index}`).toBe(2);
    }
  });

  it('§6.2/§20: the world uses crate, rope, swing and platformMoving, plus a parcel and a poseOutline', async () => {
    const levels = await loadWorld(1);
    const kinds = new Set(levels.flatMap((l) => l.props.map((p) => p.kind)));
    const required: PropKind[] = ['crate', 'rope', 'swing', 'platformMoving', 'parcel', 'poseOutline'];
    for (const kind of required) {
      expect(kinds.has(kind), `missing prop kind "${kind}" across World 1`).toBe(true);
    }
  });

  it('every checkpoint-spacing, contrast and body-budget check is clean for the whole shipped set', async () => {
    const [world, a, b, c] = await Promise.all([
      loadWorld(1),
      loadShowdownArena('w1-a'),
      loadShowdownArena('w1-b'),
      loadShowdownArena('w1-c'),
    ]);
    for (const level of [...world, a, b, c]) {
      expect(getLevelIssues(level), level.id).toEqual([]);
    }
  });
});

describe("Bum's Rush level schema + validator: rejects broken data", () => {
  it('rejects an unknown key rather than silently ignoring it', () => {
    const broken = cloneBaseLevel();
    broken.notAField = true;
    expect(levelSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a contrast ratio that does not match the measured ink/paper pair', () => {
    // Ink and paper are nearly identical (measured ratio ~1:1), but the
    // author claims the usual 13.02 — the schema alone can't catch this
    // (contrastRatio still clears the `.min(7)` floor); only validateLevel's
    // actual WCAG computation does.
    const broken = cloneBaseLevel();
    const palette = broken.palette as Record<string, unknown>;
    palette.ink = '#f4ead0';
    palette.paper = '#f4ead6';
    palette.contrastRatio = 13.02;
    const level = levelSchema.parse(broken) as Level;
    expect(() => validateLevel(level)).toThrow(/contrast/i);
  });

  it('rejects spawn.length < minPlayers', () => {
    const broken = cloneBaseLevel();
    broken.minPlayers = 2;
    broken.maxPlayers = 2;
    broken.spawn = [{ x: 220, y: 860 }]; // one spawn point, two required
    const level = levelSchema.parse(broken) as Level;
    expect(() => validateLevel(level)).toThrow(/spawn/i);
  });

  it('rejects a goal placed outside the level bounds', () => {
    const broken = cloneBaseLevel();
    const bounds = broken.bounds as { w: number; h: number };
    broken.goal = {
      shape: { kind: 'rect', x: bounds.w + 500, y: 100, w: 100, h: 60 },
      requires: 'all',
    };
    const level = levelSchema.parse(broken) as Level;
    expect(() => validateLevel(level)).toThrow(/bounds/i);
  });

  it('rejects a signalRelay input with no producer', () => {
    const broken = cloneBaseLevel();
    const props = broken.props as unknown[];
    props.push({
      id: 'relay-dangling',
      at: { x: 50, y: 50 },
      kind: 'signalRelay',
      op: 'and',
      inputs: ['no-one-produces-this'],
      out: 'relay-out',
    });
    // Every objective must still resolve, and three objectives are required —
    // reuse the base level's own objectives untouched.
    const level = levelSchema.parse(broken) as Level;
    expect(() => validateLevel(level)).toThrow(/producer/i);
  });

  // Bonus coverage beyond the required five, exercising the remaining
  // validator rules the same way.
  it('rejects a prop placed on top of a spawn point', () => {
    const broken = cloneBaseLevel();
    const spawn = (broken.spawn as { x: number; y: number }[])[0];
    const props = broken.props as unknown[];
    props.push({ id: 'crate-on-spawn', kind: 'crate', at: { x: spawn.x, y: spawn.y }, size: { x: 80, y: 80 } });
    const level = levelSchema.parse(broken) as Level;
    expect(() => validateLevel(level)).toThrow(/overlaps spawn/i);
  });

  it('rejects a haul objective whose relicId has no matching relic prop', () => {
    const broken = cloneBaseLevel();
    broken.objectives = [
      { kind: 'clock', id: 'x-clock' },
      { kind: 'flawless', id: 'x-flawless' },
      { kind: 'haul', id: 'x-haul', relicIds: ['no-such-relic'] },
    ];
    const level = levelSchema.parse(broken) as Level;
    expect(() => validateLevel(level)).toThrow(/relicId/);
  });
});
