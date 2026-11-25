import { describe, expect, it } from 'vitest';
import { RISK_SURFACE_PATHS, isRiskSurfacePath, withoutRiskSurfaces } from '@/lib/economy/risk-surfaces';

describe('isRiskSurfacePath', () => {
  it('matches the surfaces and everything under them', () => {
    expect(RISK_SURFACE_PATHS).toEqual(['/predictions', '/wager']);
    for (const href of [
      '/predictions',
      '/predictions/',
      '/predictions?tab=games',
      '/predictions?tab=games&game=blackjack&lobby=AB12CD',
      '/predictions#top',
      '/wager',
      '/wager/abc123',
      '/wager/$id',
      '/wager/abc123?x=1',
    ]) {
      expect(isRiskSurfacePath(href), href).toBe(true);
    }
  });

  it('matches the Compete hub only on its wagers tab', () => {
    expect(isRiskSurfacePath('/compete?tab=wagers')).toBe(true);
    expect(isRiskSurfacePath('/compete/?tab=wagers')).toBe(true);
    expect(isRiskSurfacePath('/compete?x=1&tab=wagers')).toBe(true);
    expect(isRiskSurfacePath('/compete')).toBe(false);
    expect(isRiskSurfacePath('/compete?tab=ranked')).toBe(false);
    expect(isRiskSurfacePath('/compete?tab=wagersx')).toBe(false);
  });

  it('does not match look-alikes, the wallet or admin pages', () => {
    for (const href of [
      '/',
      '/wallet',
      '/predictionsfoo',
      '/wagering',
      '/wagers',
      '/admin/predictions',
      '/games/predictions',
      '/settings/privacy',
      '',
    ]) {
      expect(isRiskSurfacePath(href), href).toBe(false);
    }
  });
});

describe('withoutRiskSurfaces', () => {
  const items = [{ href: '/store' }, { href: '/predictions' }, { href: '/compete?tab=wagers' }, { href: '/compete' }];

  it('drops the risk surfaces while hidden', () => {
    expect(withoutRiskSurfaces(items, true)).toEqual([{ href: '/store' }, { href: '/compete' }]);
  });

  it('returns the list untouched while not hidden', () => {
    expect(withoutRiskSurfaces(items, false)).toBe(items);
  });
});
