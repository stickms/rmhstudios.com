import { describe, it, expect } from 'vitest';
import { formatSoloResult } from '@/lib/rmhtype/result-text';

describe('formatSoloResult', () => {
  it('formats WPM, accuracy and seconds to one decimal', () => {
    expect(formatSoloResult({ wpm: 87, accuracy: 96, timeMs: 31_400 })).toBe(
      '87 WPM · 96% accuracy · 31.4s — RMHType',
    );
  });

  it('never shows a negative time', () => {
    expect(formatSoloResult({ wpm: 0, accuracy: 0, timeMs: -5 })).toBe('0 WPM · 0% accuracy · 0.0s — RMHType');
  });
});
