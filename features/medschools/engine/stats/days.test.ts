import { describe, expect, it } from 'vitest';
import { dayOfCycle } from '../cycle';
import { addDays, dateOfIndex, dayIndex } from './days';

describe('days', () => {
  it('counts whole UTC days from the epoch', () => {
    expect(dayIndex('1970-01-01')).toBe(0);
    expect(dayIndex('1970-01-02')).toBe(1);
  });
  it('crosses leap days and years', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
    expect(addDays('2026-06-01', -1)).toBe('2026-05-31');
  });
  it('round-trips', () => {
    for (const d of ['2024-02-29', '2026-11-23']) expect(dateOfIndex(dayIndex(d))).toBe(d);
  });
  it('rejects a bad or impossible date', () => {
    expect(() => dayIndex('2026-02-30')).toThrow();
    expect(() => dayIndex('2026-2-3')).toThrow();
  });
  it('agrees with engine/cycle dayOfCycle', () => {
    expect(dayIndex('2027-01-01') - dayIndex('2026-06-01')).toBe(dayOfCycle('2027-01-01', '2026-06-01'));
  });
});
