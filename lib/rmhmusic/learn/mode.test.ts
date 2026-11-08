import { describe, expect, it } from 'vitest';
import { resolveMode, serializeMode } from './mode';

describe('resolveMode', () => {
  it('follows the system when nothing is stored', () => {
    expect(resolveMode(null, false)).toBe('light');
    expect(resolveMode(null, true)).toBe('dark');
  });

  it('a stored choice wins over the system', () => {
    expect(resolveMode(serializeMode('light'), true)).toBe('light');
    expect(resolveMode(serializeMode('dark'), false)).toBe('dark');
  });

  it('anything that is not a stored boolean falls back to the system', () => {
    for (const junk of [
      '',
      'dark',
      '"dark"',
      '{',
      'null',
      '[]',
      '{"dark":"yes"}',
      '{"mode":"dark"}',
    ]) {
      expect(resolveMode(junk, true)).toBe('dark');
      expect(resolveMode(junk, false)).toBe('light');
    }
  });

  it('stores the shape the pre-paint script reads (a boolean `dark` flag)', () => {
    expect(JSON.parse(serializeMode('dark'))).toEqual({ dark: true });
    expect(JSON.parse(serializeMode('light'))).toEqual({ dark: false });
  });
});
