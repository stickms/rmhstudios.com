import { describe, it, expect } from 'vitest';
import { decideAlert, type AlertFacts } from '@/lib/wishlist/price-alerts';

const base: AlertFacts = {
  currentPrice: 500,
  lastSeenPrice: 500,
  targetPrice: null,
  inDailyShop: false,
  dateKey: '2026-10-12',
  owned: false,
  lastAlertKey: null,
};

describe('decideAlert (C8)', () => {
  it('stays quiet when nothing changed', () => {
    expect(decideAlert(base)).toBeNull();
  });

  it('alerts on a price drop, keyed by the new price', () => {
    expect(decideAlert({ ...base, currentPrice: 400 })).toEqual({
      reason: 'price-drop',
      key: 'drop:400',
    });
  });

  it('does not alert on a price rise, or on the first look', () => {
    expect(decideAlert({ ...base, currentPrice: 600 })).toBeNull();
    expect(decideAlert({ ...base, lastSeenPrice: null, currentPrice: 400 })).toBeNull();
  });

  it('alerts when the daily shop features it, once per date', () => {
    const f = { ...base, inDailyShop: true };
    expect(decideAlert(f)).toEqual({ reason: 'daily-shop', key: 'daily:2026-10-12' });
    expect(decideAlert({ ...f, lastAlertKey: 'daily:2026-10-12' })).toBeNull();
    expect(decideAlert({ ...f, lastAlertKey: 'daily:2026-10-11' })).not.toBeNull();
  });

  it('does not repeat the same drop, but does alert on a further drop', () => {
    const dropped = { ...base, lastSeenPrice: 500, currentPrice: 400, lastAlertKey: 'drop:400' };
    expect(decideAlert(dropped)).toBeNull();
    expect(decideAlert({ ...dropped, lastSeenPrice: 400, currentPrice: 350 })).toEqual({
      reason: 'price-drop',
      key: 'drop:350',
    });
  });

  it('honours the member’s target price', () => {
    expect(decideAlert({ ...base, targetPrice: 500 })).toEqual({
      reason: 'target-met',
      key: 'target:500',
    });
    expect(decideAlert({ ...base, targetPrice: 499 })).toBeNull();
    expect(decideAlert({ ...base, targetPrice: 500, lastAlertKey: 'target:500' })).toBeNull();
  });

  it('prefers the price drop, but falls through to the daily shop once the drop was announced', () => {
    const f = { ...base, currentPrice: 400, inDailyShop: true };
    expect(decideAlert(f)?.reason).toBe('price-drop');
    expect(decideAlert({ ...f, lastAlertKey: 'drop:400' })).toEqual({
      reason: 'daily-shop',
      key: 'daily:2026-10-12',
    });
  });

  it('never tells a member about something they already own', () => {
    expect(decideAlert({ ...base, currentPrice: 100, inDailyShop: true, owned: true })).toBeNull();
  });

  it('ignores a market item with no live listing', () => {
    expect(decideAlert({ ...base, currentPrice: null, targetPrice: 1000 })).toBeNull();
  });
});
