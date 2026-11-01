import { describe, expect, it } from 'vitest';
import { lengthState } from '@/lib/messages/length-counter';

describe('lengthState', () => {
  it('is hidden for ordinary messages', () => {
    expect(lengthState(0)).toBe('hidden');
    expect(lengthState(1799)).toBe('hidden');
  });
  it('warns from 90% of the limit', () => {
    expect(lengthState(1800)).toBe('warn');
    expect(lengthState(1999)).toBe('warn');
  });
  it('is full at the limit', () => {
    expect(lengthState(2000)).toBe('full');
  });
  it('respects a custom max', () => {
    expect(lengthState(9, 10)).toBe('warn');
    expect(lengthState(10, 10)).toBe('full');
    expect(lengthState(8, 10)).toBe('hidden');
  });
});
