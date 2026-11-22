import { describe, it, expect } from 'vitest';
import { EXPIRING_SOON_DAYS, tokenExpiry } from '@/lib/rmhcode/token-expiry';

const NOW = new Date('2026-11-01T12:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

describe('tokenExpiry', () => {
  it('is expired at or before now', () => {
    expect(tokenExpiry(inDays(-1), NOW)).toBe('expired');
    expect(tokenExpiry(NOW.toISOString(), NOW)).toBe('expired');
  });

  it('is "soon" through the last EXPIRING_SOON_DAYS days, inclusive', () => {
    expect(tokenExpiry(inDays(0.5), NOW)).toBe('soon');
    expect(tokenExpiry(inDays(EXPIRING_SOON_DAYS), NOW)).toBe('soon');
  });

  it('is ok beyond that window', () => {
    expect(tokenExpiry(inDays(EXPIRING_SOON_DAYS + 0.01), NOW)).toBe('ok');
    expect(tokenExpiry(inDays(90), NOW)).toBe('ok');
  });

  it('treats an unparseable date as expired rather than valid', () => {
    expect(tokenExpiry('not a date', NOW)).toBe('expired');
  });
});
