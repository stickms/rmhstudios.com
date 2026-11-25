import { describe, expect, it } from 'vitest';
import { REJECT_REASON_KEYS, decodeRunsCursor, encodeRunsCursor, parseSoloResult, rejectReasonKey } from '../runs';

describe('runs cursor', () => {
  it('round-trips a time and an id', () => {
    const cursor = { at: new Date('2026-11-01T10:20:30.456Z'), id: 'clx9abc' };
    const back = decodeRunsCursor(encodeRunsCursor(cursor));
    expect(back?.at.getTime()).toBe(cursor.at.getTime());
    expect(back?.id).toBe('clx9abc');
  });

  it('is url-safe', () => {
    expect(encodeRunsCursor({ at: new Date(0), id: '???>>>' })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each(['', '!!!', 'bm9kb3Q', 'MTIzLg', 'x'.repeat(300)])('rejects %s', (token) => {
    expect(decodeRunsCursor(token)).toBeNull();
  });
});

describe('reject reason map', () => {
  it('reads the code before the colon and ignores the detail', () => {
    expect(rejectReasonKey('claim_mismatch: kills 9 vs 4')).toBe('claim_mismatch');
    expect(rejectReasonKey('stale_sim: sim 4 vs 5')).toBe('stale_sim');
  });

  it('maps every verifier code to itself', () => {
    for (const key of REJECT_REASON_KEYS) expect(rejectReasonKey(`${key}: detail`)).toBe(key);
  });

  it('maps an unknown, empty or missing reason to unknown', () => {
    expect(rejectReasonKey('stored loadout invalid')).toBe('unknown');
    expect(rejectReasonKey('')).toBe('unknown');
    expect(rejectReasonKey(null)).toBe('unknown');
  });
});

describe('parseSoloResult', () => {
  it('reads the replay numbers', () => {
    expect(parseSoloResult({ status: 'dead', gameTime: 61, kills: 3, level: 2, bossesDefeated: [] })).toEqual({
      outcome: 'dead',
      timeSurvived: 61,
      kills: 3,
      level: 2,
      bosses: 0,
    });
  });

  it('returns null for anything that does not parse', () => {
    expect(parseSoloResult(null)).toBeNull();
    expect(parseSoloResult({ status: 'won' })).toBeNull();
    expect(parseSoloResult({ status: 'dead', gameTime: -1, kills: 1, level: 1 })).toBeNull();
  });
});
