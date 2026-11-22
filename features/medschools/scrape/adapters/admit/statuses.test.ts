import { describe, expect, it } from 'vitest';
import { flagToProgram, mapStatus } from './statuses';

describe('mapStatus', () => {
  it.each([
    ['ACCEPTED', 'ACCEPTANCE'],
    ['WAITLISTED', 'WAITLIST'],
    ['REJECTED', 'REJECTION'],
    ['INTERVIEW', 'INTERVIEW'],
    ['WITHDRAWN', 'WITHDRAWN'],
    ['HOLD', 'HOLD'],
  ])('%s maps to %s', (raw, event) => {
    expect(mapStatus(raw)).toBe(event);
  });

  it('is case- and whitespace-tolerant', () => {
    expect(mapStatus(' accepted ')).toBe('ACCEPTANCE');
  });

  it('SECONDARY, unknown values and the empty string are skipped, not thrown', () => {
    expect(mapStatus('SECONDARY')).toBeNull();
    expect(mapStatus('SOMETHING_NEW')).toBeNull();
    expect(mapStatus('')).toBeNull();
  });
});

describe('flagToProgram', () => {
  it('PHD and REG pass through; UNREADABLE is not reported', () => {
    expect(flagToProgram('PHD')).toBe('PHD');
    expect(flagToProgram('REG')).toBe('REG');
    expect(flagToProgram('UNREADABLE')).toBeNull();
  });
});
