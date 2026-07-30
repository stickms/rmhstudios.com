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
    expect(
      parseSidebarPref({ pinned: ['/store', '/store', '/not-real'], hidden: ['/predictions'] }),
    ).toEqual({
      pinned: ['/store'],
      hidden: ['/predictions'],
      order: [],
    });
  });

  it('drops a retired tab id (forward-safe across nav changes)', () => {
    // '/arcade' was a nav wedge until the Arcade Pass moved into Create's Games
    // tab. A pref saved while it existed must still parse — minus that id —
    // rather than being rejected wholesale.
    expect(parseSidebarPref({ pinned: ['/store'], hidden: ['/arcade'] })).toEqual({
      pinned: ['/store'],
      hidden: [],
      order: [],
    });
  });

  it('resolves pin/hide conflicts in favor of pin', () => {
    expect(parseSidebarPref({ pinned: ['/library'], hidden: ['/library'] })).toEqual({
      pinned: ['/library'],
      hidden: [],
      order: [],
    });
  });

  it('parses order: preserves sequence, drops unknown/non-orderable, dedupes', () => {
    expect(
      parseSidebarPref({
        order: ['/store', '/services', '/store', '/admin', '/not-real', '/'],
      }),
    ).toEqual({
      pinned: [],
      hidden: [],
      // '/admin' isn't orderable and '/not-real' is unknown — both dropped. A
      // saved order naming the retired `group:services` / `group:ventures` ids
      // takes the '/not-real' path: dropped, and the tab keeps its default slot.
      order: ['/store', '/services', '/'],
    });
  });

  it('only hides leaves in the hideable set (never Home or a hub page)', () => {
    expect(parseSidebarPref({ hidden: ['/', '/services', '/predictions'] })).toEqual({
      pinned: [],
      hidden: ['/predictions'],
      order: [],
    });
  });

  it('tolerates garbage input', () => {
    expect(parseSidebarPref(null)).toEqual({ pinned: [], hidden: [], order: [] });
    expect(parseSidebarPref({ pinned: 'x', hidden: 3, order: 7 })).toEqual({
      pinned: [],
      hidden: [],
      order: [],
    });
  });
});

describe('parseLayoutPref', () => {
  it('combines both with unset row → defaults', () => {
    const p = parseLayoutPref(null);
    expect(p.sidebar).toEqual({ pinned: [], hidden: [], order: [] });
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
