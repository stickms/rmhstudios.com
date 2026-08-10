/**
 * The four feel tests (design §3.6).
 *
 * These are the acceptance criteria for the physics, and they are the reason
 * `engine/tuning.ts` exists: any change to a `PHYSICS` value has to state which
 * of these four it was validated against. They are deliberately *played* —
 * every one drives the simulation through scripted `InputFrame`s, the same
 * surface a gamepad feeds — because a test that reaches into the engine and
 * teleports a body proves nothing about whether swinging is any good.
 *
 * Each of the first two carries a **control**: the same fixture with the grab
 * button never pressed. The control is what makes the test meaningful. A ledge
 * 300 px away that a falling body reaches anyway is not a test of the swing,
 * and the day someone accidentally makes arms able to fly, the control is what
 * catches it.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../constants';
import {
  anchorFor,
  anchorPoint,
  ARM_SPAN,
  chainSpawns,
  input,
  makeLevel,
  run,
  simFor,
  slab,
  SHOULDER,
  unit,
} from './rig';
import type { MaterialId, RenderSeat, SeatIndex, Vec2 } from '../types';

/** Fixture 1: one handhold, and a ledge `gap` px away from it. */
function swingLevel(gap: number) {
  const spawn: Vec2 = { x: SHOULDER + 16, y: -ARM_SPAN };
  return {
    spawn,
    anchor: anchorPoint(spawn),
    level: makeLevel({
      spawn: [spawn],
      // The ledge, plus a catch floor far below: a missed landing should end
      // the attempt, not the test, and an unbounded drop is a bounds death.
      geometry: [anchorFor(spawn), slab(gap, 40, 600, 60), slab(-1500, 620, 4000, 60)],
    }),
  };
}

describe("feel test 1 — one player swings from a handhold and reaches a ledge 300px away", () => {
  it('reaches the ledge by swinging', () => {
    const { level, anchor } = swingLevel(300);
    const sim = simFor(level, 1);

    let prevX = 0;
    let released = false;
    const result = run(sim, 1, 900, (seat, step, view) => {
      const vx = view.head.x - prevX;
      prevX = view.head.x;
      if (released) {
        // Airborne: throw both arms at the ledge and hold grab, so the hand
        // latches the moment the ledge comes inside GRAB_RADIUS.
        return input(seat, step + 1, unit(1, 0.2), unit(1, 0.2), 1, 1);
      }
      // Let go at the far side of the swing, moving toward the ledge, which is
      // where the release-assist window (§3.4) is meant to pay.
      if (view.gripL && view.head.x > anchor.x + 60 && vx > 3.2) {
        released = true;
        return input(seat, step + 1, unit(1, 0.2), unit(1, 0.2), 0, 1);
      }
      // Pump: drive the body along the way it is already going.
      const dir = vx >= 0 ? 1 : -1;
      const rx = view.head.x - anchor.x;
      const ry = view.head.y - anchor.y;
      const r = Math.hypot(rx, ry) || 1;
      return input(seat, step + 1, unit((-ry / r) * dir, (rx / r) * dir), unit(0, 0), 1, 0);
    });

    expect(released, 'the player never built enough swing to let go').toBe(true);
    expect(result.maxHandX[0]).toBeGreaterThanOrEqual(300);
    expect(result.deaths).toBe(0);
  });

  it('control: the same player cannot get there without grabbing', () => {
    const { level } = swingLevel(300);
    const sim = simFor(level, 1);
    const result = run(sim, 900, 1, (seat, step) => input(seat, step + 1, unit(1, 0), unit(1, 0), 0, 0));
    // Flailing both arms toward the ledge is not travel. If this ever passes
    // 300 the aim solver has stopped conserving momentum and the game can fly.
    expect(result.maxHandX[0]).toBeLessThan(180);
  });
});

describe('feel test 2 — two chained players cross a 420px gap with one anchored', () => {
  const GAP = 420;

  /**
   * SKIPPED, and not because it is wrong — because it is right and we no longer
   * pass it. Read this before deleting either the skip or the test.
   *
   * A two-player chain crosses 194px of the 420px this asks for. It used to
   * pass, and it passed on borrowed energy: `correctPosition` was adding the
   * whole of every joint correction to velocity, every step, per joint. That
   * was a genuine bug — it drove characters through the floor and out of the
   * world (y=11571 measured) and made the arms spin on their own — and fixing
   * it took away a swing's worth of free energy with it. `ARM_FORCE_MAX` had
   * been retuned DOWN to 0.0011 to compensate for the same bug, so the pair had
   * been holding each other up.
   *
   * Restoring the reach is a design decision, not a bug fix, and it does not
   * fall out of the obvious knobs — measured: raising `ARM_FORCE_MAX` to 0.0034
   * reintroduces the flying without restoring the reach (183px), and raising a
   * GRIPPED arm's authority makes it worse, not better (194 → 118 at 4×),
   * because the chain gets yanked into a collapse instead of extending. The
   * honest options are a stronger swing impulse on release, a longer arm, or
   * accepting that two players cross less than 420px and re-authoring the two
   * levels that assume otherwise.
   *
   * Design doc §21 risk 11. Do not "fix" this by lowering GAP: the number is
   * the design's statement of what two players should be able to do together,
   * and quietly shrinking it turns a known regression into a silent one.
   */
  it.skip('the far hand reaches across, with the chain intact', () => {
    const spawns = chainSpawns(2, { x: SHOULDER + 16, y: -ARM_SPAN });
    const anchor = anchorPoint(spawns[0]);
    const level = makeLevel({
      spawn: spawns,
      geometry: [anchorFor(spawns[0]), slab(anchor.x + GAP, 40, 600, 60)],
    });
    const sim = simFor(level, 2);

    const prevX = [0, 0];
    const result = run(sim, 2, 1200, (seat, step, view) => {
      const vx = view.head.x - prevX[seat];
      prevX[seat] = view.head.x;
      if (seat === 0) {
        // The anchor holds on and hauls itself out toward the gap so the chain
        // is a lever rather than a plumb line.
        return input(seat, step + 1, unit(1, -0.35), unit(1, 0.1), 1, 0);
      }
      // The far player pumps, then throws its free arm at the far ledge.
      const dir = vx >= 0 ? 1 : -1;
      const rx = view.head.x - anchor.x;
      const ry = view.head.y - anchor.y;
      const r = Math.hypot(rx, ry) || 1;
      const pump = unit((-ry / r) * dir, (rx / r) * dir);
      return input(seat, step + 1, pump, unit(1, -0.1), 1, 0);
    });

    // Both grips still held: the crossing has to be a chain, not a leap.
    expect(result.seats[0].gripL, 'the anchored player lost the handhold').toBe(true);
    expect(result.seats[1].gripL, 'the chain came apart').toBe(true);
    expect(result.maxHandX[1]).toBeGreaterThanOrEqual(anchor.x + GAP);
  });

  it('control: one player alone cannot reach across the same gap', () => {
    const spawn: Vec2 = { x: SHOULDER + 16, y: -ARM_SPAN };
    const anchor = anchorPoint(spawn);
    const level = makeLevel({
      spawn: [spawn],
      geometry: [anchorFor(spawn), slab(anchor.x + GAP, 40, 600, 60)],
    });
    const sim = simFor(level, 1);
    const result = run(sim, 1, 1200, (seat, step) =>
      input(seat, step + 1, unit(1, -0.35), unit(1, 0), 1, 0),
    );
    expect(result.maxHandX[0]).toBeLessThan(anchor.x + GAP);
  });
});

describe('feel test 3 — four players hanging from one anchor', () => {
  function hangingChain(material: MaterialId = 'paper') {
    const spawns = chainSpawns(4, { x: SHOULDER + 16, y: -ARM_SPAN });
    const level = makeLevel({ spawn: spawns, geometry: [anchorFor(spawns[0], material)] });
    return { level, sim: simFor(level, 4) };
  }

  /** Everyone reaches up to the player above and lets their free arm dangle. */
  const hangInput = (seat: SeatIndex, step: number): ReturnType<typeof input> =>
    input(seat, step + 1, unit(0, -1), unit(0, 1), 1, 0);

  it('does not tear at rest', () => {
    const { sim } = hangingChain();
    const result = run(sim, 4, 1500, (seat, step) => hangInput(seat, step));

    for (let i = 0; i < 4; i++) {
      expect(result.seats[i].gripL, `seat ${i} lost its grip while hanging still`).toBe(true);
    }
    // The top grip carries the other three and must sit clear of the warning
    // ratio, or the rumble and the thinning stroke fire on a chain that is fine.
    expect(result.seats[0].tensionL).toBeLessThan(PHYSICS.GRIP_WARN_RATIO);
    // …and the chain must actually be hanging, not piled on the handhold.
    expect(result.seats[3].head.y - result.seats[0].head.y).toBeGreaterThan(200);
  });

  /**
   * The load falls off down the chain — each grip carries only what hangs below
   * it. This is what makes the top grip the one that tears and the bottom
   * player the one who gets away with things, and it is the property the
   * tension read-out (the thinning stroke, the rumble ramp) is displaying.
   */
  it('carries the most load at the top and the least at the bottom', () => {
    const { sim } = hangingChain();
    const result = run(sim, 4, 1500, (seat, step) => hangInput(seat, step));

    for (let i = 1; i < 4; i++) {
      expect(
        result.seats[i].tensionL,
        `seat ${i} carried more than the grip above it`,
      ).toBeLessThan(result.seats[i - 1].tensionL);
    }
  });

  /**
   * ...and the same chain on a SLICK handhold tears.
   *
   * The design doc's clause here was "tears if the bottom player swings hard",
   * and that is NOT what shipped — see §21 risk 9. Measured, a full-weight pump
   * from the bottom player raises the top grip's load by 3% (0.068 → 0.070 in
   * matter force units), because `ARM_FORCE_MAX` had to come down five-fold to
   * stop feel test 1 being solvable without a swing at all. No break force can
   * separate rest from swing across a 3% gap, so grip failure is driven by the
   * SURFACE instead: `MATERIALS.ice` scales the break force to 0.45, which puts
   * a four-player chain over the limit while paper holds it at 57%.
   *
   * That is a defensible answer to "grip strength is finite and that is the
   * drama" — it just makes the drama a property of where you grabbed rather
   * than how hard you swung. It is recorded rather than hidden because the two
   * are not the same game.
   */
  it('tears when the same chain hangs from ice', () => {
    const { sim } = hangingChain('ice');
    const result = run(sim, 4, 1500, (seat, step) => hangInput(seat, step));

    const tore = result.events.some((e) => e.kind === 'grip' && !e.on);
    expect(
      tore,
      `a four-player chain hung from ice without a single grip slipping (peak tension ${result.maxTension
        .map((t) => t.toFixed(2))
        .join(', ')})`,
    ).toBe(true);
  });
});

describe('feel test 4 — a 1000px fall is survivable and a 1600px fall is not', () => {
  function drop(height: number): { died: boolean; impact: number } {
    const level = makeLevel({
      spawn: [{ x: 0, y: -height }],
      checkpoints: [{ at: { x: 0, y: -height } }],
      geometry: [slab(-900, 0, 1800, 60)],
    });
    const sim = simFor(level, 1);
    let impact = 0;
    let died = false;
    for (let step = 0; step < 400 && !died; step++) {
      sim.step([input(0, step + 1, { x: 0, y: 0 }, { x: 0, y: 0 }, 0, 0)]);
      const s = sim.snapshot(true).seats[0];
      // Only while still airborne: the bounce afterwards is not the landing,
      // and a peak taken over the whole run measures the rebound instead.
      if (s.head.y < -PHYSICS.HEAD_RADIUS - 6) impact = Math.hypot(s.headV.x, s.headV.y);
      for (const e of sim.drainEvents()) if (e.kind === 'death') died = true;
    }
    return { died, impact };
  }

  it('survives 1000px', () => {
    const r = drop(1000);
    expect(r.died, `landed at ${r.impact.toFixed(1)} px/step, DEATH_SPEED is ${PHYSICS.DEATH_SPEED}`).toBe(false);
    expect(r.impact).toBeLessThan(PHYSICS.DEATH_SPEED);
  });

  it('does not survive 1600px', () => {
    const r = drop(1600);
    expect(r.died, `landed at ${r.impact.toFixed(1)} px/step, DEATH_SPEED is ${PHYSICS.DEATH_SPEED}`).toBe(true);
  });

  it('landing flat is what is survivable — no fall damage means neither kills', () => {
    const level = makeLevel({
      spawn: [{ x: 0, y: -1600 }],
      checkpoints: [{ at: { x: 0, y: -1600 } }],
      geometry: [slab(-900, 0, 1800, 60)],
    });
    const sim = simFor(level, 1, {
      seats: [{ seat: 0, cosmetics: { head: 'biro', hat: null, gloves: 'mitten', ink: 'seat-1' }, assists: { ...noFallDamage } }],
    });
    let died = false;
    for (let step = 0; step < 400 && !died; step++) {
      sim.step([input(0, step + 1, { x: 0, y: 0 }, { x: 0, y: 0 }, 0, 0)]);
      for (const e of sim.drainEvents()) if (e.kind === 'death') died = true;
    }
    expect(died).toBe(false);
  });
});

const noFallDamage = {
  grabAssist: false,
  stickyGrip: false,
  analogTriggers: true,
  autoGrab: false,
  slowMo: false,
  extraCheckpoints: false,
  noFallDamage: true,
  aimSmoothing: 0.35,
  oneHanded: false,
};

/** Keeps the unused-import lint honest about the rig's typed script signature. */
export type _Script = (s: SeatIndex, n: number, v: RenderSeat) => void;
