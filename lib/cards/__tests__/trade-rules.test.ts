import { describe, expect, it } from 'vitest';
import {
  MAX_CARDS_PER_SIDE,
  MAX_QTY_PER_CARD,
  TRADE_TTL_DAYS,
  expiresAtFrom,
  isExpired,
  validateOffer,
  type OfferItem,
} from '../trade-rules';

const item = (cardIndex: number, qty = 1, foil = false, gameId = 'altair'): OfferItem => ({
  gameId,
  cardIndex,
  foil,
  qty,
});

describe('validateOffer', () => {
  it('accepts a swap and a one-sided gift', () => {
    expect(validateOffer({ give: [item(0)], ask: [item(1)] })).toBe('ok');
    expect(validateOffer({ give: [item(0)], ask: [] })).toBe('ok');
    expect(validateOffer({ give: [], ask: [item(1)] })).toBe('ok');
  });

  it('refuses an empty offer', () => {
    expect(validateOffer({ give: [], ask: [] })).toBe('empty');
  });

  it('refuses bad quantities and card indexes', () => {
    expect(validateOffer({ give: [item(0, 0)], ask: [] })).toBe('bad-item');
    expect(validateOffer({ give: [item(0, MAX_QTY_PER_CARD + 1)], ask: [] })).toBe('bad-item');
    expect(validateOffer({ give: [item(0, 1.5)], ask: [] })).toBe('bad-item');
    expect(validateOffer({ give: [item(6)], ask: [] })).toBe('bad-item');
    expect(validateOffer({ give: [item(-1)], ask: [] })).toBe('bad-item');
  });

  it('refuses the same card listed twice on one side', () => {
    expect(validateOffer({ give: [item(0), item(0)], ask: [] })).toBe('duplicate');
    expect(validateOffer({ give: [item(0), item(0, 1, true)], ask: [] })).toBe('ok');
  });

  it('caps distinct cards per side', () => {
    const many = Array.from({ length: MAX_CARDS_PER_SIDE + 1 }, (_, i) => item(i % 6, 1, false, `g${i}`));
    expect(validateOffer({ give: many, ask: [] })).toBe('too-many');
  });
});

describe('expiry', () => {
  it('lasts fourteen days', () => {
    const now = new Date('2026-10-30T00:00:00Z');
    const at = expiresAtFrom(now);
    expect(at.getTime() - now.getTime()).toBe(TRADE_TTL_DAYS * 86_400_000);
  });

  it('is expired at and after the deadline only', () => {
    const at = new Date('2026-11-13T00:00:00Z');
    expect(isExpired(at, new Date('2026-11-12T23:59:59Z'))).toBe(false);
    expect(isExpired(at, new Date('2026-11-13T00:00:00Z'))).toBe(true);
  });
});
