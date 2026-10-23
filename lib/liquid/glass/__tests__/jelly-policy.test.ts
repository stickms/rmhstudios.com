import { describe, expect, it } from 'vitest';
import { governBudget, GOVERNED_HAZE_SCALE, knobsAt } from '@/lib/jelly/governor';
import { AMBIENT_BOUNDS, IDLE_AFTER_MS, JELLY_BUDGETS } from '@/lib/jelly/tiers';
import { HAZE_FRAG } from '../haze-shader';
import {
  GLASS_BUDGET,
  HAZE,
  PULSE,
  admit,
  ambientHz,
  dueHaze,
  hazeEligible,
  hazeScaleFor,
  hazeSize,
  hazeSlots,
  latticeAmplitude,
  nextDue,
  overdrawMargin,
  pulseLevel,
  seedFor,
  type Candidate,
  type ClockState,
  type GlassRole,
} from '../policy';
import { FRAG } from '../shader';

const engaged: ClockState = {
  hidden: false,
  focused: true,
  scrolling: false,
  hazeSurfaces: 3,
  ambient: true,
  msSinceInput: 0,
  clockHz: 30,
  idleClockHz: 12,
};

describe('ambient clock (R7)', () => {
  it('runs at the tier clock while engaged and drops to the idle floor — never to 0 — after IDLE_AFTER_MS', () => {
    expect(ambientHz(engaged)).toBe(30);
    expect(ambientHz({ ...engaged, msSinceInput: IDLE_AFTER_MS - 1 })).toBe(30);
    expect(ambientHz({ ...engaged, msSinceInput: IDLE_AFTER_MS + 1 })).toBe(12);
    expect(ambientHz({ ...engaged, msSinceInput: 10 * 60_000 })).toBe(12);
  });

  it.each<[string, Partial<ClockState>]>([
    ['the tab is hidden', { hidden: true }],
    ['the window is unfocused', { focused: false }],
    ['a scroll is in flight', { scrolling: true }],
    ['no haze surface is on screen', { hazeSurfaces: 0 }],
    ['ambient motion is off (degraded tier, still, a game playing)', { ambient: false }],
  ])('stops (0 Hz, so no loop) when %s', (_, patch) => {
    expect(ambientHz({ ...engaged, ...patch })).toBe(0);
    expect(ambientHz({ ...engaged, ...patch, msSinceInput: IDLE_AFTER_MS * 3 })).toBe(0);
  });

  it('follows the governed and calm-capped budget, and never exceeds the engaged clock when idle', () => {
    const governed = governBudget(JELLY_BUDGETS.full, 1);
    expect(
      ambientHz({ ...engaged, clockHz: governed.clockHz, idleClockHz: governed.idleClockHz }),
    ).toBe(20);
    const ladderEnd = governBudget(JELLY_BUDGETS.full, 6);
    expect(
      ambientHz({ ...engaged, clockHz: ladderEnd.clockHz, idleClockHz: ladderEnd.idleClockHz }),
    ).toBe(0);
    expect(
      ambientHz({ ...engaged, clockHz: 12, idleClockHz: 30, msSinceInput: IDLE_AFTER_MS + 1 }),
    ).toBe(12);
  });

  it('handheld runs 15 Hz engaged and 8 Hz idle; lite and off have no clock', () => {
    const h = JELLY_BUDGETS.handheld;
    expect(ambientHz({ ...engaged, clockHz: h.clockHz, idleClockHz: h.idleClockHz })).toBe(15);
    expect(
      ambientHz({
        ...engaged,
        clockHz: h.clockHz,
        idleClockHz: h.idleClockHz,
        msSinceInput: IDLE_AFTER_MS + 1,
      }),
    ).toBe(8);
    for (const t of ['lite', 'off'] as const) {
      const b = JELLY_BUDGETS[t];
      expect(ambientHz({ ...engaged, clockHz: b.clockHz, idleClockHz: b.idleClockHz })).toBe(0);
    }
  });
});

describe('haze slots and caps', () => {
  it('controls never get a haze canvas; every other role may', () => {
    expect(hazeEligible('control')).toBe(false);
    for (const r of ['overlay', 'chrome', 'pane', 'fill', 'other'] as GlassRole[])
      expect(hazeEligible(r)).toBe(true);
    const ranked = (['overlay', 'pane', 'fill', 'control', 'control'] as GlassRole[]).map(
      (role, i) => ({
        role,
        i,
      }),
    );
    expect(hazeSlots(ranked).map((e) => e.role)).toEqual(['overlay', 'pane', 'fill']);
  });

  it('the tier budgets cap ambient slots at 8 / 6 / 4 and lattices at 8 / 6 / 4', () => {
    expect(
      [JELLY_BUDGETS.full, JELLY_BUDGETS.coarse, JELLY_BUDGETS.handheld].map((b) => b.hazeSlots),
    ).toEqual([8, 6, 4]);
    expect(
      [JELLY_BUDGETS.full, JELLY_BUDGETS.coarse, JELLY_BUDGETS.handheld].map((b) => b.lattices),
    ).toEqual([8, 6, 4]);
    expect(JELLY_BUDGETS.lite.hazeSlots + JELLY_BUDGETS.off.hazeSlots).toBe(0);
  });

  it('rim admission follows the tier budget and never exceeds the engine ceiling', () => {
    const many: Candidate[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      role: 'fill',
      order: i,
      visible: true,
      width: 200,
      height: 100,
    }));
    expect(admit(many)).toHaveLength(GLASS_BUDGET.maxSurfaces);
    expect(admit(many, JELLY_BUDGETS.coarse.rims)).toHaveLength(16);
    expect(admit(many, JELLY_BUDGETS.handheld.rims)).toHaveLength(10);
    expect(admit(many, 2)).toHaveLength(2);
    expect(admit(many, 0)).toHaveLength(0);
    expect(admit(many, 100)).toHaveLength(GLASS_BUDGET.maxSurfaces);
  });

  it('no haze canvas exceeds 256px on its long side (128 for fills), nor a quarter of the CSS size', () => {
    for (const [w, h] of [
      [40, 40],
      [360, 180],
      [1200, 56],
      [1920, 1080],
      [4000, 300],
      [300, 5000],
    ]) {
      for (const role of ['overlay', 'chrome', 'pane', 'fill'] as GlassRole[]) {
        const [pw, ph] = hazeSize(w, h, role);
        const cap = role === 'fill' ? HAZE.fillMaxSide : HAZE.maxSide;
        expect(Math.max(pw, ph)).toBeLessThanOrEqual(cap + 1);
        expect(hazeScaleFor(w, h, role)).toBeLessThanOrEqual(HAZE.baseScale);
      }
    }
  });

  it("the governor's haze-scale step lowers the scale and never raises it", () => {
    expect(knobsAt(5).hazeScale).toBe(GOVERNED_HAZE_SCALE);
    expect(hazeScaleFor(360, 180, 'pane', knobsAt(5).hazeScale)).toBe(GOVERNED_HAZE_SCALE);
    expect(hazeScaleFor(360, 180, 'pane', knobsAt(0).hazeScale)).toBe(HAZE.baseScale);
    expect(hazeScaleFor(3000, 3000, 'pane', knobsAt(5).hazeScale)).toBeLessThan(
      GOVERNED_HAZE_SCALE,
    );
  });
});

describe('haze scheduling', () => {
  const tickets = (dues: number[]) => dues.map((due, id) => ({ id, due }));

  it('draws at most 6 haze surfaces in one frame, however many are due', () => {
    const all = tickets(Array.from({ length: 24 }, () => 0));
    expect(dueHaze(all, 100)).toHaveLength(HAZE.maxDrawsPerFrame);
    expect(HAZE.maxDrawsPerFrame).toBe(6);
    expect(dueHaze(all, 100, 50)).toHaveLength(6);
    expect(dueHaze(all, 100, 2)).toHaveLength(2);
  });

  it('takes the oldest due first and leaves the not-yet-due alone (a round robin)', () => {
    const t = tickets([50, 10, 500, 30, 1000]);
    expect(dueHaze(t, 100).map((i) => i.id)).toEqual([1, 3, 0]);
    // Round robin: what is drawn moves to the back; the rest go first next tick.
    const items = tickets(Array.from({ length: 8 }, (_, i) => i));
    const drawnFirst = dueHaze(items, 100);
    for (const i of drawnFirst) i.due = nextDue(100, 30, 'pane');
    const second = dueHaze(items, 101);
    expect(second.map((i) => i.id)).toEqual([6, 7]);
  });

  it('fills tick at half rate, every other role at the clock; no clock means never due', () => {
    expect(nextDue(0, 30, 'pane')).toBeCloseTo(1000 / 30);
    expect(nextDue(0, 30, 'fill')).toBeCloseTo((1000 / 30) * HAZE.fillRateDivisor);
    expect(nextDue(0, 0, 'pane')).toBe(Infinity);
  });

  it('seeds are stable, in [0,1), and differ between neighbours', () => {
    const seeds = Array.from({ length: 24 }, (_, i) => seedFor(i));
    for (const s of seeds) expect(s >= 0 && s < 1).toBe(true);
    expect(new Set(seeds.map((s) => s.toFixed(4))).size).toBe(24);
    expect(seedFor(7)).toBe(seedFor(7));
  });
});

describe('lattice overdraw and charge pulse', () => {
  it('overdraws at most 2px, only on cards and controls, and never without lattices', () => {
    expect(overdrawMargin('fill', true)).toBe(AMBIENT_BOUNDS.maxOverdrawPx);
    expect(overdrawMargin('control', true)).toBeLessThanOrEqual(2);
    for (const r of ['overlay', 'chrome', 'pane'] as GlassRole[])
      expect(overdrawMargin(r, true)).toBe(0);
    for (const r of ['fill', 'control'] as GlassRole[]) expect(overdrawMargin(r, false)).toBe(0);
  });

  it('halves the lattice amplitude on large surfaces', () => {
    expect(latticeAmplitude(300, 120)).toBe(1);
    expect(latticeAmplitude(1000, 400)).toBe(AMBIENT_BOUNDS.largeLatticeScale);
  });

  it('a pulse peaks at its strength, decays to 0 within ~300ms, and is bounded', () => {
    expect(pulseLevel(1, 0)).toBe(PULSE.maxBoost);
    expect(pulseLevel(0.5, 0)).toBeCloseTo(PULSE.maxBoost / 2);
    expect(pulseLevel(1, 150)).toBeLessThan(pulseLevel(1, 50));
    expect(pulseLevel(1, PULSE.durationMs)).toBe(0);
    expect(pulseLevel(1, -5)).toBe(0);
    expect(pulseLevel(9, 0)).toBe(PULSE.maxBoost);
  });
});

describe('shader contract', () => {
  it('the rim reads the lattice and jelly terms but never a clock; the haze reads the clock', () => {
    expect(FRAG).toContain('uniform vec2 uJelly[8]');
    expect(FRAG).toContain('uJellyOn');
    expect(FRAG).toContain('uDispersion');
    expect(FRAG).not.toContain('uTime');
    expect(HAZE_FRAG).toContain('uniform float uTime');
    // Alpha is capped in the shader, far above what the legibility tokens allow.
    expect(HAZE_FRAG).toContain('clamp(hazeA + plasmaA + sss, 0.0, 0.6)');
  });
});
