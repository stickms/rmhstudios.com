import { describe, it, expect } from 'vitest';
import {
  emptyPlot, plantPlot, canTend, tendPlot, plotQuality, harvestPlot, canCollect, collectDried,
  TEND_COOLDOWN_MS, WILT_GRACE_MS, DRY_COOLDOWN_MS,
} from '../cultivation';

const T0 = 1_000_000;

describe('plant', () => {
  it('plants only from empty and sets seedling', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(p.stage).toBe('seedling');
    expect(p.baseId).toBe('couchlock');
    expect(p.lastAdvancedAt).toBe(T0);
  });
});

describe('tend cooldown', () => {
  it('cannot tend before cooldown elapses', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(canTend(p, T0 + TEND_COOLDOWN_MS - 1)).toBe(false);
    expect(canTend(p, T0 + TEND_COOLDOWN_MS)).toBe(true);
  });
  it('tendPlot is a no-op before cooldown', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(tendPlot(p, T0 + 1)).toBe(p);
  });
});

describe('grow to harvest', () => {
  it('advances seedling -> vegetative -> flowering on time with full care', () => {
    let p = plantPlot(emptyPlot(), 'couchlock', T0);
    p = tendPlot(p, T0 + TEND_COOLDOWN_MS);
    expect(p.stage).toBe('vegetative');
    p = tendPlot(p, T0 + 2 * TEND_COOLDOWN_MS);
    expect(p.stage).toBe('flowering');
    expect(plotQuality(p)).toBeCloseTo(1, 5);
  });
  it('wilted tends reduce quality', () => {
    let p = plantPlot(emptyPlot(), 'couchlock', T0);
    const late = TEND_COOLDOWN_MS + WILT_GRACE_MS + 1;
    p = tendPlot(p, T0 + late);              // wilted -> 0.5
    p = tendPlot(p, T0 + late + late);       // wilted -> 0.5
    expect(p.stage).toBe('flowering');
    expect(plotQuality(p)).toBeCloseTo(0.5, 5);
  });
});

describe('harvest + dry', () => {
  it('harvest only from flowering, produces wet batch and empties plot', () => {
    let p = plantPlot(emptyPlot(), 'zoomhaze', T0);
    p = tendPlot(p, T0 + TEND_COOLDOWN_MS);
    p = tendPlot(p, T0 + 2 * TEND_COOLDOWN_MS);
    const h = harvestPlot(p, T0 + 3 * TEND_COOLDOWN_MS);
    expect(h).not.toBeNull();
    expect(h!.wet.baseId).toBe('zoomhaze');
    expect(h!.wet.quality).toBeCloseTo(1, 5);
    expect(h!.plot.stage).toBe('empty');
  });
  it('harvest returns null when not flowering', () => {
    const p = plantPlot(emptyPlot(), 'zoomhaze', T0);
    expect(harvestPlot(p, T0)).toBeNull();
  });
  it('drying respects the dry cooldown then yields a stock entry', () => {
    const wet = { baseId: 'glimmerdust' as const, quality: 1, dryStartedAt: T0 };
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS - 1)).toBe(false);
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS)).toBe(true);
    const entry = collectDried(wet);
    expect(entry.baseId).toBe('glimmerdust');
    expect(entry.qualityMult).toBeCloseTo(1.3, 5);
    expect(entry.units).toBe(9);                 // q=1 -> GROW_YIELD.max
    expect(entry.bonusEffects).toEqual(['glowing']);
  });
});

describe('cooldownMult', () => {
  it('canTend gate scales with cooldownMult (faster when < 1)', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    // at 0.5x, half the base cooldown is enough
    expect(canTend(p, T0 + TEND_COOLDOWN_MS / 2, 0.5)).toBe(true);
    expect(canTend(p, T0 + TEND_COOLDOWN_MS / 2)).toBe(false); // default 1x not yet
  });
  it('tendPlot respects the scaled gate', () => {
    const p = plantPlot(emptyPlot(), 'couchlock', T0);
    expect(tendPlot(p, T0 + TEND_COOLDOWN_MS / 2, 0.5).stage).toBe('vegetative');
    expect(tendPlot(p, T0 + TEND_COOLDOWN_MS / 2)).toBe(p); // default 1x: no-op
  });
  it('canCollect gate scales with cooldownMult', () => {
    const wet = { baseId: 'glimmerdust' as const, quality: 1, dryStartedAt: T0 };
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS / 2, 0.5)).toBe(true);
    expect(canCollect(wet, T0 + DRY_COOLDOWN_MS / 2)).toBe(false);
  });
});
