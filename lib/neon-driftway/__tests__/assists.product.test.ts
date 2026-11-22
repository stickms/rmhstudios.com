/**
 * Neon Driftway's assists (sprint 09 17): the speed floor scales the step, calm visuals takes the
 * flash and the shake out, colour-safe has a shape per kind, and online races never get the clock.
 * Pure: the engine has no DOM and the renderer is only reached through its pure helpers.
 */
import { describe, expect, it } from 'vitest';
import { NO_ASSISTS, type AssistProfile } from '@/lib/game/assist';
import { NeonDriftwayEngine } from '@/lib/neon-driftway/game';
import {
  CALM_BLOOM_CAP,
  COLOR_SAFE_BOOST,
  COLOR_SAFE_HAZARD,
  COLOR_SAFE_SHAPES,
  NO_NDW_ASSIST,
  bloomTargetFor,
  crashFlashScale,
  headlightFlickerAllowed,
  lightningAllowed,
  motionEffectsAllowed,
  ndwAssistFlags,
  ndwOnlineFlags,
  scaledStep,
  shakeMagnitudeFor,
} from '@/lib/neon-driftway/assist-profile';
import type { InputState } from '@/lib/neon-driftway/types';

function assisted(over: Partial<Extract<AssistProfile, { ranked: false }>> = {}): AssistProfile {
  return {
    ranked: false,
    holdToPress: false,
    speedFloor: 1,
    calmVisuals: false,
    colorSafe: false,
    noTimedInput: false,
    ...over,
  };
}

const idle: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  steer: 0,
  boost: false,
  ability: false,
  pause: false,
  restart: false,
};

/** An engine that is mid-run on level 1, ready for `update`. */
function racing(flags = NO_NDW_ASSIST): NeonDriftwayEngine {
  const game = new NeonDriftwayEngine();
  game.setAssist(flags);
  game.startLevel(1);
  game.state = 'playing';
  return game;
}

/** Put an obstacle on the car and run one tick, so the collision (and its shake) happens. */
function crash(game: NeonDriftwayEngine): void {
  const o = game.obstacles[0];
  o.active = true;
  o.type = 'barrier';
  o.x = game.car.x;
  o.z = 0;
  o.width = 2;
  o.length = 2;
  o.height = 1;
  o.damage = 20;
  o.speed = 0;
  o.isTraffic = false;
  game.car.invincibleUntil = 0;
  game.update(0.016, idle);
}

describe('flags from a profile', () => {
  it('a ranked profile, or none, is the plain game', () => {
    expect(ndwAssistFlags(NO_ASSISTS)).toBe(NO_NDW_ASSIST);
    expect(ndwAssistFlags(null)).toBe(NO_NDW_ASSIST);
    expect(ndwAssistFlags(undefined)).toBe(NO_NDW_ASSIST);
  });

  it('an assisted profile carries calm, colour-safe and the speed floor', () => {
    expect(ndwAssistFlags(assisted({ calmVisuals: true, colorSafe: true, speedFloor: 0.7 }))).toEqual({
      active: true,
      speedScale: 0.7,
      calm: true,
      colorSafe: true,
    });
  });

  it('clamps the speed floor to 0.5-1', () => {
    expect(ndwAssistFlags(assisted({ speedFloor: 0.1 })).speedScale).toBe(0.5);
    expect(ndwAssistFlags(assisted({ speedFloor: 7 })).speedScale).toBe(1);
  });

  it('an online race never gets the speed floor, even from an assisted solo profile', () => {
    expect(ndwAssistFlags(assisted({ speedFloor: 0.5, calmVisuals: true }), { multiplayer: true }).speedScale).toBe(1);
  });

  it('online flags read only the two visual assists', () => {
    expect(ndwOnlineFlags({ calmVisuals: true, colorSafe: false })).toEqual({
      active: true,
      speedScale: 1,
      calm: true,
      colorSafe: false,
    });
    expect(ndwOnlineFlags({ calmVisuals: false, colorSafe: false })).toBe(NO_NDW_ASSIST);
    expect(ndwOnlineFlags(null)).toBe(NO_NDW_ASSIST);
  });
});

describe('the speed floor', () => {
  it('scales the step', () => {
    expect(scaledStep(0.03, NO_NDW_ASSIST)).toBeCloseTo(0.03);
    expect(scaledStep(0.03, ndwAssistFlags(assisted({ speedFloor: 0.5 })))).toBeCloseTo(0.015);
  });

  it('slows the road in the engine by the same fraction', () => {
    const plain = racing();
    const slow = racing(ndwAssistFlags(assisted({ speedFloor: 0.5 })));
    // Same speed from the first frame, so the distance covered differs only by the clock.
    plain.car.speed = slow.car.speed = 40;
    plain.update(0.03, idle);
    slow.update(0.03, idle);
    expect(slow.worldZ).toBeLessThan(plain.worldZ);
    expect(slow.worldZ / plain.worldZ).toBeCloseTo(0.5, 1);
  });

  it('an unassisted engine runs at full speed', () => {
    const game = racing();
    const before = game.elapsedMs;
    game.update(0.02, idle);
    expect(game.elapsedMs - before).toBeCloseTo(20, 5);
  });
});

describe('calm visuals', () => {
  const calm = ndwAssistFlags(assisted({ calmVisuals: true }));

  it('removes the shake a collision asks for', () => {
    expect(shakeMagnitudeFor(60, NO_NDW_ASSIST)).toBe(60);
    expect(shakeMagnitudeFor(60, calm)).toBe(0);
  });

  it('removes the crash flash, the lightning, the flicker and the screen-wide motion', () => {
    expect(crashFlashScale(NO_NDW_ASSIST)).toBe(1);
    expect(crashFlashScale(calm)).toBe(0);
    expect(lightningAllowed(NO_NDW_ASSIST, false)).toBe(true);
    expect(lightningAllowed(calm, false)).toBe(false);
    expect(lightningAllowed(NO_NDW_ASSIST, true)).toBe(false);
    expect(headlightFlickerAllowed(NO_NDW_ASSIST)).toBe(true);
    expect(headlightFlickerAllowed(calm)).toBe(false);
    expect(motionEffectsAllowed(NO_NDW_ASSIST, false)).toBe(true);
    expect(motionEffectsAllowed(calm, false)).toBe(false);
  });

  it('caps bloom, boost surge included, and never raises it', () => {
    expect(bloomTargetFor(1.2, NO_NDW_ASSIST)).toBe(1.2);
    expect(bloomTargetFor(1.2, calm)).toBe(CALM_BLOOM_CAP);
    expect(bloomTargetFor(0.1, calm)).toBe(0.1);
  });

  it('the engine does not shake on a collision when calm, and does when not', () => {
    const plain = racing();
    crash(plain);
    expect(plain.car.hp).toBeLessThan(plain.car.maxHp);
    expect(plain.shakeTimer).toBeGreaterThan(0);

    const quiet = racing(calm);
    crash(quiet);
    expect(quiet.car.hp).toBeLessThan(quiet.car.maxHp);
    expect(quiet.shakeTimer).toBe(0);
    expect(quiet.shakeX).toBe(0);
    expect(quiet.shakeY).toBe(0);
  });

  it('the engine holds the headlights steady when calm', () => {
    const quiet = racing(calm);
    quiet.flickerTimer = 5;
    quiet.headlightFlickerDim = true;
    quiet.setAssist(calm);
    expect(quiet.headlightFlickerDim).toBe(false);
  });
});

describe('colour-safe markings', () => {
  it('boost and hazards carry different shapes, and the pair is not red against green', () => {
    expect(COLOR_SAFE_SHAPES.boost).toBe('chevron');
    expect(COLOR_SAFE_SHAPES.hazard).toBe('stripe');
    expect(COLOR_SAFE_SHAPES.boost).not.toBe(COLOR_SAFE_SHAPES.hazard);
    expect(COLOR_SAFE_BOOST.toLowerCase()).not.toBe(COLOR_SAFE_HAZARD.toLowerCase());
    // Blue and orange: the blue channel dominates one and is nearly absent from the other.
    const blue = parseInt(COLOR_SAFE_BOOST.slice(5, 7), 16);
    const orangeBlue = parseInt(COLOR_SAFE_HAZARD.slice(5, 7), 16);
    expect(blue).toBeGreaterThan(orangeBlue + 100);
  });
});
