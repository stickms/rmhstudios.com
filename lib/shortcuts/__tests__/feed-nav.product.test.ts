import { describe, expect, it } from 'vitest';
import {
  FEED_NAV_IDS,
  feedKeysOff,
  firstInView,
  isFeedNavId,
  isTypingTarget,
  nextIndex,
  prevIndex,
} from '@/lib/shortcuts/feed-nav';
import { DEFAULT_KEYBOARD_PREFS, effectiveBindings, type KeyboardPrefs } from '@/lib/shortcuts/bindings';
import { SITE_SHORTCUTS, findShortcutConflicts } from '@/lib/shortcuts/registry';

describe('index arithmetic', () => {
  it('moves forward and stops at the last post', () => {
    expect(nextIndex(0, 5)).toBe(1);
    expect(nextIndex(3, 5)).toBe(4);
    expect(nextIndex(4, 5)).toBe(4);
  });

  it('moves back and stops at the first post', () => {
    expect(prevIndex(4, 5)).toBe(3);
    expect(prevIndex(1, 5)).toBe(0);
    expect(prevIndex(0, 5)).toBe(0);
  });

  it('starts at the first post when none has focus', () => {
    expect(nextIndex(-1, 5)).toBe(0);
    expect(prevIndex(-1, 5)).toBe(0);
  });

  it('has nowhere to go in an empty list', () => {
    expect(nextIndex(-1, 0)).toBe(-1);
    expect(prevIndex(0, 0)).toBe(-1);
    expect(firstInView([], 800)).toBe(-1);
  });

  it('five presses of j from nothing land on the fifth post', () => {
    let at = -1;
    for (let i = 0; i < 5; i += 1) at = nextIndex(at, 20);
    expect(at).toBe(4);
  });

  it('finds the first post in view, or the first post when none is', () => {
    const rects = [
      {
        top: -900,
        bottom: -300,
      },
      {
        top: -300,
        bottom: 200,
      },
      {
        top: 200,
        bottom: 700,
      },
    ];
    expect(firstInView(rects, 800)).toBe(1);
    expect(
      firstInView(
        [
          {
            top: 2000,
            bottom: 2400,
          },
        ],
        800,
      ),
    ).toBe(0);
  });
});

describe('typing targets', () => {
  it('is false for anything that is not an element (a node server has no DOM)', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(feedKeysOff(null, null)).toBe(false);
    expect(feedKeysOff({} as unknown as EventTarget, null)).toBe(false);
  });

  it('is off while any dialog or menu is open on the page', () => {
    const open = {
      querySelector: (s: string) => (s.includes('role="dialog"') ? {} : null),
    };
    expect(feedKeysOff(null, open as unknown as ParentNode)).toBe(true);
    const none = {
      querySelector: () => null,
    };
    expect(feedKeysOff(null, none as unknown as ParentNode)).toBe(false);
  });
});

describe('the nine bindings', () => {
  const nav = SITE_SHORTCUTS.filter((s) => isFeedNavId(s.id));

  it('are declared once each, in the feed scope, with their own label keys', () => {
    expect(nav.map((s) => s.id)).toEqual([...FEED_NAV_IDS]);
    expect(nav.map((s) => s.keys.join(' '))).toEqual(['j', 'k', 'o', 'l', 'r', 't', 's', 'x', 'escape']);
    for (const s of nav) {
      expect(s.scope).toBe('feed');
      expect(s.ns).toBe('feed-keyboard');
      expect(s.labelKey).toMatch(/^kbd-[a-z]+$/);
    }
    expect(new Set(nav.map((s) => s.labelKey)).size).toBe(9);
  });

  it('leave no conflict with the site set, `g s` being a sequence and not a bare `s`', () => {
    expect(findShortcutConflicts(SITE_SHORTCUTS)).toEqual([]);
    expect(SITE_SHORTCUTS.find((s) => s.id === 'site.go.settings')?.keys).toEqual(['g', 's']);
  });

  const prefs = (singleKeys: KeyboardPrefs['singleKeys']): KeyboardPrefs => ({
    ...DEFAULT_KEYBOARD_PREFS,
    singleKeys,
  });

  it('are all character keys: Off removes them and With Alt prefixes them', () => {
    const off = effectiveBindings(SITE_SHORTCUTS, prefs('off')).map((s) => s.id);
    for (const id of FEED_NAV_IDS) expect(off).not.toContain(id);
    const alt = effectiveBindings(SITE_SHORTCUTS, prefs('alt')).filter((s) => isFeedNavId(s.id));
    expect(alt.map((s) => s.keys[0])).toEqual([
      'alt+j',
      'alt+k',
      'alt+o',
      'alt+l',
      'alt+r',
      'alt+t',
      'alt+s',
      'alt+x',
      'alt+escape',
    ]);
  });

  it('stay conflict-free in every mode and when remapped', () => {
    for (const mode of ['on', 'off', 'alt'] as const) {
      expect(findShortcutConflicts(effectiveBindings(SITE_SHORTCUTS, prefs(mode)))).toEqual([]);
    }
    const moved = effectiveBindings(SITE_SHORTCUTS, {
      ...prefs('on'),
      overrides: {
        'feed.nav.like': ['f'],
      },
    });
    expect(moved.find((s) => s.id === 'feed.nav.like')?.keys).toEqual(['f']);
  });
});
