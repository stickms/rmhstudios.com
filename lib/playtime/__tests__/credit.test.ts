import { describe, expect, it } from 'vitest';
import {
  HEARTBEAT_MAX_CREDIT_S,
  HEARTBEAT_MIN_GAP_S,
  creditSeconds,
  shouldBeat,
} from '@/lib/playtime/credit';

const T0 = new Date('2026-10-30T12:00:00.000Z');
const after = (s: number) => new Date(T0.getTime() + s * 1000);

describe('creditSeconds', () => {
  it('pins the constants the client cadence is built around', () => {
    expect(HEARTBEAT_MIN_GAP_S).toBe(20);
    expect(HEARTBEAT_MAX_CREDIT_S).toBe(60);
  });

  it('credits nothing for a beat closer than 20 s to the last one', () => {
    expect(creditSeconds(T0, after(5))).toBe(0);
    expect(creditSeconds(T0, after(19.9))).toBe(0);
  });

  it('credits the real gap once it is at least 20 s', () => {
    expect(creditSeconds(T0, after(20))).toBe(20);
    expect(creditSeconds(T0, after(45))).toBe(45);
  });

  it('caps a long gap at 60 s, so a closed tab cannot bank hours', () => {
    expect(creditSeconds(T0, after(600))).toBe(60);
  });

  it('credits one client interval (30 s) for the first beat ever', () => {
    expect(creditSeconds(null, T0)).toBe(30);
  });

  it('credits nothing when the clock goes backwards', () => {
    expect(creditSeconds(after(10), T0)).toBe(0);
  });
});

describe('shouldBeat', () => {
  const now = 1_000_000_000;
  const base = { visible: true, signedIn: true, lastInputAt: now - 1000, now };

  it('beats when signed in, visible and recently active', () => {
    expect(shouldBeat(base)).toBe(true);
  });

  it('stops at exactly 5 minutes of inactivity plus one millisecond', () => {
    expect(shouldBeat({ ...base, lastInputAt: now - 5 * 60_000 })).toBe(true);
    expect(shouldBeat({ ...base, lastInputAt: now - 5 * 60_000 - 1 })).toBe(false);
  });

  it('never beats when hidden or signed out', () => {
    expect(shouldBeat({ ...base, visible: false })).toBe(false);
    expect(shouldBeat({ ...base, signedIn: false })).toBe(false);
  });
});
