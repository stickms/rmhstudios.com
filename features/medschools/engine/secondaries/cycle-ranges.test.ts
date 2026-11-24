import { describe, expect, it } from 'vitest';
import { cycleRanges, formatCycleRanges, formatCycleRangesIsolated } from './cycle-ranges';

describe('cycleRanges', () => {
  it('merges consecutive runs, sorts and de-duplicates', () => {
    expect(cycleRanges([2027, 2023, 2024, 2025, 2025])).toEqual([
      { from: 2023, to: 2025 },
      { from: 2027, to: 2027 },
    ]);
    expect(cycleRanges([])).toEqual([]);
    expect(cycleRanges([2024, 2026])).toEqual([
      { from: 2024, to: 2024 },
      { from: 2026, to: 2026 },
    ]);
  });
});

describe('formatCycleRanges (the site 2026–2027 labels, owner 2026-11-23)', () => {
  it('writes runs as "first to last" and a gap as a new range', () => {
    expect(formatCycleRanges([2024, 2025, 2026, 2028])).toBe('2023–2024 to 2025–2026, 2027–2028');
  });

  it('writes one cycle as its label and nothing as the empty string', () => {
    expect(formatCycleRanges([2027])).toBe('2026–2027');
    expect(formatCycleRanges([])).toBe('');
  });

  it('two consecutive cycles are a run, two apart are two ranges', () => {
    expect(formatCycleRanges([2024, 2025])).toBe('2023–2024 to 2024–2025');
    expect(formatCycleRanges([2024, 2026])).toBe('2023–2024, 2025–2026');
  });

  it('normalises unsorted, duplicate and gapped input (Review Focus 3)', () => {
    expect(formatCycleRanges([2028, 2024, 2025, 2026, 2026])).toBe('2023–2024 to 2025–2026, 2027–2028');
  });

  it('takes a translated joiner and separator', () => {
    expect(formatCycleRanges([2024, 2025, 2027], { joiner: ' → ', separator: '; ' })).toBe(
      '2023–2024 → 2024–2025; 2026–2027',
    );
  });

  it('the isolated form wraps each cycle in a left-to-right isolate and otherwise reads the same', () => {
    const s = formatCycleRangesIsolated([2024, 2025, 2027]);
    expect(s).toBe('⁦2023–2024⁩ to ⁦2024–2025⁩, ⁦2026–2027⁩');
    expect(s.replace(/[⁦⁩]/g, '')).toBe(formatCycleRanges([2024, 2025, 2027]));
  });
});
