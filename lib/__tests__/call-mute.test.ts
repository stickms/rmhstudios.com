import { describe, expect, it } from 'vitest';
import {
  CALL_MUTE_DURATIONS,
  CALL_MUTE_DURATION_KEYS,
  isCallMuteDuration,
  isMuteActive,
  muteUntil,
} from '@/lib/call/mute';

describe('call mute durations', () => {
  it('offers 1h, 8h, 24h and 1w, shortest first', () => {
    expect(CALL_MUTE_DURATION_KEYS).toEqual(['1h', '8h', '24h', '1w']);
    const lengths = CALL_MUTE_DURATION_KEYS.map((k) => CALL_MUTE_DURATIONS[k]);
    expect([...lengths].sort((a, b) => a - b)).toEqual(lengths);
  });

  it('computes the deadline from the moment of muting', () => {
    expect(muteUntil('1h', 1_000).getTime()).toBe(1_000 + 3_600_000);
    expect(muteUntil('1w', 0).getTime()).toBe(7 * 24 * 3_600_000);
  });

  it('only accepts the offered keys, not inherited object properties', () => {
    expect(isCallMuteDuration('24h')).toBe(true);
    for (const bad of ['2h', '', null, undefined, 3600, 'toString', 'constructor', '__proto__']) {
      expect(isCallMuteDuration(bad)).toBe(false);
    }
  });

  it('treats a mute as lapsed exactly at its deadline', () => {
    expect(isMuteActive(1_000, 999)).toBe(true);
    expect(isMuteActive(1_000, 1_000)).toBe(false);
    expect(isMuteActive(new Date(1_000), 1_001)).toBe(false);
    expect(isMuteActive(null)).toBe(false);
    expect(isMuteActive(undefined)).toBe(false);
  });
});
