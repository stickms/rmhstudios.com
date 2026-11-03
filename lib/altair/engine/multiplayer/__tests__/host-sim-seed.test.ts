// The run seed makes a co-op run a pure function of (seed, roster, inputs). This is the
// property the server-side replay (lib/altair/verify) relies on, so it is pinned here:
// same seed -> same world even in one process that already ran another sim (module state
// is reset), no Math.random in the step, different seed -> different world.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../../webgl/webgl-context', async (orig) => ({
  ...(await orig<typeof import('../../webgl/webgl-context')>()),
  initWebGL: () => ({}),
}));
vi.mock('../../webgl/webgl-sprite-batch', () => ({ SpriteBatch: class {} }));
vi.mock('../../webgl/webgl-shapes', () => ({ ShapeBatch: class {} }));
vi.mock('../../webgl/webgl-textures', async (orig) => ({
  ...(await orig<typeof import('../../webgl/webgl-textures')>()),
  setGLContext: () => {},
}));
vi.mock('../../sprites/sprite-defs', async (orig) => ({
  ...(await orig<typeof import('../../sprites/sprite-defs')>()),
  initAllSpriteSheets: () => {},
}));

import { createHostSim, type HostSim } from '../host-sim';

vi.setConfig({ testTimeout: 60_000 });

afterEach(() => {
  vi.restoreAllMocks();
});

const ROSTER = [
  { playerId: 'a', classId: 'knight', slot: 0 },
  { playerId: 'b', classId: 'ranger', slot: 1 },
];

function run(seed: number, steps: number): HostSim {
  const sim = createHostSim({ players: ROSTER, seed });
  for (let i = 0; i < steps; i++) {
    const seg = Math.floor(i / 90);
    sim.setInput('a', Math.cos(seg * 1.1), Math.sin(seg * 1.1));
    sim.setInput('b', Math.cos(seg * 2.3), Math.sin(seg * 2.3));
    sim.step();
  }
  return sim;
}

function worldHash(sim: HostSim): string {
  const replacer = (_k: string, v: unknown) => {
    if (v instanceof Set) return { __set: [...v].sort() };
    if (v instanceof Map) return { __map: [...v.entries()] };
    if (typeof v === 'number' && !Number.isFinite(v)) return `__num:${String(v)}`;
    return v;
  };
  return createHash('sha256').update(JSON.stringify(sim.world, replacer)).digest('hex').slice(0, 16);
}

describe('HostSim: run seed', () => {
  it('replays bit-identically in the same process, whatever ran in between', () => {
    const first = run(4242, 1200);
    const h = worldHash(first);
    run(999, 400); // pollutes any module-level engine state
    const again = run(4242, 1200);
    expect(worldHash(again)).toBe(h);
    expect(again.world.sharedKills).toBe(first.world.sharedKills);
  });

  it('never touches Math.random once constructed', () => {
    const sim = createHostSim({ players: ROSTER, seed: 7 });
    const spy = vi.spyOn(Math, 'random');
    for (let i = 0; i < 600; i++) sim.step();
    sim.addPlayer({ playerId: 'c', classId: 'necromancer', slot: 2 });
    for (let i = 0; i < 60; i++) sim.step();
    expect(spy).not.toHaveBeenCalled();
  });

  it('a different seed gives a different run', () => {
    expect(worldHash(run(1, 900))).not.toBe(worldHash(run(2, 900)));
  });

  it('seeds are normalised to 32 bits', () => {
    expect(createHostSim({ players: ROSTER, seed: 5 }).seed).toBe(5);
    expect(createHostSim({ players: ROSTER, seed: 2 ** 32 + 5 }).seed).toBe(5);
  });
});
