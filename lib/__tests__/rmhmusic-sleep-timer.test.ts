import { describe, it, expect } from 'vitest';
import { fadedVolume, formatRemaining, nextSleepOption, SLEEP_FADE_MS } from '@/lib/rmhmusic/sleep-timer';

describe('sleep timer', () => {
  it('cycles Off → 15 → 30 → 45 → 60 → Off', () => {
    const seen: (number | null)[] = [];
    let cur: number | null = null;
    for (let i = 0; i < 5; i++) {
      cur = nextSleepOption(cur);
      seen.push(cur);
    }
    expect(seen).toEqual([15, 30, 45, 60, null]);
  });

  it('keeps the listener volume until the fade starts, then ramps to silence', () => {
    expect(fadedVolume(0.8, SLEEP_FADE_MS + 1)).toBe(0.8);
    expect(fadedVolume(0.8, SLEEP_FADE_MS / 2)).toBeCloseTo(0.4);
    expect(fadedVolume(0.8, 0)).toBe(0);
    expect(fadedVolume(0.8, -5)).toBe(0);
  });

  it('formats the countdown', () => {
    expect(formatRemaining(61_000)).toBe('1:01');
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(900_000)).toBe('15:00');
  });
});
