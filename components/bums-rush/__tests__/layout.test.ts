/**
 * The parts of the Bum's Rush component layer that can be wrong on a screen
 * nobody in the room owns.
 *
 * Everything here is pure — no canvas, no DOM, no engine — which is the point:
 * the rules that decide whether a phone gets 110px of screen back, whether an
 * off-screen arrow lands inside the stage, and whether a rebound key keeps its
 * axis are all decisions, not pixels, and a decision can be held still.
 *
 * The suite runs in the `node` environment (vitest.config.ts), so nothing here
 * may render a component. Layout that needs a real box is verified by
 * `lib/__tests__/game-viewport-consistency.test.ts`'s static rules and by eye.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICS } from '@/lib/bums-rush/constants';
import {
  armForTouchX,
  createTouchArmState,
  onTouchDown,
  onTouchMove,
  onTouchUp,
} from '@/lib/bums-rush/input';
import type { Profile } from '@/lib/bums-rush/types';
import { createDefaultProfile } from '@/lib/bums-rush/progress/save';
import {
  bindingKeyFor,
  isRootScreen,
  kindForBindingKey,
  viewportModeFor,
  type Screen,
} from '../store';
import { clockParts, clockTick, formatClock, formatFraction, humaniseId } from '../format';
import { edgeDistanceMetres, edgeIndicatorPlacement, worldToDesign } from '../hud/geometry';
import { clearedLevelIds } from '../screens/WorldMap';
import { bestTimeFor } from '../screens/LevelCard';

const nf = new Intl.NumberFormat('en');

/** Every screen the router can be on, so a new one cannot skip the switch. */
const ALL_SCREENS: Screen[] = [
  { kind: 'title' },
  { kind: 'mode' },
  { kind: 'world-map' },
  { kind: 'level-card', levelId: 'w1-01' },
  { kind: 'lobby' },
  { kind: 'wardrobe' },
  { kind: 'settings' },
  { kind: 'bindings' },
  { kind: 'credits' },
  { kind: 'playing', levelId: 'w1-01', mode: 'campaign' },
  {
    kind: 'results',
    levelId: 'w1-01',
    result: {
      levelId: 'w1-01',
      playerCount: 1,
      durationMs: 42_000,
      deaths: 3,
      objectiveIds: [],
      assisted: false,
      catUsed: false,
      seats: [],
    },
  },
];

describe('the viewport-mode switch (design-language.md §12.1 rule 6)', () => {
  it('gives the fixed viewport to a live level and to nothing else', () => {
    const viewport = ALL_SCREENS.filter((screen) => viewportModeFor(screen) === 'viewport');
    expect(viewport.map((s) => s.kind)).toEqual(['playing']);
  });

  it('treats every document-shaped screen as a document', () => {
    // The failure this guards is the cheap one to make and the expensive one to
    // find: a results card built on `.app-viewport` costs a phone the
    // collapsing address bar for the whole visit, and looks fine on a desktop.
    for (const screen of ALL_SCREENS) {
      if (screen.kind === 'playing') continue;
      expect(viewportModeFor(screen)).toBe('page');
    }
  });

  it('only the title clears the back stack', () => {
    expect(ALL_SCREENS.filter(isRootScreen).map((s) => s.kind)).toEqual(['title']);
  });
});

describe('edge indicator placement', () => {
  const camera = { x: 1000, y: 500, zoom: 1 };

  it('puts the camera centre at the middle of the stage', () => {
    const design = worldToDesign(camera.x, camera.y, camera);
    expect(design.x).toBeCloseTo(PHYSICS.DESIGN_WIDTH / 2);
    expect(design.y).toBeCloseTo(PHYSICS.DESIGN_HEIGHT / 2);
  });

  it('scales offsets by the camera zoom', () => {
    const zoomed = worldToDesign(camera.x + 100, camera.y, { ...camera, zoom: 2 });
    expect(zoomed.x).toBeCloseTo(PHYSICS.DESIGN_WIDTH / 2 + 200);
  });

  it('never places an arrow outside the stage', () => {
    // A camera one frame stale (a host migration hands the HUD a snapshot from
    // a different frame) would otherwise push a marker past the stage edge and,
    // with it, the page's scrollWidth — a horizontal scrollbar caused by a
    // decoration.
    const far = edgeIndicatorPlacement({ x: 999_999, y: -999_999, angle: 0 }, camera);
    expect(far.leftPct).toBeGreaterThanOrEqual(3);
    expect(far.leftPct).toBeLessThanOrEqual(97);
    expect(far.topPct).toBeGreaterThanOrEqual(3);
    expect(far.topPct).toBeLessThanOrEqual(97);
  });

  it('survives a NaN camera without emitting NaN coordinates', () => {
    const broken = edgeIndicatorPlacement(
      { x: Number.NaN, y: 0, angle: 0 },
      { x: 0, y: 0, zoom: Number.NaN },
    );
    expect(Number.isFinite(broken.leftPct)).toBe(true);
    expect(Number.isFinite(broken.topPct)).toBe(true);
  });

  it('converts the angle to degrees', () => {
    const placement = edgeIndicatorPlacement({ x: 1000, y: 500, angle: Math.PI }, camera);
    expect(placement.angleDeg).toBeCloseTo(180);
  });

  it('reports at least one metre, never zero', () => {
    expect(edgeDistanceMetres(4)).toBe(1);
    expect(edgeDistanceMetres(250)).toBe(3);
  });
});

describe('the clock', () => {
  it('splits milliseconds into minutes, seconds and hundredths', () => {
    expect(clockParts(67_240)).toEqual({ minutes: 1, seconds: 7, centis: 24 });
  });

  it('treats a negative or non-finite elapsed time as zero', () => {
    expect(clockParts(-5)).toEqual({ minutes: 0, seconds: 0, centis: 0 });
    expect(clockParts(Number.NaN)).toEqual({ minutes: 0, seconds: 0, centis: 0 });
  });

  it('pads to two digits using the locale’s own zero', () => {
    expect(formatClock(67_240, nf)).toBe('1:07.24');
    expect(formatClock(0, nf)).toBe('0:00.00');
  });

  it('changes its tick only when the hundredths move', () => {
    // This is what lets the HUD skip ~40% of its DOM writes at 60fps.
    expect(clockTick(1000)).toBe(clockTick(1009));
    expect(clockTick(1000)).not.toBe(clockTick(1010));
  });

  it('formats a fraction on both sides', () => {
    expect(formatFraction(3, 9, nf)).toBe('3 / 9');
  });
});

describe('binding profile keys', () => {
  it('keys pads by a hash of their id so two brands keep separate maps', () => {
    const xbox = bindingKeyFor('gamepad', 'Xbox 360 Controller (XInput STANDARD GAMEPAD)');
    const sony = bindingKeyFor('gamepad', 'Wireless Controller (Vendor: 054c Product: 0ce6)');
    expect(xbox).not.toBe(sony);
    expect(xbox.startsWith('gamepad:')).toBe(true);
  });

  it('falls back to a single generic pad key when no pad is connected', () => {
    expect(bindingKeyFor('gamepad', null)).toBe('gamepad');
  });

  it('leaves the singleton devices as their own key', () => {
    expect(bindingKeyFor('keyboard-p1')).toBe('keyboard-p1');
    expect(bindingKeyFor('keyboard-p2')).toBe('keyboard-p2');
    expect(bindingKeyFor('touch')).toBe('touch');
  });

  it('round-trips a key back to its device kind', () => {
    for (const kind of ['keyboard-p1', 'keyboard-p2', 'touch'] as const) {
      expect(kindForBindingKey(bindingKeyFor(kind))).toBe(kind);
    }
    expect(kindForBindingKey(bindingKeyFor('gamepad', 'anything'))).toBe('gamepad');
    // An unknown key must resolve to SOMETHING playable rather than throwing —
    // a corrupt storage entry cannot be allowed to cost a player their input.
    expect(kindForBindingKey('nonsense')).toBe('keyboard-p1');
  });
});

describe('the touch surface splits the screen in half', () => {
  it('assigns each half to one arm', () => {
    expect(armForTouchX(10, 800)).toBe('l');
    expect(armForTouchX(790, 800)).toBe('r');
    // The exact midpoint belongs to the right arm; what matters is that it
    // belongs to exactly one of them at every width.
    expect(armForTouchX(400, 800)).toBe('r');
  });

  it('lets a second finger in a claimed half be ignored, not steal the arm', () => {
    let state = createTouchArmState();
    state = onTouchDown(state, 1, { x: 100, y: 300 }, 800);
    state = onTouchDown(state, 2, { x: 140, y: 320 }, 800);
    expect(state.left?.pointerId).toBe(1);

    // …and the palm's movements do not drive the thumb's arm.
    state = onTouchMove(state, 2, { x: 300, y: 300 });
    expect(state.left?.current).toEqual({ x: 100, y: 300 });

    state = onTouchUp(state, 1);
    expect(state.left).toBeNull();
  });

  it('tracks both thumbs independently', () => {
    let state = createTouchArmState();
    state = onTouchDown(state, 1, { x: 100, y: 300 }, 800);
    state = onTouchDown(state, 2, { x: 700, y: 300 }, 800);
    expect(state.left?.pointerId).toBe(1);
    expect(state.right?.pointerId).toBe(2);
  });
});

describe('profile read-outs', () => {
  function profileWithClears(): Profile {
    const profile = createDefaultProfile(0);
    return {
      ...profile,
      clears: {
        'w1-01:1': {
          levelId: 'w1-01',
          playerCount: 1,
          bestMs: 41_000,
          objectives: 0b101,
          assisted: false,
          clears: 2,
        },
        'w1-01:2': {
          levelId: 'w1-01',
          playerCount: 2,
          bestMs: 38_500,
          objectives: 0b010,
          assisted: true,
          clears: 1,
        },
        'w1-03:1': {
          levelId: 'w1-03',
          playerCount: 1,
          bestMs: 60_000,
          objectives: 0,
          assisted: false,
          clears: 1,
        },
      },
    };
  }

  it('counts a level as cleared at any player count', () => {
    expect([...clearedLevelIds(profileWithClears())].sort()).toEqual(['w1-01', 'w1-03']);
  });

  it('takes the best time across player counts', () => {
    expect(bestTimeFor(profileWithClears(), 'w1-01')).toBe(38_500);
  });

  it('reports no best time for a level never cleared', () => {
    expect(bestTimeFor(profileWithClears(), 'w1-09')).toBeNull();
  });
});

describe('cosmetic labels', () => {
  it('humanises an id so 62 cosmetics do not need 62 hand-written keys', () => {
    expect(humaniseId('boxing-glove')).toBe('Boxing Glove');
    expect(humaniseId('biro')).toBe('Biro');
  });
});
