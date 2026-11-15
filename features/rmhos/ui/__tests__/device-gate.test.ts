import { describe, expect, it } from 'vitest';
import { deviceGate } from '../device-gate';

const f = (coarsePointer: boolean, innerWidth: number, deviceMemory?: number) => ({
  coarsePointer,
  innerWidth,
  deviceMemory,
});

describe('deviceGate', () => {
  it.each([
    ['desktop, fine pointer', f(false, 1280, 8), { warn: false, lowMemory: false }],
    ['desktop that reports no memory (Firefox, Safari)', f(false, 1280), { warn: false, lowMemory: false }],
    ['phone, little memory', f(true, 390, 2), { warn: true, lowMemory: true }],
    ['phone with plenty of memory is still a phone', f(true, 390, 8), { warn: true, lowMemory: false }],
    ['iPad: wide, coarse, memory not reported', f(true, 1024, undefined), { warn: true, lowMemory: true }],
    ['tablet reporting 4 GB', f(true, 1024, 4), { warn: true, lowMemory: true }],
    ['tablet reporting 8 GB', f(true, 1024, 8), { warn: false, lowMemory: false }],
    ['a narrow desktop window is not a phone', f(false, 500, 8), { warn: false, lowMemory: false }],
  ])('%s', (_n, facts, want) => {
    expect(deviceGate(facts)).toEqual(want);
  });
});
