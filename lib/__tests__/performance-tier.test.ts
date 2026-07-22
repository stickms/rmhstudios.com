import { describe, expect, it } from 'vitest';
import { shouldUsePerfLite } from '../performance-tier';

describe('performance tier', () => {
  it('keeps the iOS safe liquid-glass tier on six-core iPhones', () => {
    expect(
      shouldUsePerfLite({
        deviceMemory: undefined,
        hardwareConcurrency: 6,
        saveData: false,
        iosWebKit: true,
      }),
    ).toBe(false);
  });

  it('honors Data Saver on iOS', () => {
    expect(
      shouldUsePerfLite({
        hardwareConcurrency: 6,
        saveData: true,
        iosWebKit: true,
      }),
    ).toBe(true);
  });

  it('avoids optional GPU work on constrained connections', () => {
    expect(
      shouldUsePerfLite({
        deviceMemory: 16,
        hardwareConcurrency: 16,
        effectiveType: '2g',
        iosWebKit: false,
      }),
    ).toBe(true);
    expect(
      shouldUsePerfLite({
        deviceMemory: 16,
        hardwareConcurrency: 16,
        downlinkMbps: 1.2,
        iosWebKit: false,
      }),
    ).toBe(true);
  });

  it('retains the generic memory and core heuristics elsewhere', () => {
    expect(shouldUsePerfLite({ deviceMemory: 4, iosWebKit: false })).toBe(true);
    expect(shouldUsePerfLite({ hardwareConcurrency: 4, iosWebKit: false })).toBe(true);
    expect(shouldUsePerfLite({ deviceMemory: 8, hardwareConcurrency: 8, iosWebKit: false })).toBe(
      false,
    );
  });
});
