import { describe, expect, it } from 'vitest';

import {
  PRESS_BASE,
  SOFT_BODY,
  SOFT_BODY_EXCLUDE_SELECTOR,
  SOFT_BODY_SELECTOR,
  bodyCap,
  bodyEnergy,
  cornerFlexEligible,
  latticeCaps,
  nudgePeak,
  pickEvictions,
  pickNudgeTargets,
  plasticDecay,
  plasticFraction,
  resolveSoftPolicy,
  softFeatures,
  type ElementTraits,
} from '../soft-policy';
import { MOTION_BOUNDS } from '../tiers';

/**
 * The soft-body table decides which hosts may move at all, so it is pinned here: every legacy alias keeps working
 * (R11), every always-excluded element stays still, and the active set and nudge never exceed their bounds.
 */

const el = (t: Partial<ElementTraits> & { tag: string }): ElementTraits => ({
  width: 120,
  height: 40,
  ...t,
});

describe('mode resolution', () => {
  it('defaults: buttons and control roles are controls, cards plump, panes and fields never take an affine', () => {
    expect(resolveSoftPolicy(el({ tag: 'button' })).mode).toBe('control');
    for (const role of ['button', 'tab', 'menuitem', 'switch', 'option']) {
      expect(resolveSoftPolicy(el({ tag: 'div', role })).mode, role).toBe('control');
    }
    expect(resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-slot': 'button' } })).mode).toBe(
      'control',
    );
    expect(resolveSoftPolicy(el({ tag: 'summary' })).mode).toBe('control');

    const card = resolveSoftPolicy(el({ tag: 'article', classes: ['glass-fill'] }));
    expect(card).toMatchObject({
      mode: 'card',
      hover: 'plump',
      base: PRESS_BASE.lift,
      envelope: true,
    });
    expect(resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-evert': '' } })).mode).toBe('card');

    for (const cls of ['glass-pane', 'glass-chrome', 'glass-overlay', 'app-glass', 'glass-inset']) {
      const p = resolveSoftPolicy(el({ tag: 'div', classes: [cls], admitted: true }));
      expect(p.mode, cls).toBe('pane');
      expect(p.envelope, cls).toBe(false);
      expect(p.lattice, cls).toBe(true);
    }
    const field = resolveSoftPolicy(el({ tag: 'input', editable: true, admitted: true }));
    expect(field).toMatchObject({
      mode: 'pane',
      envelope: false,
      scale: false,
      hover: 'none',
      lattice: true,
    });
  });

  it('controls dent and sink; cards plump and lift', () => {
    expect(resolveSoftPolicy(el({ tag: 'button' }))).toMatchObject({
      hover: 'dent',
      base: PRESS_BASE.sink,
    });
    expect(resolveSoftPolicy(el({ tag: 'a', attrs: { href: '/x' } }))).toMatchObject({
      mode: 'card',
      hover: 'plump',
    });
  });

  it('honours every data-jelly mode and base override', () => {
    expect(resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-jelly': 'card' } })).mode).toBe(
      'card',
    );
    expect(resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-jelly': 'pane' } })).mode).toBe(
      'pane',
    );
    const drag = resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-jelly': 'drag' } }));
    expect(drag).toMatchObject({ mode: 'drag', drag: true, hover: 'none', base: 1 });
    expect(resolveSoftPolicy(el({ tag: 'button', attrs: { 'data-jelly': 'firm' } })).base).toBe(
      PRESS_BASE.firm,
    );
    expect(resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-jelly': 'lift' } })).base).toBe(
      PRESS_BASE.lift,
    );
    expect(
      resolveSoftPolicy(el({ tag: 'button', attrs: { 'data-jelly-scale': '0.97' } })).base,
    ).toBe(0.97);
    expect(resolveSoftPolicy(el({ tag: 'button', attrs: { 'data-jelly': 'off' } })).mode).toBe(
      'off',
    );
  });

  it('keeps every legacy data-fluid-press alias (R11)', () => {
    expect(resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-fluid-press': '' } }))).toMatchObject({
      mode: 'control',
      base: PRESS_BASE.sink,
    });
    expect(
      resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-fluid-press': 'lift' } })),
    ).toMatchObject({
      mode: 'card',
      base: PRESS_BASE.lift,
    });
    expect(resolveSoftPolicy(el({ tag: 'div', attrs: { 'data-fluid-press': 'firm' } })).base).toBe(
      PRESS_BASE.firm,
    );
    expect(
      resolveSoftPolicy(el({ tag: 'button', attrs: { 'data-fluid-press': 'none' } })).mode,
    ).toBe('off');
    expect(
      resolveSoftPolicy(el({ tag: 'button', attrs: { 'data-fluid-press': 'off' } })).mode,
    ).toBe('off');
    expect(
      resolveSoftPolicy(el({ tag: 'button', attrs: { 'data-fluid-scale': '0.9' } })).base,
    ).toBe(0.9);
    // data-jelly wins over the alias.
    expect(
      resolveSoftPolicy(
        el({ tag: 'div', attrs: { 'data-jelly': 'card', 'data-fluid-press': 'none' } }),
      ).mode,
    ).toBe('card');
  });

  it('excludes everything on the always-excluded list', () => {
    const off = (t: ElementTraits) => expect(resolveSoftPolicy(t).mode).toBe('off');
    off(el({ tag: 'canvas', attrs: { 'data-jelly': 'card' } }));
    off(el({ tag: 'video' }));
    off(el({ tag: 'iframe' }));
    off(el({ tag: 'button', attrs: { 'data-gesture': 'swipe' } }));
    off(el({ tag: 'div', classes: ['radial-globe__stage', 'glass-fill'] }));
    off(el({ tag: 'div', classes: ['eversion-overlay'] }));
    off(el({ tag: 'div', classes: ['evert-ghost'] }));
    off(el({ tag: 'button', disabled: true }));
    off(el({ tag: 'button', scopeOff: true }));
    off(el({ tag: 'div', attrs: { draggable: 'true', 'data-fluid-press': '' } }));
    off(el({ tag: 'a', attrs: { href: '/x' }, proseLink: true }));
    off(el({ tag: 'div' }));
    // …but a hold gesture and an opted-in drag survive.
    expect(resolveSoftPolicy(el({ tag: 'button', attrs: { 'data-gesture': 'hold' } })).mode).toBe(
      'control',
    );
    expect(
      resolveSoftPolicy(el({ tag: 'div', attrs: { draggable: 'true', 'data-jelly': 'drag' } }))
        .mode,
    ).toBe('drag');
  });

  it('selector twins name the same sets', () => {
    for (const s of [
      '[data-fluid-press]',
      'button',
      '[data-evert]',
      '.glass-fill',
      '.glass-pane',
      '[data-jelly]',
    ]) {
      expect(SOFT_BODY_SELECTOR).toContain(s);
    }
    for (const s of [
      'canvas',
      'video',
      'iframe',
      '.radial-globe__stage',
      '[disabled]',
      '[aria-disabled="true"]',
    ]) {
      expect(SOFT_BODY_EXCLUDE_SELECTOR).toContain(s);
    }
  });

  it('large surfaces and framer-offset hosts get lean only; large lattices half amplitude', () => {
    const big = resolveSoftPolicy(
      el({ tag: 'article', classes: ['glass-fill'], width: 800, height: 400, admitted: true }),
    );
    expect(big).toMatchObject({ envelope: true, scale: false, latticeAmplitude: 0.5 });
    expect(resolveSoftPolicy(el({ tag: 'button', inlineTransformOffset: true })).scale).toBe(false);
  });
});

describe('corner flex gate', () => {
  it('is for small controls (≤ 160×64) without overhanging children, and not when a lattice owns the rim', () => {
    expect(cornerFlexEligible(160, 64)).toBe(true);
    expect(cornerFlexEligible(161, 40)).toBe(false);
    expect(cornerFlexEligible(100, 65)).toBe(false);
    expect(cornerFlexEligible(100, 40, true)).toBe(false);
    expect(resolveSoftPolicy(el({ tag: 'button', width: 90, height: 36 })).cornerFlex).toBe(true);
    expect(
      resolveSoftPolicy(el({ tag: 'button', width: 90, height: 36, admitted: true })).cornerFlex,
    ).toBe(false);
    expect(
      resolveSoftPolicy(el({ tag: 'article', classes: ['glass-fill'], width: 90, height: 36 }))
        .cornerFlex,
    ).toBe(false);
  });
});

describe('degradation', () => {
  it('lite and off keep an isotropic press with no wobble, hover, nudge, flex or lattice', () => {
    for (const [tier, motion] of [
      ['lite', 'lively'],
      ['off', 'lively'],
    ] as const) {
      const f = softFeatures(tier, motion);
      expect(f).toMatchObject({
        press: true,
        wobble: false,
        hover: false,
        nudge: false,
        cornerFlex: false,
      });
      expect(f.lattice).toBe(false);
      expect(f.bodies).toBeLessThanOrEqual(3);
    }
  });

  it('pausing ambient motion preserves direct hover, press, flex and lattice feedback', () => {
    expect(softFeatures('full', 'still')).toMatchObject({
      press: true,
      hover: true,
      wobble: true,
      cornerFlex: true,
      lattice: true,
      nudge: false,
    });
  });

  it('touch tiers have no hover; calm has no nudge', () => {
    expect(softFeatures('coarse').hover).toBe(false);
    expect(softFeatures('handheld').hover).toBe(false);
    expect(softFeatures('full').hover).toBe(true);
    expect(softFeatures('full', 'calm').nudge).toBe(false);
    const p = resolveSoftPolicy(el({ tag: 'button' }), { features: softFeatures('handheld') });
    expect(p.hover).toBe('none');
  });
});

describe('active set', () => {
  it('caps at 12 on fine pointers and 6 on coarse, never above the tier budget', () => {
    expect(bodyCap(softFeatures('full'), false)).toBe(12);
    expect(bodyCap(softFeatures('full'), true)).toBe(6);
    expect(bodyCap(softFeatures('handheld'), false)).toBeLessThanOrEqual(6);
  });

  it('evicts nudge < hover < released, lowest energy first, never pressed or dragged', () => {
    const bodies = [
      { key: 'pressed', phase: 'pressed', energy: 0 },
      { key: 'released-hi', phase: 'released', energy: 3 },
      { key: 'hover', phase: 'hover', energy: 9 },
      { key: 'nudge', phase: 'nudge', energy: 1 },
      { key: 'released-lo', phase: 'released', energy: 1 },
      { key: 'dragged', phase: 'dragged', energy: 0 },
    ] as const;
    expect(pickEvictions(bodies, 3)).toEqual(['nudge', 'hover', 'released-lo']);
    expect(pickEvictions(bodies, 0)).toEqual(['nudge', 'hover', 'released-lo', 'released-hi']);
    expect(pickEvictions(bodies, 6)).toEqual([]);
  });

  it('measures stored energy in px', () => {
    expect(bodyEnergy(0.98, 1, 0.5, 0, 100, 40)).toBeCloseTo(2.5, 10);
  });
});

describe('neighbour nudge', () => {
  const src = { x: 100, y: 100, w: 100, h: 40 };
  const cand = (key: number, x: number, y: number) => ({ key, rect: { x, y, w: 100, h: 40 } });

  it('picks ≤ 4 neighbours within 24px, nearest first, pointing away, ≤ 1.5px', () => {
    const candidates = [
      cand(1, 204, 100), // 4px right
      cand(2, 100, 150), // 10px below
      cand(3, -4, 100), // 4px left
      cand(4, 100, 40), // 20px above
      cand(5, 230, 100), // 30px: out of range
      cand(6, 210, 150), // diagonal ~14px
      cand(7, 120, 110), // overlapping: skipped
    ];
    const picks = pickNudgeTargets(src, candidates, 5);
    expect(picks.length).toBeLessThanOrEqual(MOTION_BOUNDS.nudgeMax);
    expect(picks.map((p) => p.key)).toEqual([1, 3, 2, 6]);
    for (const p of picks) {
      expect(p.peak).toBeLessThanOrEqual(MOTION_BOUNDS.nudgePx);
      expect(p.gap).toBeLessThanOrEqual(MOTION_BOUNDS.nudgeRadiusPx);
    }
    expect(picks[0].dx).toBeGreaterThan(0.9);
    expect(picks[1].dx).toBeLessThan(-0.9);
  });

  it('needs enough energy and is suppressed after a scroll', () => {
    const candidates = [cand(1, 204, 100)];
    expect(pickNudgeTargets(src, candidates, SOFT_BODY.nudgeEnergyPx)).toEqual([]);
    expect(pickNudgeTargets(src, candidates, 5, 100)).toEqual([]);
    expect(pickNudgeTargets(src, candidates, 5, 200)).toHaveLength(1);
  });

  it('peaks at 1.5px on contact and fades to 0 at 24px', () => {
    expect(nudgePeak(0)).toBe(1.5);
    expect(nudgePeak(12)).toBeCloseTo(0.75, 10);
    expect(nudgePeak(24)).toBe(0);
    expect(nudgePeak(30)).toBe(0);
    expect(nudgePeak(-1)).toBe(0);
  });
});

describe('lattice caps and plastic', () => {
  it('outward never exceeds the focus-ring offset; inward is min(0.6·bevel, 10px)', () => {
    expect(latticeCaps(3)).toEqual({ outward: 2, inward: 0.6 * 3 });
    expect(latticeCaps(24).inward).toBe(10);
    expect(latticeCaps(10, 0.5)).toEqual({ outward: 1, inward: 3 });
  });

  it('plastic is zero under 350ms, capped, and exactly gone after 3τ', () => {
    expect(plasticFraction(349, 0.4)).toBe(0);
    expect(plasticFraction(5000, 0.4)).toBe(0.4);
    expect(plasticDecay(0)).toBe(1);
    expect(plasticDecay(3 * SOFT_BODY.plasticTau)).toBe(0);
  });
});
