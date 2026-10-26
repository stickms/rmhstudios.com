import { describe, expect, it } from 'vitest';
import { boundedInteger, pageSize } from '@/lib/pagination';

describe('pagination input boundary', () => {
  it.each([
    null,
    undefined,
    '',
    ' ',
    'abc',
    '12garbage',
    '1.5',
    '1e3',
    '0x10',
    'Infinity',
    '9007199254740992',
    NaN,
    Infinity,
    1.5,
  ])('uses the default for malformed input %s', (value) => expect(pageSize(value)).toBe(20));
  it.each([
    ['-10', 1],
    ['0', 1],
    ['1', 1],
    [' 12 ', 12],
    ['+25', 25],
    ['999999', 50],
  ] as const)('bounds %s to %i', (value, expected) => expect(pageSize(value)).toBe(expected));
  it('preserves per-endpoint defaults and bounds offsets', () => {
    expect(pageSize(null, 6, 20)).toBe(6);
    expect(pageSize('9999', 6, 20)).toBe(20);
    expect(boundedInteger('-1', 0, 0, 2_147_483_647)).toBe(0);
    expect(boundedInteger('Infinity', 0, 0, 2_147_483_647)).toBe(0);
    expect(boundedInteger('99999999999', 0, 0, 2_147_483_647)).toBe(2_147_483_647);
  });
});
