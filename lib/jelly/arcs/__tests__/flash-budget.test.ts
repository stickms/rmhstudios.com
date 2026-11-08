/**
 * The combined flash caps (WCAG 2.3.1 hard gate, Task 9 fix round 1), asserted on the layers the renderer actually
 * draws (`boltLayers`, `impactItem`, `flareItem`: the renderer takes its alphas from the same builders), in the worst
 * case: the full ledger concurrency (3 bolts live, 7 impacts: 3 bolts × 2 rim ends + the press point), two flares,
 * very long bolts with every branch, a very large host, every layer at its peak, the glow token fully opaque and white
 * light. Nothing here echoes a constant against itself.
 */
import { describe, expect, it } from 'vitest';

import { FLASH_LUMINANCE, IMPACT, impactSample } from '../impact';
import {
  FLASH_GROUND,
  boltLayers,
  centreBound,
  centreBudget,
  centreScale,
  centreScales,
  fitFrame,
  flareItem,
  flashThreshold,
  frameArea,
  impactItem,
  profileAt,
  type AreaLayer,
  type CentreItem,
} from '../flash-budget';

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Brute-force: the summed coverage of every item's profiles at pixel (x, y). */
function coverageAt(
  items: readonly CentreItem[],
  x: number,
  y: number,
  scale: number | readonly number[],
): number {
  let sum = 0;
  items.forEach((it, k) => {
    const d = Math.hypot(x - it.x, y - it.y);
    const sc = typeof scale === 'number' ? scale : scale[k];
    for (const p of it.profiles) sum += profileAt(p, d) * sc;
  });
  return sum;
}

/** The time in the impact at which the summed centre stack of one impact is largest. */
function peakImpactT(): number {
  let best = 0;
  let bestT = 0;
  for (let t = 0; t < IMPACT.lifeMs; t += 1) {
    const s = impactSample(t, { click: true })!;
    const v = s.flash * (1 + 2 * IMPACT.streakAlpha) + s.ringAlpha;
    if (v > best) {
      best = v;
      bestT = t;
    }
  }
  return bestT;
}

/** Seven impacts, two flares and every contact of three bolts, piled up on one host corner (the worst overlap). */
function worstItems(dark: boolean, spread: number): CentreItem[] {
  const t = peakImpactT();
  const items: CentreItem[] = [];
  const at = (k: number) => ({ x: 400 + ((k * 7) % 5) * spread, y: 300 + ((k * 3) % 4) * spread });
  for (let k = 0; k < 7; k++) {
    items.push(
      impactItem({
        ...at(k),
        sample: impactSample(t, { click: k === 6 }),
        ring: true,
        contactAlpha: k < 6 ? 1 : 0,
        rimK: k < 6 ? 1 : 0,
        dark,
        glowAlpha: 1,
        values: { glow: 1, hot: 1 },
      }).centre,
    );
  }
  for (let k = 0; k < 2; k++)
    items.push(flareItem({ ...at(k), glow: 1, glowAlpha: 1, value: 1 }).centre);
  return items;
}

describe('the per-pixel cap: every impact layer, combined', () => {
  it('the budgets are the coverage that changes luminance by exactly maxPeak on the worst ground', () => {
    const g = FLASH_GROUND.darkMaxValue;
    expect(lin(g + centreBudget(true)) - lin(g)).toBeCloseTo(FLASH_LUMINANCE.maxPeak, 3);
    expect(1 - lin(1 - centreBudget(false))).toBeCloseTo(FLASH_LUMINANCE.maxPeak, 3);
    expect(lin(g + flashThreshold(true)) - lin(g)).toBeCloseTo(FLASH_LUMINANCE.flashDelta, 3);
    expect(1 - lin(1 - flashThreshold(false))).toBeCloseTo(FLASH_LUMINANCE.flashDelta, 3);
  });

  it('the reviewer’s case: one impact’s disc, both streaks, ring, lit rim and contact, combined, at every pixel', () => {
    for (const dark of [true, false]) {
      for (let t = 0; t < IMPACT.lifeMs; t += 6) {
        const item = impactItem({
          x: 0,
          y: 0,
          sample: impactSample(t, { click: true }),
          ring: true,
          contactAlpha: 1,
          rimK: 1,
          dark,
          glowAlpha: 1,
          values: { glow: 1, hot: 1 },
        }).centre;
        const c = centreScale([item], dark);
        let max = 0;
        for (let d = 0; d <= 130; d += 0.25) max = Math.max(max, coverageAt([item], d, 0, c));
        expect(max, `t=${t}`).toBeLessThanOrEqual(centreBudget(dark) + 1e-9);
      }
    }
  });

  it('worst case, every layer on, impacts piled up or spread: no pixel exceeds the cap (brute-force raster)', () => {
    for (const dark of [true, false]) {
      for (const spread of [0, 3, 11, 30]) {
        const items = worstItems(dark, spread);
        const scales = centreScales(items, dark);
        expect(Math.min(...scales)).toBeGreaterThan(0);
        // Uncapped, the pile-up really is over the budget: the gate is not vacuous.
        expect(coverageAt(items, 400, 300, 1)).toBeGreaterThan(centreBudget(dark));
        let max = 0;
        for (let y = 150; y <= 470; y += 1.5) {
          for (let x = 250; x <= 580; x += 1.5)
            max = Math.max(max, coverageAt(items, x, y, scales));
        }
        expect(max).toBeLessThanOrEqual(centreBudget(dark) + 1e-9);
        // The analytic bound is never below what is really drawn unscaled.
        let raw = 0;
        for (let y = 150; y <= 470; y += 3) {
          for (let x = 250; x <= 580; x += 3) raw = Math.max(raw, coverageAt(items, x, y, 1));
        }
        expect(centreBound(items)).toBeGreaterThanOrEqual(raw - 1e-9);
      }
    }
  });

  it('two separate groups: per-item scales hold the cap everywhere, and a far group is not dimmed by a crowded one', () => {
    for (const dark of [true, false]) {
      const crowd = worstItems(dark, 3);
      const t = peakImpactT();
      const far = impactItem({
        x: 1400,
        y: 300,
        sample: impactSample(t),
        ring: true,
        contactAlpha: 0,
        rimK: 1,
        dark,
        glowAlpha: 0.55,
        values: { glow: 1, hot: 1 },
      }).centre;
      const items = [...crowd, far];
      const scales = centreScales(items, dark);
      expect(scales[items.length - 1]).toBeGreaterThan(Math.max(...scales.slice(0, -1)));
      let max = 0;
      for (let y = 150; y <= 470; y += 2) {
        for (let x = 250; x <= 1560; x += 2) max = Math.max(max, coverageAt(items, x, y, scales));
      }
      expect(max).toBeLessThanOrEqual(centreBudget(dark) + 1e-9);
    }
  });

  it('a lone small impact is not dimmed for nothing', () => {
    const item = impactItem({
      x: 0,
      y: 0,
      sample: impactSample(IMPACT.lifeMs - 20)!,
      ring: false,
      contactAlpha: 0,
      rimK: 0,
      dark: true,
      glowAlpha: 0.55,
      values: { glow: 1, hot: 1 },
    }).centre;
    expect(centreScale([item], true)).toBe(1);
  });
});

describe('the frame area budget: every layer counted', () => {
  const worstFrame = (dark: boolean) => {
    const scaled: AreaLayer[] = [];
    const lines: AreaLayer[] = [];
    for (let b = 0; b < 3; b++) {
      const l = boltLayers({
        energy: 1,
        k: 1,
        dark,
        glowAlpha: 1,
        coreValue: 1,
        fringeValue: 1,
        halo: true,
        mainLength: 1500,
        branches: [
          { length: 400, intensity: 0.5 },
          { length: 400, intensity: 0.5 },
          { length: 400, intensity: 0.5 },
        ],
        stubLengths: [22, 22],
      });
      scaled.push(...l.scaled);
      lines.push(...l.lines);
    }
    const t = peakImpactT();
    for (let k = 0; k < 7; k++) {
      scaled.push(
        ...impactItem({
          x: k * 200,
          y: 0,
          sample: impactSample(t, { click: k === 6 }),
          ring: true,
          contactAlpha: 1,
          rimK: 1,
          dark,
          glowAlpha: 1,
          values: { glow: 1, hot: 1 },
        }).area,
      );
    }
    for (let k = 0; k < 2; k++)
      scaled.push(...flareItem({ x: 0, y: 0, glow: 1, glowAlpha: 1, value: 1 }).area);
    // A further arc's contacts still in their pre-glow (the disc has not taken over yet).
    for (let k = 0; k < 2; k++) {
      scaled.push(
        ...impactItem({
          x: k * 50,
          y: 400,
          sample: null,
          ring: false,
          contactAlpha: 1,
          rimK: 0,
          dark,
          glowAlpha: 1,
          values: { glow: 1, hot: 1 },
        }).area,
      );
    }
    return { scaled, lines };
  };

  it('worst case: uncapped it would exceed the budget; capped, every layer’s ≥ 0.1 ΔL area fits', () => {
    for (const dark of [true, false]) {
      const { scaled, lines } = worstFrame(dark);
      const thr = flashThreshold(dark);
      expect(frameArea(scaled, 1, thr) + frameArea(lines, 1, thr)).toBeGreaterThan(
        FLASH_LUMINANCE.areaBudgetPx2,
      );
      const { scale, lineScale } = fitFrame(scaled, lines, dark);
      const total = frameArea(scaled, scale, thr) + frameArea(lines, lineScale, thr);
      expect(total).toBeLessThanOrEqual(FLASH_LUMINANCE.areaBudgetPx2);
      expect(scale).toBeGreaterThan(0);
    }
  });

  it('every kind of drawn layer is in the budget (a missing layer shows up as a missing kind)', () => {
    const { scaled, lines } = worstFrame(true);
    const kinds = new Set([...scaled, ...lines].map((l) => l.tag));
    for (const k of [
      'bloom',
      'mid',
      'core',
      'hot',
      'halo',
      'stub-glow',
      'stub-core',
      'stub-hot',
      'disc',
      'streak',
      'cross-streak',
      'ring',
      'rim',
      'rim-white',
      'contact',
      'flare',
    ]) {
      expect(kinds, k).toContain(k);
    }
  });

  it('a typical single click bolt fits without any dimming', () => {
    const l = boltLayers({
      energy: 0.9,
      k: 1,
      dark: true,
      glowAlpha: 0.55,
      coreValue: 1,
      fringeValue: 1,
      halo: true,
      mainLength: 90,
      branches: [],
      stubLengths: [22, 22],
    });
    const fit = fitFrame(l.scaled, l.lines, true);
    expect(fit.scale).toBe(1);
    expect(fit.lineScale).toBe(1);
  });
});
