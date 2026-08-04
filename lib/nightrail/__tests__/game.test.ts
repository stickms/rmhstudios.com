/**
 * Nightrail — simulation tests.
 *
 * The sim is deliberately free of React, three.js and the DOM, and this file
 * is the payoff: every rule in the game can be asserted by stepping a run and
 * reading the state, with no canvas and no renderer anywhere in sight.
 *
 * The tests that matter most here are the ones about *fairness*, because they
 * are the ones a level edit can silently break: that every authored level is
 * completable, that no hazard blocks every rail at once, and that a fixed-step
 * sim gives the same run regardless of frame rate.
 */

import { describe, expect, it } from 'vitest';

import { createRun, emptyInput, runProgress, stepRun, type RunState } from '../game';
import { LEVELS, LEVEL_ORDER } from '../levels';
import { bakeTrack, railOffset, sampleTrack, trackLength } from '../track';
import {
  COUNTDOWN_SECONDS,
  GRAVITY,
  JUMP_MAX_VELOCITY,
  LANDING_TOLERANCE,
  MAX_MULTIPLIER,
  RAIL_SPACING,
  TRICKS,
} from '../constants';
import type { InputState, LevelConfig, TrickDirection } from '../types';

/**
 * Step a run past its countdown so tests can act on a live train.
 *
 * Frame by frame rather than in one big call on purpose: `stepRun` clamps a
 * single frame's delta and caps how many physics steps it will catch up, so
 * asking it for three seconds at once advances a fraction of that. Which is
 * the behaviour we want from a stalled tab, and a trap for a test helper.
 */
function beginRun(level: LevelConfig): RunState {
  const run = createRun(level);
  const idle = emptyInput();
  for (let i = 0; i < 60 * (COUNTDOWN_SECONDS + 1) && run.phase === 'countdown'; i += 1) {
    stepRun(run, idle, 1 / 60);
  }
  return run;
}

/**
 * Run `seconds` of simulation at a given frame rate with a fixed input.
 *
 * The frame count is computed once as an integer rather than accumulated in
 * the loop condition, so two different frame rates cover the same wall time
 * instead of differing by however the float accumulation happened to land.
 */
function advance(run: RunState, input: InputState, seconds: number, fps = 60): void {
  const frame = 1 / fps;
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i += 1) {
    stepRun(run, input, frame);
    if (run.phase === 'crashed' || run.phase === 'runComplete') return;
  }
}

describe('track geometry', () => {
  it('measures a track as the sum of its segments', () => {
    const segments = [
      { length: 100, curvature: 0, grade: 0, bank: 0 },
      { length: 250, curvature: 0.01, grade: 0.02, bank: 0.12 },
    ];
    expect(trackLength(segments)).toBe(350);
  });

  it('reads curvature from the segment the distance falls in, and clamps past the end', () => {
    const segments = [
      { length: 100, curvature: 0, grade: 0, bank: 0 },
      { length: 100, curvature: 0.02, grade: 0, bank: 0.2 },
    ];
    expect(sampleTrack(segments, 50).curvature).toBe(0);
    expect(sampleTrack(segments, 150).curvature).toBe(0.02);
    // Past the finish the last segment keeps applying, so the run-out after
    // the line is still well-defined rather than snapping to zero curvature.
    expect(sampleTrack(segments, 9999).curvature).toBe(0.02);
  });

  it('bends the baked centre line in the direction of the curvature', () => {
    const straight = bakeTrack([{ length: 200, curvature: 0, grade: 0, bank: 0 }]);
    const last = straight[straight.length - 1];
    expect(Math.abs(last.x)).toBeLessThan(0.001);
    expect(last.z).toBeGreaterThan(190);

    const right = bakeTrack([{ length: 200, curvature: 0.01, grade: 0, bank: 0 }]);
    // Positive curvature is a right-hander, so the line must end east of centre.
    expect(right[right.length - 1].x).toBeGreaterThan(1);
  });

  it('spaces rails symmetrically about the centre line', () => {
    expect(railOffset(1, 3, RAIL_SPACING)).toBe(0);
    expect(railOffset(0, 3, RAIL_SPACING)).toBeCloseTo(-RAIL_SPACING);
    expect(railOffset(2, 3, RAIL_SPACING)).toBeCloseTo(RAIL_SPACING);
    // An even rail count straddles the centre rather than sitting on it.
    expect(railOffset(1, 4, RAIL_SPACING)).toBeCloseTo(-RAIL_SPACING / 2);
  });
});

describe('level data', () => {
  it('ships every level named in the order', () => {
    for (const id of LEVEL_ORDER) expect(LEVELS[id]).toBeDefined();
    expect(LEVEL_ORDER.length).toBeGreaterThanOrEqual(3);
  });

  it('never places a feature past the end of its own track', () => {
    for (const id of LEVEL_ORDER) {
      const level = LEVELS[id];
      const length = trackLength(level.segments);
      for (const feature of level.features) {
        expect(
          feature.s + feature.length,
          `${level.name}: ${feature.kind} at ${feature.s} runs past the ${length}m finish`,
        ).toBeLessThan(length);
        expect(feature.s).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never blocks every rail at once', () => {
    // The one rule that turns a hard level into an unfair one. Full-width
    // `ceiling` features are exempt: they are cleared by staying grounded, not
    // by switching rails, so blocking every rail is exactly what they are for.
    for (const id of LEVEL_ORDER) {
      const level = LEVELS[id];
      const blocking = level.features.filter(
        (f) => f.kind === 'gap' || f.kind === 'barrier' || f.kind === 'freight',
      );
      for (const feature of blocking) {
        expect(
          feature.rails.length,
          `${level.name}: ${feature.kind} at ${feature.s} occupies every rail`,
        ).toBeGreaterThan(0);
        expect(feature.rails.length).toBeLessThan(level.rails);
        for (const rail of feature.rails) {
          expect(rail).toBeGreaterThanOrEqual(0);
          expect(rail).toBeLessThan(level.rails);
        }
      }
    }
  });

  it('gives every level a coherent difficulty and rank curve', () => {
    for (const id of LEVEL_ORDER) {
      const level = LEVELS[id];
      expect(level.maxSpeed).toBeGreaterThan(level.targetSpeed);
      expect(level.cargo).toBeGreaterThan(0);
      expect(level.parTime).toBeGreaterThan(0);
      const [c, b, a, s] = level.rankThresholds;
      expect(c).toBeLessThan(b);
      expect(b).toBeLessThan(a);
      expect(a).toBeLessThan(s);
    }
  });

  it('keeps ceilings clear of the train roof so a grounded run always fits', () => {
    // A ceiling lower than the train would be impassable by any input at all.
    // This caught a real bug: the collision once measured the train's body
    // rather than how far it had left the railhead.
    for (const id of LEVEL_ORDER) {
      for (const feature of LEVELS[id].features) {
        if (feature.kind !== 'ceiling') continue;
        expect(feature.clearance, `${LEVELS[id].name}: ceiling at ${feature.s}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('run lifecycle', () => {
  it('holds the run in countdown, then starts it', () => {
    const run = createRun(LEVELS[LEVEL_ORDER[0]]);
    expect(run.phase).toBe('countdown');
    advance(run, emptyInput(), COUNTDOWN_SECONDS - 0.5);
    expect(run.phase).toBe('countdown');
    advance(run, emptyInput(), 1);
    expect(run.phase).toBe('playing');
    // Racing time excludes the countdown — the clock starts when you do.
    expect(run.elapsed).toBeLessThan(COUNTDOWN_SECONDS);
  });

  it('freezes the run while paused and does not bank the pause as elapsed time', () => {
    const run = beginRun(LEVELS[LEVEL_ORDER[0]]);
    advance(run, emptyInput(), 1);
    const { s } = run.train;
    const elapsed = run.elapsed;

    run.phase = 'paused';
    advance(run, emptyInput(), 5);
    expect(run.train.s).toBe(s);
    expect(run.elapsed).toBe(elapsed);

    run.phase = 'playing';
    advance(run, emptyInput(), 0.5);
    expect(run.train.s).toBeGreaterThan(s);
  });

  it('accelerates on its own — the train is self-propelling', () => {
    const run = beginRun(LEVELS[LEVEL_ORDER[0]]);
    const start = run.train.speed;
    advance(run, emptyInput(), 2);
    expect(run.train.speed).toBeGreaterThan(start);
    expect(run.train.speed).toBeLessThanOrEqual(run.level.maxSpeed * 1.4);
  });

  it('reports progress along the track as a 0→1 fraction', () => {
    const run = beginRun(LEVELS[LEVEL_ORDER[0]]);
    expect(runProgress(run)).toBeGreaterThanOrEqual(0);
    advance(run, emptyInput(), 3);
    expect(runProgress(run)).toBeGreaterThan(0);
    expect(runProgress(run)).toBeLessThanOrEqual(1);
  });
});

describe('rail switching', () => {
  it('slides to the neighbouring rail and stops at the edges', () => {
    const level = LEVELS[LEVEL_ORDER[0]];
    const run = beginRun(level);
    const input = emptyInput();
    const startRail = run.train.rail;

    input.left = true;
    stepRun(run, input, 1 / 60);
    expect(run.train.rail).toBe(startRail - 1);

    // Held, not repeated: switching is edge-triggered, so holding left does
    // not walk the train off the side of the track one rail per frame.
    advance(run, input, 0.5);
    expect(run.train.rail).toBe(startRail - 1);

    // Tapping repeatedly does walk it across, and it stops at rail 0.
    for (let i = 0; i < level.rails + 2; i += 1) {
      stepRun(run, emptyInput(), 1 / 60);
      stepRun(run, { ...emptyInput(), left: true }, 1 / 60);
    }
    expect(run.train.rail).toBe(0);
  });

  it('eases the lateral offset toward the target rail rather than snapping', () => {
    const run = beginRun(LEVELS[LEVEL_ORDER[0]]);
    const before = run.train.lateral;
    stepRun(run, { ...emptyInput(), left: true }, 1 / 60);
    // One frame in, the switch has started but is nowhere near finished.
    expect(run.train.switchProgress).toBeLessThan(1);
    expect(Math.abs(run.train.lateral - before)).toBeLessThan(RAIL_SPACING);
    advance(run, emptyInput(), 0.5);
    expect(run.train.switchProgress).toBe(1);
    expect(run.train.lateral).toBeCloseTo(
      railOffset(run.train.rail, run.level.rails, RAIL_SPACING),
    );
  });
});

describe('drift', () => {
  /** A track that is one long right-hand bend, so drifting is always available. */
  const bendLevel = (): LevelConfig => ({
    ...LEVELS[LEVEL_ORDER[0]],
    segments: [{ length: 6000, curvature: 0.012, grade: 0, bank: 0.14 }],
    features: [],
  });

  it('charges through a bend and pays the charge out as boost on release', () => {
    const run = beginRun(bendLevel());
    const drift = { ...emptyInput(), drift: true };
    advance(run, drift, 1.2);

    expect(run.train.mode).toBe('drifting');
    expect(run.train.driftCharge).toBeGreaterThan(0.5);

    const charge = run.train.driftCharge;
    stepRun(run, emptyInput(), 1 / 60);
    expect(run.train.boostTime).toBeGreaterThan(0);
    expect(run.train.driftCharge).toBe(0);
    expect(charge).toBeGreaterThan(0);
    // A corner well taken pays twice: once in boost, once into the combo.
    expect(run.combo.pending).toBeGreaterThan(0);
    expect(run.combo.multiplier).toBeGreaterThan(1);
  });

  it('pays nothing for a drift held on a straight', () => {
    const run = beginRun({
      ...LEVELS[LEVEL_ORDER[0]],
      segments: [{ length: 6000, curvature: 0, grade: 0, bank: 0 }],
      features: [],
    });
    advance(run, { ...emptyInput(), drift: true }, 1.5);
    expect(run.train.driftCharge).toBe(0);
    stepRun(run, emptyInput(), 1 / 60);
    expect(run.train.boostTime).toBe(0);
  });

  it('scrubs less speed through a bend when the bend is drifted', () => {
    const flat = beginRun(bendLevel());
    const drifted = beginRun(bendLevel());
    advance(flat, emptyInput(), 3);
    advance(drifted, { ...emptyInput(), drift: true }, 3);
    // This is the whole game in one assertion: the corner costs you speed
    // unless you drift it.
    expect(drifted.train.speed).toBeGreaterThan(flat.train.speed);
  });

  it('punishes drifting against the bend', () => {
    // A short left kink, then hard right for the rest of the track. The kink
    // is only long enough for the drift to commit left — everything measured
    // afterwards happens in the right-hander, where that lean is wrong.
    const sChicane = (): LevelConfig => ({
      ...LEVELS[LEVEL_ORDER[0]],
      segments: [
        { length: 60, curvature: -0.02, grade: 0, bank: -0.24 },
        { length: 6000, curvature: 0.02, grade: 0, bank: 0.24 },
      ],
      features: [],
    });

    const wrongWay = beginRun(sChicane());
    const drift = { ...emptyInput(), drift: true };
    advance(wrongWay, drift, 0.4);
    expect(wrongWay.train.driftSign).toBe(-1);
    advance(wrongWay, drift, 6);
    expect(wrongWay.train.driftSign).toBe(-1);

    // Compared against simply not drifting over the same track, holding the
    // wrong lean has to be the worse option — otherwise the optimal play would
    // be to hold the drift button down for the entire run.
    const noDrift = beginRun(sChicane());
    advance(noDrift, emptyInput(), 6.4);
    expect(wrongWay.train.speed).toBeLessThan(noDrift.train.speed);
  });
});

describe('jumping and tricks', () => {
  const flatLevel = (): LevelConfig => ({
    ...LEVELS[LEVEL_ORDER[0]],
    segments: [{ length: 8000, curvature: 0, grade: 0, bank: 0 }],
    features: [],
  });

  it('leaves the ground on release and comes back down', () => {
    const run = beginRun(flatLevel());
    advance(run, { ...emptyInput(), jump: true }, 0.5);
    expect(run.train.height).toBe(0);
    expect(run.train.jumpCharge).toBeGreaterThan(0);

    stepRun(run, emptyInput(), 1 / 60);
    expect(run.train.mode).toBe('airborne');
    expect(run.train.vy).toBeGreaterThan(0);

    advance(run, emptyInput(), 3);
    expect(run.train.height).toBe(0);
    expect(run.train.mode).toBe('rolling');
  });

  it('jumps higher when the button is charged', () => {
    const hop = beginRun(flatLevel());
    stepRun(hop, { ...emptyInput(), jump: true }, 1 / 120);
    stepRun(hop, emptyInput(), 1 / 120);
    const hopVelocity = hop.train.vy;

    const charged = beginRun(flatLevel());
    advance(charged, { ...emptyInput(), jump: true }, 0.6);
    stepRun(charged, emptyInput(), 1 / 120);
    expect(charged.train.vy).toBeGreaterThan(hopVelocity);
  });

  it('banks a completed trick into the combo and raises the multiplier', () => {
    const run = beginRun(flatLevel());
    advance(run, { ...emptyInput(), jump: true }, 0.6);
    stepRun(run, emptyInput(), 1 / 120);
    expect(run.train.mode).toBe('airborne');

    stepRun(run, { ...emptyInput(), trick: 'up' }, 1 / 120);
    expect(run.train.trick?.name).toBe(TRICKS.up.name);

    // Let the rotation finish while still in the air.
    for (let i = 0; i < 120 && run.train.trick; i += 1) stepRun(run, emptyInput(), 1 / 240);
    expect(run.train.trick).toBeNull();
    expect(run.combo.pending).toBeGreaterThanOrEqual(TRICKS.up.points);
    expect(run.combo.multiplier).toBeGreaterThan(1);
    expect(run.stats.tricksLanded).toBe(1);
  });

  it('drops the combo when a rotation is still unfinished at touchdown', () => {
    const run = beginRun(flatLevel());
    // A tapped hop is far too short for the longest trick in the table.
    stepRun(run, { ...emptyInput(), jump: true }, 1 / 120);
    stepRun(run, emptyInput(), 1 / 120);
    stepRun(run, { ...emptyInput(), trick: 'down' }, 1 / 120);
    expect(run.train.trick?.name).toBe(TRICKS.down.name);

    advance(run, emptyInput(), 3);
    expect(run.train.height).toBe(0);
    expect(run.train.trick).toBeNull();
    expect(run.combo.pending).toBe(0);
    expect(run.combo.multiplier).toBe(1);
    // The bail costs points, never cargo — overreaching is punished in score.
    expect(run.train.cargo).toBe(run.train.maxCargo);
  });

  it('is worth less to repeat a trick than to find a new one', () => {
    const run = beginRun(flatLevel());
    advance(run, { ...emptyInput(), jump: true }, 0.6);
    stepRun(run, emptyInput(), 1 / 240);

    const land = (direction: TrickDirection): number => {
      const before = run.combo.pending;
      stepRun(run, { ...emptyInput(), trick: direction }, 1 / 240);
      for (let i = 0; i < 400 && run.train.trick; i += 1) stepRun(run, emptyInput(), 1 / 240);
      return run.combo.pending - before;
    };

    const first = land('upLeft');
    const second = land('upLeft');
    expect(first).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
  });

  it('refuses to start a second trick over an unfinished one', () => {
    const run = beginRun(flatLevel());
    advance(run, { ...emptyInput(), jump: true }, 0.6);
    stepRun(run, emptyInput(), 1 / 240);
    stepRun(run, { ...emptyInput(), trick: 'down' }, 1 / 240);
    const first = run.train.trick?.name;
    stepRun(run, { ...emptyInput(), trick: 'up' }, 1 / 240);
    expect(run.train.trick?.name).toBe(first);
  });

  it('keeps every trick finishable inside a full-charge jump', () => {
    // A trick nobody can land is a trick nobody will ever pick. Asserted from
    // the constants rather than from a simulated jump, because this is a claim
    // about the tuning itself: the longest rotation in the table has to fit
    // inside the airtime the biggest jump buys, with room to spare.
    const airtime = (2 * JUMP_MAX_VELOCITY) / GRAVITY;
    const longest = Math.max(...Object.values(TRICKS).map((trick) => trick.duration));
    expect(airtime).toBeGreaterThan(longest * 1.2);
  });

  it('caps the multiplier', () => {
    const run = beginRun(flatLevel());
    run.combo.multiplier = MAX_MULTIPLIER;
    run.train.mode = 'grinding';
    advance(run, emptyInput(), 2);
    expect(run.combo.multiplier).toBeLessThanOrEqual(MAX_MULTIPLIER);
  });

  it('describes every trick in the table with a finite reward', () => {
    for (const trick of Object.values(TRICKS)) {
      expect(trick.points).toBeGreaterThan(0);
      expect(trick.duration).toBeGreaterThan(0);
      const rotation =
        Math.abs(trick.spin.pitch) + Math.abs(trick.spin.yaw) + Math.abs(trick.spin.roll);
      // Every trick must actually rotate, or the landing check is meaningless.
      expect(rotation).toBeGreaterThan(LANDING_TOLERANCE);
    }
  });
});

describe('hazards and cargo', () => {
  const withFeature = (kind: 'barrier' | 'gap' | 'ceiling', extra = {}): LevelConfig => ({
    ...LEVELS[LEVEL_ORDER[0]],
    rails: 3,
    segments: [{ length: 4000, curvature: 0, grade: 0, bank: 0 }],
    features: [
      {
        id: 1,
        kind,
        s: 200,
        length: 30,
        rails: kind === 'ceiling' ? [] : [1],
        clearance: 2,
        closingSpeed: 0,
        consumed: false,
        ...extra,
      },
    ],
  });

  it('sheds a crate on a crash instead of ending the run outright', () => {
    const run = beginRun(withFeature('barrier'));
    const before = run.train.cargo;
    advance(run, emptyInput(), 12);
    expect(run.train.cargo).toBe(before - 1);
    expect(run.phase).toBe('playing');
  });

  it('ends the run once the last crate is gone', () => {
    const level = withFeature('barrier');
    const run = beginRun({ ...level, cargo: 1 });
    advance(run, emptyInput(), 12);
    expect(run.phase).toBe('crashed');
    expect(run.train.mode).toBe('wrecked');
    expect(run.stats.finished).toBe(false);
  });

  it('lets a hazard be dodged by taking another rail', () => {
    const run = beginRun(withFeature('barrier'));
    // The barrier sits on rail 1, which is where the train starts.
    stepRun(run, { ...emptyInput(), left: true }, 1 / 60);
    expect(run.train.rail).toBe(0);
    advance(run, emptyInput(), 12);
    expect(run.train.cargo).toBe(run.train.maxCargo);
  });

  it('lets a grounded train pass under a ceiling but not a jumping one', () => {
    const tunnel = () => withFeature('ceiling', { clearance: 1.5, s: 300, length: 600 });

    const grounded = beginRun(tunnel());
    advance(grounded, emptyInput(), 20);
    expect(grounded.train.cargo).toBe(grounded.train.maxCargo);

    // The inversion the Undercity level is built around: under a roof it is
    // the air that hurts you. Charge a jump on the approach and release it
    // inside the tunnel — holding the button only charges, so the release is
    // what actually leaves the ground.
    const jumping = beginRun(tunnel());
    const charge = { ...emptyInput(), jump: true };
    while (jumping.train.s < 340 && jumping.phase === 'playing') {
      stepRun(jumping, jumping.train.s > 280 ? charge : emptyInput(), 1 / 60);
    }
    advance(jumping, emptyInput(), 2);
    expect(jumping.train.cargo).toBeLessThan(jumping.train.maxCargo);
  });

  it('charges one obstacle at most one crate', () => {
    // A crash scrubs the train to 45% speed, so without this rule a long
    // barrier keeps hitting the train it just slowed down and strips the whole
    // consist for a single mistake.
    const run = beginRun(withFeature('barrier', { length: 400 }));
    advance(run, emptyInput(), 20);
    expect(run.train.cargo).toBe(run.train.maxCargo - 1);
    expect(run.phase).toBe('playing');
  });
});

describe('scoring', () => {
  it('completes a run and pays a delivery bonus for surviving cargo', () => {
    const short: LevelConfig = {
      ...LEVELS[LEVEL_ORDER[0]],
      segments: [{ length: 400, curvature: 0, grade: 0, bank: 0 }],
      features: [],
    };
    const run = beginRun(short);
    advance(run, emptyInput(), 30);
    expect(run.phase).toBe('runComplete');
    expect(run.stats.finished).toBe(true);
    expect(run.stats.cargoDelivered).toBe(short.cargo);
    // Distance points alone could never reach the delivery bonus on 400 m.
    expect(run.stats.score).toBeGreaterThan(short.cargo * 1000);
  });

  it('banks the pending combo at a checkpoint', () => {
    const level: LevelConfig = {
      ...LEVELS[LEVEL_ORDER[0]],
      segments: [{ length: 4000, curvature: 0, grade: 0, bank: 0 }],
      features: [
        {
          id: 1,
          kind: 'checkpoint',
          s: 300,
          length: 6,
          rails: [],
          clearance: 0,
          closingSpeed: 0,
          consumed: false,
        },
      ],
    };
    const run = beginRun(level);
    run.combo.pending = 1000;
    run.combo.multiplier = 3;
    const before = run.score;
    advance(run, emptyInput(), 12);
    expect(run.combo.pending).toBe(0);
    expect(run.combo.multiplier).toBe(1);
    expect(run.score).toBeGreaterThan(before + 2500);
  });

  it('collects a charm exactly once', () => {
    const level: LevelConfig = {
      ...LEVELS[LEVEL_ORDER[0]],
      segments: [{ length: 4000, curvature: 0, grade: 0, bank: 0 }],
      features: [
        {
          id: 1,
          kind: 'charm',
          s: 250,
          length: 2,
          rails: [1],
          clearance: 0,
          closingSpeed: 0,
          consumed: false,
        },
      ],
    };
    const run = beginRun(level);
    advance(run, emptyInput(), 12);
    expect(run.features[0].consumed).toBe(true);
    const boost = run.train.boostMeter;
    advance(run, emptyInput(), 1);
    expect(run.train.boostMeter).toBeLessThanOrEqual(boost + 0.001);
  });
});

describe('determinism', () => {
  it('gives the same run at 30fps and at 144fps', () => {
    // The fixed timestep exists for exactly this: a player on a 144 Hz display
    // must not be handed a different game from one on a 30 Hz laptop.
    const level = LEVELS[LEVEL_ORDER[0]];
    const slow = beginRun(level);
    const fast = beginRun(level);
    const input = { ...emptyInput(), drift: true };

    advance(slow, input, 6, 30);
    advance(fast, input, 6, 144);

    // Tolerances are relative rather than exact: both runs execute the same
    // fixed steps for the same wall time, but the accumulator carries a
    // partial step across frames and where that partial lands depends on the
    // frame size. What is being guarded is the thing that would actually break
    // — feeding raw frame time into the physics instead of a fixed step, which
    // moves these numbers by far more than a percent.
    const relative = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);
    expect(relative(fast.elapsed, slow.elapsed)).toBeLessThan(0.01);
    expect(relative(fast.train.s, slow.train.s)).toBeLessThan(0.01);
    expect(relative(fast.train.speed, slow.train.speed)).toBeLessThan(0.01);
    expect(relative(fast.score, slow.score)).toBeLessThan(0.01);
    // Sanity: the tolerance above is only meaningful if the runs actually ran.
    expect(slow.train.s).toBeGreaterThan(100);
  });

  it('survives a long stall without simulating the whole gap', () => {
    const run = beginRun(LEVELS[LEVEL_ORDER[0]]);
    const before = run.train.s;
    // A backgrounded tab returns with a huge delta; the step cap must absorb it.
    stepRun(run, emptyInput(), 60);
    expect(run.train.s - before).toBeLessThan(50);
    expect(Number.isFinite(run.train.s)).toBe(true);
  });

  it('produces identical runs from the same seed', () => {
    const level = LEVELS[LEVEL_ORDER[0]];
    const a = createRun(level, 42);
    const b = createRun(level, 42);
    const input = { ...emptyInput(), drift: true };
    advance(a, input, 5);
    advance(b, input, 5);
    expect(a.train.s).toBe(b.train.s);
    expect(a.score).toBe(b.score);
    expect(a.particles.length).toBe(b.particles.length);
  });
});

describe('every shipped level is completable', () => {
  /**
   * A deliberately unskilled autopilot: it drifts whatever bend it is in,
   * hops gaps, switches off a blocked rail and stays down near ceilings. If
   * *this* can deliver the cargo, a player can.
   */
  function autopilot(run: RunState): void {
    const input = emptyInput();
    const level = run.level;
    let frames = 0;

    while (run.phase !== 'runComplete' && run.phase !== 'crashed' && frames < 60 * 400) {
      frames += 1;
      const train = run.train;
      const curve = sampleTrack(level.segments, train.s);
      const ceilingNear = run.features.some(
        (f) => f.kind === 'ceiling' && f.s < train.s + 140 && f.s + f.length > train.s - 20,
      );
      const blockers = run.features.filter(
        (f) =>
          (f.kind === 'gap' || f.kind === 'barrier' || f.kind === 'freight') &&
          f.s < train.s + 90 &&
          f.s + f.length > train.s,
      );
      const onMyRail = blockers.find((f) => f.rails.length === 0 || f.rails.includes(train.rail));

      input.drift = Math.abs(curve.curvature) > 0.002 && train.mode !== 'airborne';
      input.jump =
        !!onMyRail && onMyRail.kind === 'gap' && onMyRail.s - train.s < 22 && !ceilingNear;
      input.left = false;
      input.right = false;

      if (onMyRail && frames % 10 === 0) {
        const blocked = new Set(blockers.flatMap((f) => f.rails));
        for (let rail = 0; rail < level.rails; rail += 1) {
          if (blocked.has(rail) || rail === train.rail) continue;
          if (rail < train.rail) input.left = true;
          else input.right = true;
          break;
        }
      }

      stepRun(run, input, 1 / 60);
    }
  }

  for (const id of LEVEL_ORDER) {
    it(`delivers the cargo on ${LEVELS[id].name}`, () => {
      const run = beginRun(LEVELS[id]);
      autopilot(run);
      expect(run.phase, `${LEVELS[id].name} was not completable`).toBe('runComplete');
      expect(run.stats.finished).toBe(true);
      expect(run.stats.cargoDelivered).toBeGreaterThan(0);
      // Par should be reachable without any trick skill at all, or the rank
      // curve is measuring the wrong thing.
      expect(run.elapsed).toBeLessThan(LEVELS[id].parTime);
    });
  }
});
