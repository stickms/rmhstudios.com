// Golden master for single-player Altair. See golden-harness.ts.
//
// The recorded hashes in golden-master.json were produced by the engine BEFORE
// the multiplayer refactor. If a hash changes you changed gameplay: fix the
// engine change, never the golden. Regenerate only for an intentional,
// reviewed gameplay change:  ALTAIR_UPDATE_GOLDEN=1 pnpm exec vitest run <this file>
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../webgl/webgl-context', async (orig) => ({
  ...(await orig<typeof import('../webgl/webgl-context')>()),
  initWebGL: () => ({}),
}));
vi.mock('../webgl/webgl-sprite-batch', () => ({ SpriteBatch: class {} }));
vi.mock('../webgl/webgl-shapes', () => ({ ShapeBatch: class {} }));
vi.mock('../webgl/webgl-textures', async (orig) => ({
  ...(await orig<typeof import('../webgl/webgl-textures')>()),
  setGLContext: () => {},
}));
vi.mock('../sprites/sprite-defs', async (orig) => ({
  ...(await orig<typeof import('../sprites/sprite-defs')>()),
  initAllSpriteSheets: () => {},
}));
vi.mock('../renderer', async (orig) => ({
  ...(await orig<typeof import('../renderer')>()),
  renderFrame: () => {},
}));

import { runScenario, type Scenario, type GoldenResult } from './golden-harness';

const SCENARIOS: Scenario[] = [
  { name: 'knight-walk', classId: 'knight', seed: 101, frames: 1500, input: 'walk' },
  { name: 'ranger-walk', classId: 'ranger', seed: 202, frames: 1500, input: 'walk' },
  { name: 'necromancer-summons', classId: 'necromancer', seed: 303, frames: 1500, input: 'walk', startTime: 60 },
  { name: 'hemomancer-hollow-king', classId: 'hemomancer', seed: 404, frames: 1400, input: 'walk', startTime: 296, forceBoss: { at: 297, bossId: 'hollow_king' } },
  { name: 'plague-doctor-countess', classId: 'plague_doctor', seed: 707, frames: 1400, input: 'walk', startTime: 596, forceBoss: { at: 597, bossId: 'crimson_countess' } },
  { name: 'chronomancer-walk', classId: 'chronomancer', seed: 808, frames: 1500, input: 'walk', startTime: 30 },
  { name: 'arcanist-late-waves', classId: 'arcanist', seed: 505, frames: 1200, input: 'walk', startTime: 400 },
  { name: 'berserker-death', classId: 'berserker', seed: 606, frames: 3000, input: 'still', startTime: 700 },
];

const GOLDEN_PATH = join(__dirname, 'golden-master.json');
const update = process.env.ALTAIR_UPDATE_GOLDEN === '1';
const golden: Record<string, GoldenResult> = existsSync(GOLDEN_PATH)
  ? JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'))
  : {};
const recorded: Record<string, GoldenResult> = {};

describe('altair single-player golden master', () => {
  for (const sc of SCENARIOS) {
    it(sc.name, async () => {
      const res = await runScenario(sc);
      recorded[sc.name] = res;
      if (update) return;
      expect(golden[sc.name], `no golden recorded for ${sc.name}`).toBeDefined();
      expect(res.checkpoints).toEqual(golden[sc.name].checkpoints);
      expect(res.events).toEqual(golden[sc.name].events);
      expect(res.final).toEqual(golden[sc.name].final);
    });
  }

  it('is stable across repeated runs in one process', async () => {
    const sc = SCENARIOS[0];
    const a = await runScenario(sc);
    const b = await runScenario(sc);
    expect(b).toEqual(a);
  });

  if (update) {
    it('writes golden', () => {
      writeFileSync(GOLDEN_PATH, JSON.stringify(recorded, null, 1) + '\n');
    });
  }
});
