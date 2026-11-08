import { describe, expect, it } from 'vitest';

import { CALM } from '../../tiers';
import { FLASH_LUMINANCE } from '../impact';
import { GLOW, arcIntensityScale, glowPasses } from '../glow';

describe('bolt glow passes', () => {
  it('layers a wide soft bloom, a mid glow and a white-hot core, widest first', () => {
    const p = glowPasses(true, 1, 1);
    expect(p.map((x) => x.id)).toEqual(['bloom', 'mid', 'core', 'hot']);
    for (let i = 1; i < p.length; i++) expect(p[i].width).toBeLessThan(p[i - 1].width);
    expect(p.find((x) => x.id === 'hot')!.colour).toBe('white');
  });

  it('only the glow splits into colours; the core stays one colour', () => {
    for (const x of glowPasses(true, 1, 1)) expect(x.split).toBe(x.colour === 'glow');
  });

  it('light themes draw no white-hot pass (white on white adds nothing)', () => {
    expect(glowPasses(false, 1, 1).some((x) => x.colour === 'white')).toBe(false);
  });

  it('every pass wider than the wide-band limit stays under a flash transition, even read as white', () => {
    for (const dark of [true, false]) {
      const wide = glowPasses(dark, 1, 1).filter((x) => x.width > GLOW.wideBandPx);
      expect(wide.length).toBeGreaterThan(0);
      expect(wide.reduce((s, x) => s + x.alpha, 0)).toBeLessThan(FLASH_LUMINANCE.flashDelta);
    }
  });

  it('alpha scales with intensity and energy widens the glow', () => {
    const full = glowPasses(true, 1, 1);
    const half = glowPasses(true, 1, 0.5);
    full.forEach((x, i) => expect(half[i].alpha).toBeCloseTo(x.alpha * 0.5));
    expect(glowPasses(true, 1, 0).every((x) => x.alpha === 0)).toBe(true);
    expect(glowPasses(true, 0, 1)[0].width).toBeLessThan(full[0].width);
    for (const x of glowPasses(true, 1, 7)) expect(x.alpha).toBeLessThanOrEqual(1);
  });

  it('calm scales the whole effect down; lively is full; still and off draw nothing', () => {
    expect(arcIntensityScale('lively')).toBe(1);
    expect(arcIntensityScale('calm')).toBe(CALM.arcIntensity);
    expect(CALM.arcIntensity).toBeLessThan(1);
    expect(arcIntensityScale('still')).toBe(0);
  });
});
