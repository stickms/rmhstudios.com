/**
 * The host driver (fixed-step accumulator + 20 Hz snapshots) and the client's
 * snapshot jitter buffer. Both are pure with an injected clock.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The engine touches WebGL/Image at import and world creation; the driver never draws.
vi.mock('../../engine/webgl/webgl-context', async (orig) => ({
  ...(await orig<typeof import('../../engine/webgl/webgl-context')>()),
  initWebGL: () => ({}),
}));
vi.mock('../../engine/webgl/webgl-sprite-batch', () => ({ SpriteBatch: class {} }));
vi.mock('../../engine/webgl/webgl-shapes', () => ({ ShapeBatch: class {} }));
vi.mock('../../engine/webgl/webgl-textures', async (orig) => ({
  ...(await orig<typeof import('../../engine/webgl/webgl-textures')>()),
  setGLContext: () => {},
}));
vi.mock('../../engine/sprites/sprite-defs', async (orig) => ({
  ...(await orig<typeof import('../../engine/sprites/sprite-defs')>()),
  initAllSpriteSheets: () => {},
}));

import { createRng } from '../../engine/__tests__/golden-harness';
import { HostDriver, INPUT_STALE_MS, MAX_STEPS_PER_ADVANCE, SNAPSHOT_EVERY } from '../host-driver';
import { SnapshotBuffer } from '../snapshot-buffer';
import { decodeSnapshot, type DecodedSnapshot } from '../snapshot';
import type { GameStateSnapshot } from '../types';

vi.setConfig({ testTimeout: 60_000 });

beforeEach(() => {
  const rng = createRng(7);
  vi.spyOn(Math, 'random').mockImplementation(() => rng.next());
});
afterEach(() => {
  vi.restoreAllMocks();
});

function driver(extra: Partial<ConstructorParameters<typeof HostDriver>[0]> = {}) {
  const sent: GameStateSnapshot[] = [];
  const d = new HostDriver({
    players: [
      { playerId: 'a', classId: 'knight', slot: 0 },
      { playerId: 'b', classId: 'arcanist', slot: 1 },
    ],
    send: (s) => sent.push(JSON.parse(JSON.stringify(s))),
    ...extra,
  });
  return { d, sent };
}

describe('HostDriver', () => {
  it('runs 60 steps per second of wall time and snapshots every 3rd step', () => {
    const { d, sent } = driver();
    d.advance(0);
    let steps = 0;
    for (let t = 16; t <= 1000; t += 16) steps += d.advance(t); // 60 Hz-ish frames
    expect(steps).toBeGreaterThanOrEqual(58);
    expect(steps).toBeLessThanOrEqual(61);
    expect(sent.length).toBe(Math.floor(d.sim.tick / SNAPSHOT_EVERY));
    // Snapshots are what a guest decodes.
    const decoded = decodeSnapshot(sent[sent.length - 1]);
    expect(decoded?.players.map((p) => p.playerId).sort()).toEqual(['a', 'b']);
  });

  it('caps catch-up after a stall instead of replaying it (and does not spiral)', () => {
    const { d } = driver();
    d.advance(0);
    const ran = d.advance(60_000); // a minute asleep
    expect(ran).toBe(MAX_STEPS_PER_ADVANCE);
    expect(d.droppedSteps).toBeGreaterThan(1000);
    expect(d.advance(60_016)).toBeLessThanOrEqual(1); // back to normal the next tick
  });

  it('applies guest intent and zeroes it when the guest goes quiet', () => {
    const { d } = driver();
    d.advance(0);
    d.input('b', 1, 0, 0);
    const x0 = d.sim.getPlayer('b')!.x;
    for (let t = 16; t <= 500; t += 16) d.advance(t);
    const x1 = d.sim.getPlayer('b')!.x;
    expect(x1).toBeGreaterThan(x0 + 20);
    // No further input for longer than the staleness window: the guest stands still.
    for (let t = 516; t <= 500 + INPUT_STALE_MS + 600; t += 16) d.advance(t);
    const x2 = d.sim.getPlayer('b')!.x;
    for (let t = 2500; t <= 3000; t += 16) d.advance(t);
    expect(d.sim.getPlayer('b')!.x).toBeCloseTo(x2, 1);
  });

  it('treats an unknown or hostile intent as harmless', () => {
    const { d } = driver();
    d.advance(0);
    d.input('nobody', 1, 1, 0);
    d.input('a', Number.NaN, 1e9, 0);
    for (let t = 16; t <= 200; t += 16) d.advance(t);
    const a = d.sim.getPlayer('a')!;
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
  });

  it('offers a level-up to its owner exactly once and the pick closes it (the world keeps running)', () => {
    const offers: { id: string; level: number; n: number }[] = [];
    const { d } = driver({ onLevelUpOffer: (id, o) => offers.push({ id, level: o.level, n: o.choices.length }) });
    d.advance(0);
    (d.sim as unknown as { byId: Map<string, { levelUpQueue: number }> }).byId.get('b')!.levelUpQueue = 1;
    for (let t = 16; t <= 400; t += 16) d.advance(t);
    expect(offers.length).toBe(1);
    expect(offers[0].id).toBe('b');
    expect(offers[0].n).toBeGreaterThan(0);
    const tick = d.sim.tick;
    expect(d.sim.getPendingLevelUp('b')).not.toBeNull();
    expect(d.chooseUpgrade('b', 0)).toBe(true);
    expect(d.chooseUpgrade('b', 0)).toBe(false); // nothing left to pick
    for (let t = 416; t <= 800; t += 16) d.advance(t);
    expect(d.sim.tick).toBeGreaterThan(tick); // never paused
    expect(offers.length).toBe(1);
  });

  it('reports the end of the run once, with per-player stats, after a team wipe', () => {
    const ends: unknown[] = [];
    const { d } = driver({ onEnd: (e) => ends.push(e) });
    d.advance(0);
    for (const id of d.sim.playerIds()) (d.sim.getPlayer(id) as { hp: number }).hp = 0;
    for (let t = 16; t <= 2000; t += 16) d.advance(t);
    expect(d.isEnded).toBe(true);
    expect(ends.length).toBe(1);
    const end = ends[0] as { victory: boolean; stats: { playerId: string }[] };
    expect(end.victory).toBe(false);
    expect(end.stats.map((s) => s.playerId).sort()).toEqual(['a', 'b']);
    expect(d.advance(5000)).toBe(0); // nothing after the end
  });
});

function snap(tick: number, x: number): DecodedSnapshot {
  return {
    tick,
    time: tick / 20,
    sharedKills: 0,
    bossActive: false,
    bossWarning: null,
    players: [
      {
        playerId: 'a', x, y: 0, hp: 10, maxHp: 10, facingX: 1, facingY: 0, state: 0, downTimer: 0, revive: 0,
        invuln: false, classId: 'knight', slot: 0, level: 1, kills: 0, coins: 0, levelUpPending: false,
      },
    ],
    enemies: [],
    projectiles: [],
    pickups: [],
  };
}

describe('SnapshotBuffer', () => {
  it('blends the two snapshots around the render time', () => {
    const b = new SnapshotBuffer();
    b.push(snap(1, 0), 1000);
    b.push(snap(2, 100), 1050);
    b.push(snap(3, 200), 1100);
    expect(b.sample(1025)!.players[0].x).toBeCloseTo(50, 5);
    expect(b.sample(1075)!.players[0].x).toBeCloseTo(150, 5);
  });

  it('extrapolates at most one interval past the newest, then holds', () => {
    const b = new SnapshotBuffer();
    b.push(snap(1, 0), 1000);
    b.push(snap(2, 100), 1050);
    expect(b.sample(1100)!.players[0].x).toBeCloseTo(200, 5);
    expect(b.sample(9000)!.players[0].x).toBeCloseTo(200, 5);
  });

  it('ignores stale and duplicate ticks, and shows the first snapshot before any pair exists', () => {
    const b = new SnapshotBuffer();
    expect(b.sample(0)).toBeNull();
    expect(b.push(snap(5, 50), 1000)).toBe(true);
    expect(b.push(snap(5, 51), 1010)).toBe(false);
    expect(b.push(snap(4, 40), 1020)).toBe(false);
    expect(b.sample(2000)!.players[0].x).toBe(50);
  });

  it('survives two snapshots arriving in the same millisecond', () => {
    const b = new SnapshotBuffer();
    b.push(snap(1, 0), 1000);
    b.push(snap(2, 100), 1000);
    expect(Number.isFinite(b.sample(1000)!.players[0].x)).toBe(true);
  });
});
