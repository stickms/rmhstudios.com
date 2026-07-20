import { describe, it, expect } from 'vitest';
import {
  parseHomeStack,
  parseSidebarPref,
  parseLayoutPref,
  DEFAULT_HOME_STACK,
  layoutPrefsSchema,
} from '@/lib/home-widgets';

describe('parseHomeStack', () => {
  it('returns the default stack when empty or not an array', () => {
    expect(parseHomeStack([])).toEqual(DEFAULT_HOME_STACK);
    expect(parseHomeStack(undefined)).toEqual(DEFAULT_HOME_STACK);
    expect(parseHomeStack('nope')).toEqual(DEFAULT_HOME_STACK);
  });

  it('drops unknown widget kinds (forward-safe) and dedupes', () => {
    const parsed = parseHomeStack([
      { kind: 'arcade' },
      { kind: 'ghost-app' }, // removed widget — must be dropped
      { kind: 'arcade' }, // dupe — first wins
      { kind: 'wallet', collapsed: true },
    ]);
    expect(parsed).toEqual([{ kind: 'arcade' }, { kind: 'wallet', collapsed: true }]);
  });

  it('accepts bare string kinds', () => {
    expect(parseHomeStack(['streak', 'bogus'])).toEqual([{ kind: 'streak' }]);
  });
});

describe('parseSidebarPref', () => {
  it('keeps only known ids and dedupes', () => {
    expect(parseSidebarPref({ pinned: ['/store', '/store', '/not-real'], hidden: ['/arcade'] })).toEqual({
      pinned: ['/store'],
      hidden: ['/arcade'],
    });
  });

  it('resolves pin/hide conflicts in favor of pin', () => {
    expect(parseSidebarPref({ pinned: ['/library'], hidden: ['/library'] })).toEqual({
      pinned: ['/library'],
      hidden: [],
    });
  });

  it('tolerates garbage input', () => {
    expect(parseSidebarPref(null)).toEqual({ pinned: [], hidden: [] });
    expect(parseSidebarPref({ pinned: 'x', hidden: 3 })).toEqual({ pinned: [], hidden: [] });
  });
});

describe('parseLayoutPref', () => {
  it('combines both with unset row → defaults', () => {
    const p = parseLayoutPref(null);
    expect(p.sidebar).toEqual({ pinned: [], hidden: [] });
    expect(p.homeStack).toEqual(DEFAULT_HOME_STACK);
  });
});

describe('layoutPrefsSchema', () => {
  it('validates a partial payload', () => {
    expect(layoutPrefsSchema.safeParse({ homeStack: [{ kind: 'arcade' }] }).success).toBe(true);
    expect(layoutPrefsSchema.safeParse({ sidebar: { pinned: ['/store'] } }).success).toBe(true);
  });

  it('rejects unknown ids/kinds at the API boundary', () => {
    expect(layoutPrefsSchema.safeParse({ homeStack: [{ kind: 'bogus' }] }).success).toBe(false);
    expect(layoutPrefsSchema.safeParse({ sidebar: { pinned: ['/not-real'] } }).success).toBe(false);
  });
});
