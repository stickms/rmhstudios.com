/**
 * w1-01: the safety-net plank must not be a dead end.
 *
 * The plank under the first gap catches a missed swing so it never lands in the
 * sea — but a head cannot get back UP from it. Measured against the engine: a
 * free hand droops to ~15px above a grounded head (`FREE_ARM_AUTHORITY`), so no
 * sequence of grips can mantle even one ledge, and a ball head will not
 * crawl up a slope (it rolls back down at 5 degrees). The only ways a player gains
 * height in this game are swings and being carried, and a swing lands ~110px
 * lower than it starts. So the fix is a carrier: `plank-lift`, a platformMoving
 * that rises from the plank to the middle pier's top.
 *
 * These tests drive the real engine (not a graph): the legacy geometry (the same
 * level minus the lift) is searched with random policies and never escapes; the
 * shipped geometry is escaped from every place a player can end up on the plank.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { objectiveIdsToBitmask } from '../progress/objectives';
import type { InputFrame, Level, RenderSeat, SeatIndex, Vec2 } from '../types';
import { input, run, simFor, unit } from './rig';

const LEVEL: Level = JSON.parse(
  readFileSync(join(process.cwd(), 'data/bums-rush/levels/w1/w1-01.json'), 'utf-8'),
) as Level;

/** The level as it shipped before the lift — the dead end. */
const LEGACY: Level = { ...LEVEL, props: LEVEL.props.filter((p) => p.id !== 'plank-lift') };

const PLANK_TOP = 1150;
const PIER_TOP = 860;
/** On the middle pier: right of its left edge (x=900) and standing on its top. */
const onMiddlePier = (v: RenderSeat) => v.head.x >= 910 && v.head.y <= PIER_TOP - 15;

function withSpawn(level: Level, at: Vec2): Level {
  return { ...level, spawn: [at] };
}

/**
 * Crawl along a flat floor: grip whatever a hand reaches ahead of the head and
 * haul toward it. (Measured: ~2000px in 1500 frames on flat paper.)
 */
function crawler(dir: 1 | -1) {
  return (seat: SeatIndex, step: number, v: RenderSeat): InputFrame => {
    const arm = (a: Vec2[], gripped: boolean, reaching: boolean) => {
      const hand = a[a.length - 1];
      const ahead = (hand.x - v.head.x) * dir;
      let aim: Vec2;
      if (gripped && ahead > 8) aim = unit(-(hand.x - v.head.x), -(hand.y - v.head.y));
      else aim = unit(dir, -0.35);
      const release = gripped && ahead <= 8;
      return { aim, grip: release ? 0 : (reaching && ahead > 25) || gripped ? 1 : 0 };
    };
    const l = arm(v.armL, v.gripL, v.reachingL);
    const r = arm(v.armR, v.gripR, v.reachingR);
    return input(seat, step + 1, l.aim, r.aim, l.grip, r.grip);
  };
}

/** Deterministic PRNG so the search is reproducible. */
function rngOf(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random open-loop flail: random aim angles, grip duty cycle and phase per hand. */
function flail(seed: number) {
  const rnd = rngOf(seed);
  const hand = () => ({
    cycle: 20 + Math.floor(rnd() * 80),
    hold: 0.3 + rnd() * 0.6,
    phase: Math.floor(rnd() * 80),
    free: rnd() * Math.PI * 2,
    pulled: rnd() * Math.PI * 2,
  });
  const hands = [hand(), hand()];
  return (seat: SeatIndex, step: number, v: RenderSeat): InputFrame => {
    const out = hands.map((h, i) => {
      const holding = (step + h.phase) % h.cycle < h.cycle * h.hold;
      const gripped = i === 0 ? v.gripL : v.gripR;
      const a = gripped ? h.pulled : h.free;
      return { aim: { x: Math.cos(a), y: Math.sin(a) }, grip: holding ? 1 : 0 };
    });
    return input(seat, step + 1, out[0].aim, out[1].aim, out[0].grip, out[1].grip);
  };
}

describe('w1-01 plank dead end', () => {
  it('REPRO: without the lift, nothing a player does gets back up from the plank', () => {
    const spawns: Vec2[] = [
      { x: 700, y: 1100 },
      { x: 820, y: 1100 },
      { x: 980, y: 1100 },
    ];
    let escaped = 0;
    let highest = Infinity;
    let trials = 0;
    for (const at of spawns) {
      for (let seed = 1; seed <= 40; seed++) {
        trials++;
        const policy = flail(seed);
        run(simFor(withSpawn(LEGACY, at), 1), 1, 600, (s, st, v) => {
          // Walking off the plank into the sea is a death and a respawn at spawn,
          // not an escape — ignore anything that has left the plank's span.
          if (v.head.y < 1140 && v.head.x > 640 && v.head.x < 1060) {
            highest = Math.min(highest, v.head.y);
          }
          if (onMiddlePier(v)) escaped++;
          return policy(s, st, v);
        });
      }
    }
    expect(trials).toBe(120);
    expect(escaped, 'a flailing player reached the middle pier from the plank').toBe(0);
    // The head never gets meaningfully above where it spawned (1100) in any trial.
    expect(highest).toBeGreaterThan(1050);
  });

  it('REPRO control: the same flail policy is not simply broken (it moves around)', () => {
    let spread = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(simFor(withSpawn(LEGACY, { x: 820, y: 1100 }), 1), 1, 600, flail(seed));
      spread = Math.max(spread, r.maxX[0] - r.minX[0]);
    }
    expect(spread).toBeGreaterThan(40);
  });

  it.each([
    ['dropped into the gap from the start pier (missed swing)', { x: 760, y: 790 }, 0],
    ['landed on the plank left of the lift', { x: 680, y: 1100 }, 1],
    ['landed on the plank under the middle pier', { x: 990, y: 1100 }, -1],
    ['at rest on the lift', { x: 820, y: 1100 }, 0],
  ] as [string, Vec2, 0 | 1 | -1][])('FIX: %s -> back on the middle pier', (_name, at, dir) => {
    const sim = simFor(withSpawn(LEVEL, at), 1);
    let won = -1;
    let prevX = at.x;
    let stopped = false;
    let calm = 0;
    let braking = 0;
    const res = run(sim, 1, 2400, (s, st, v) => {
      if (won < 0 && onMiddlePier(v)) won = st;
      // Crawl to the lift, stop on it (limp, like a player who lets go) and ride.
      // Once it tops out at the pier, crawl right.
      if (v.head.y < PIER_TOP + 20) return crawler(1)(s, st, v);
      const arrived = dir === 1 ? v.head.x >= 790 : dir === -1 ? v.head.x <= 885 : true;
      if (!arrived) return crawler(dir as 1 | -1)(s, st, v);
      const vx = v.head.x - prevX;
      prevX = v.head.x;
      // Still rolling after the crawl: brake like a player would, by holding the
      // floor until the head is still, then let go and ride.
      if (dir !== 0 && !stopped) {
        braking++;
        calm = Math.abs(vx) < 0.3 ? calm + 1 : 0;
        if (calm >= 6 || braking > 30) stopped = true;
        else return input(s, st + 1, { x: 0, y: 1 }, { x: 0, y: 1 }, 1, 1);
      }
      // Riding: lean against any drift so the round head stays over the platform.
      const lean = v.head.x < 800 ? { x: 1, y: 0 } : v.head.x > 840 ? { x: -1, y: 0 } : { x: 0, y: 0 };
      return input(s, st + 1, lean, lean, 0, 0);
    });
    expect(won, 'never reached the middle pier from the plank').toBeGreaterThanOrEqual(0);
    expect(res.deaths).toBe(0);
  });
});

describe('w1-01 retune and objectives are intact', () => {
  it('keeps the earlier bar/pier retune', () => {
    const swings = LEVEL.props.filter((p) => p.kind === 'swing');
    expect(swings.map((s) => (s as { length: number }).length)).toEqual([530, 530]);
    const middle = LEVEL.geometry.find(
      (g) => g.shape.kind === 'rect' && g.shape.y === 860 && g.shape.w === 710,
    );
    expect(middle && middle.shape.kind === 'rect' && middle.shape.x).toBe(900);
  });

  it('lift is flush with the plank at the bottom and the pier at the top, clear of the pier edge', () => {
    const lift = LEVEL.props.find((p) => p.id === 'plank-lift');
    expect(lift?.kind).toBe('platformMoving');
    if (lift?.kind !== 'platformMoving') return;
    const bottom = lift.path[0];
    const top = lift.path[lift.path.length - 1];
    expect(bottom.y - lift.size.y / 2).toBe(PLANK_TOP);
    expect(top.y - lift.size.y / 2).toBe(PIER_TOP);
    expect(top.x + lift.size.x / 2).toBeLessThan(900);
  });

  it('keeps objective ids, order and bitmask mapping (progress/objectives.ts)', () => {
    const ids = LEVEL.objectives.map((o) => o.id);
    expect(ids).toEqual(['w1-01-clock', 'w1-01-flawless', 'w1-01-photo']);
    expect(objectiveIdsToBitmask(ids, LEVEL.objectives)).toBe(0b111);
    expect(objectiveIdsToBitmask(['w1-01-photo'], LEVEL.objectives)).toBe(0b100);
  });

  it('keeps all geometry inside the level bounds', () => {
    const b = LEVEL.bounds;
    for (const g of LEVEL.geometry) {
      if (g.shape.kind !== 'rect') continue;
      expect(g.shape.x).toBeGreaterThanOrEqual(b.x);
      expect(g.shape.x + g.shape.w).toBeLessThanOrEqual(b.x + b.w);
      expect(g.shape.y + g.shape.h).toBeLessThanOrEqual(b.y + b.h);
    }
  });

  it('the level still finishes and still awards clock + flawless through the engine', () => {
    const sim = simFor(withSpawn(LEVEL, { x: 2650, y: 900 }), 1);
    const res = run(sim, 1, 300, (s, st) => input(s, st + 1, unit(0, 1), unit(0, 1), 0, 0));
    const finish = res.events.find((e) => e.kind === 'finish') as
      | { objectives: string[] }
      | undefined;
    expect(finish, 'standing on the goal pier did not finish the level').toBeDefined();
    expect(finish!.objectives).toContain('w1-01-clock');
    expect(finish!.objectives).toContain('w1-01-flawless');
    expect(objectiveIdsToBitmask(finish!.objectives, LEVEL.objectives) & 0b011).toBe(0b011);
  });
});
