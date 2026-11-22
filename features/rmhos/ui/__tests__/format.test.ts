import { describe, expect, it } from 'vitest';
import { formatBytes, formatTime } from '../format';

describe('formatBytes', () => {
  it("rounds kilobytes and shows one decimal of megabytes, with the locale's own digits and unit", () => {
    expect(formatBytes(22313, 'en')).toBe('22 kB');
    expect(formatBytes(1, 'en')).toBe('1 kB');
    expect(formatBytes(5 * 1024 * 1024, 'en')).toBe('5.0 MB');
    expect(formatBytes(5.5 * 1024 * 1024, 'de')).toBe('5,5 MB');
    expect(formatBytes(1536, 'fr')).toMatch(/^2\s?ko$/);
  });
  it('survives a locale the platform does not know', () => {
    expect(formatBytes(2048, 'not a locale')).toMatch(/2/);
  });
});

describe('formatTime', () => {
  const t = Date.UTC(2026, 10, 15, 13, 5);
  it("follows the app locale, not the browser's", () => {
    expect(formatTime(t, 'en')).toMatch(/Nov 15, 2026/);
    expect(formatTime(t, 'de')).toMatch(/15\.\s?11\.\s?2026/);
    expect(formatTime(t, 'en')).not.toBe(formatTime(t, 'de'));
  });
});
