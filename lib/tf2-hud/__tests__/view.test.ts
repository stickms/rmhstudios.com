import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, aspectLabel, screenOf, virtualSize, widthForAspect } from '../view';

describe('preview resolution helpers', () => {
  it('names common aspects and falls back to a decimal', () => {
    expect(aspectLabel(1920, 1080)).toBe('16:9');
    expect(aspectLabel(1280, 800)).toBe('16:10');
    expect(aspectLabel(1024, 768)).toBe('4:3');
    expect(aspectLabel(2560, 1080)).toBe('21:9');
    expect(aspectLabel(1000, 700)).toBe('1.43:1');
  });

  it('computes the proportional virtual canvas', () => {
    expect(virtualSize(1920, 1080)).toEqual({ w: 853, h: 480 });
    expect(virtualSize(1024, 768)).toEqual({ w: 640, h: 480 });
  });

  it('snaps a width to an aspect and clamps custom sizes', () => {
    expect(widthForAspect(16 / 9, 1080)).toBe(1920);
    expect(
      screenOf({ ...DEFAULT_VIEW, resolution: 'custom', custom: { w: 99999, h: 10 } }),
    ).toEqual({
      w: 7680,
      h: 320,
    });
  });
});

import { placeholderFor } from '../placeholders';

describe('placeholders for %variables%', () => {
  it('reads like the real value', () => {
    expect(placeholderFor('victorytime')).toMatch(/^\d:\d\d$/);
    expect(placeholderFor('classrecord3label')).toBe('Pyro');
    expect(placeholderFor('mapname')).toBe('cp_dustbowl');
    expect(placeholderFor('rank_possibility')).toBe('Rank Possibility');
    expect(placeholderFor('killername')).toBe('Player');
    expect(placeholderFor('stat_damage')).toMatch(/^[\d,]+$/);
    expect(placeholderFor('totalprice')).toMatch(/^[\d,]+$/);
  });

  it('is stable between calls', () => {
    expect(placeholderFor('stat_kills')).toBe(placeholderFor('stat_kills'));
  });
});
