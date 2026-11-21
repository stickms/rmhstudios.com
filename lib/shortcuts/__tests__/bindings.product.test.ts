import { describe, expect, it } from 'vitest';
import { SITE_SHORTCUTS, findShortcutConflicts, type Shortcut } from '@/lib/shortcuts/registry';
import {
  DEFAULT_KEYBOARD_PREFS,
  RESERVED,
  applyOverrides,
  effectiveBindings,
  eventMatchesKeystroke,
  isCharacterKeyBinding,
  keyLabel,
  keystrokeFromEvent,
  sanitizePrefs,
  sequenceText,
  validateOverride,
  validateOverrides,
  type KeyboardPrefs,
} from '@/lib/shortcuts/bindings';

const keysOf = (list: readonly Shortcut[], id: string) => list.find((s) => s.id === id)?.keys;
const prefs = (over: Partial<KeyboardPrefs>): KeyboardPrefs => ({
  ...DEFAULT_KEYBOARD_PREFS,
  ...over,
});

describe('single-key mode', () => {
  it('On is the registry, unchanged', () => {
    expect(effectiveBindings(SITE_SHORTCUTS, DEFAULT_KEYBOARD_PREFS)).toEqual([...SITE_SHORTCUTS]);
  });

  it('Off removes every single key and plain sequence and keeps modifier bindings', () => {
    const out = effectiveBindings(SITE_SHORTCUTS, prefs({ singleKeys: 'off' }));
    expect(out.map((s) => s.id)).toEqual(['site.palette']);
    expect(keysOf(out, 'site.palette')).toEqual(['mod+k']);
  });

  it('With Alt rewrites the first step of character bindings only', () => {
    const out = effectiveBindings(SITE_SHORTCUTS, prefs({ singleKeys: 'alt' }));
    expect(keysOf(out, 'site.compose')).toEqual(['alt+c']);
    expect(keysOf(out, 'site.search')).toEqual(['alt+/']);
    expect(keysOf(out, 'site.go.home')).toEqual(['alt+g', 'h']);
    expect(keysOf(out, 'site.palette')).toEqual(['mod+k']);
    expect(out).toHaveLength(SITE_SHORTCUTS.length);
  });

  it('keeps the effective set free of conflicts in every mode', () => {
    for (const singleKeys of ['on', 'off', 'alt'] as const) {
      expect(findShortcutConflicts(effectiveBindings(SITE_SHORTCUTS, prefs({ singleKeys })))).toEqual([]);
    }
  });

  it('treats shift as part of the character, not as a modifier', () => {
    expect(isCharacterKeyBinding(['?'])).toBe(true);
    expect(isCharacterKeyBinding(['shift+c'])).toBe(true);
    expect(isCharacterKeyBinding(['mod+k'])).toBe(false);
    expect(isCharacterKeyBinding(['alt+c'])).toBe(false);
  });
});

describe('overrides', () => {
  it('replaces one shortcut and leaves the rest', () => {
    const out = effectiveBindings(SITE_SHORTCUTS, prefs({ overrides: { 'site.compose': ['n'] } }));
    expect(keysOf(out, 'site.compose')).toEqual(['n']);
    expect(keysOf(out, 'site.search')).toEqual(['/']);
  });

  it('applies the mode on top of an override', () => {
    const out = effectiveBindings(
      SITE_SHORTCUTS,
      prefs({ singleKeys: 'alt', overrides: { 'site.compose': ['n'], 'site.search': ['mod+j'] } }),
    );
    expect(keysOf(out, 'site.compose')).toEqual(['alt+n']);
    expect(keysOf(out, 'site.search')).toEqual(['mod+j']);
  });

  it('reset restores the defaults', () => {
    const changed = prefs({ singleKeys: 'off', overrides: { 'site.compose': ['n'] } });
    expect(effectiveBindings(SITE_SHORTCUTS, changed)).not.toEqual([...SITE_SHORTCUTS]);
    expect(effectiveBindings(SITE_SHORTCUTS, DEFAULT_KEYBOARD_PREFS)).toEqual([...SITE_SHORTCUTS]);
    const { 'site.compose': _gone, ...rest } = changed.overrides;
    expect(keysOf(effectiveBindings(SITE_SHORTCUTS, prefs({ overrides: rest })), 'site.compose')).toEqual(['c']);
  });

  it('ignores an override with a malformed sequence', () => {
    const out = applyOverrides(SITE_SHORTCUTS, { 'site.compose': [] });
    expect(keysOf(out, 'site.compose')).toEqual(['c']);
  });
});

describe('validateOverride', () => {
  it('accepts a free key and a free sequence', () => {
    expect(validateOverride('site.compose', ['n'], SITE_SHORTCUTS)).toEqual({ ok: true });
    expect(validateOverride('site.compose', ['x', 'y'], SITE_SHORTCUTS)).toEqual({ ok: true });
    expect(validateOverride('site.compose', ['c'], SITE_SHORTCUTS)).toEqual({ ok: true });
  });

  it('refuses a key another shortcut uses, naming it', () => {
    const r = validateOverride('site.compose', ['/'], SITE_SHORTCUTS);
    expect(r).toMatchObject({ ok: false, reason: 'conflict' });
    expect(r.ok === false && r.reason === 'conflict' && r.with.id).toBe('site.search');
  });

  it('refuses a bare key that would shadow a sequence', () => {
    const r = validateOverride('site.compose', ['g'], SITE_SHORTCUTS);
    expect(r).toMatchObject({ ok: false, reason: 'conflict' });
  });

  it('judges a clash against the keys the others have now', () => {
    const moved = applyOverrides(SITE_SHORTCUTS, { 'site.search': ['x'] });
    expect(validateOverride('site.compose', ['/'], moved)).toEqual({ ok: true });
    expect(validateOverride('site.compose', ['x'], moved)).toMatchObject({
      ok: false,
      reason: 'conflict',
    });
  });

  it.each(RESERVED)('refuses the reserved combination %s', (spec) => {
    expect(validateOverride('site.compose', [spec], SITE_SHORTCUTS)).toMatchObject({
      ok: false,
      reason: 'reserved',
      keystroke: spec,
    });
  });

  it('refuses a reserved key as the second step too', () => {
    expect(validateOverride('site.compose', ['g', 'tab'], SITE_SHORTCUTS)).toMatchObject({
      reason: 'reserved',
    });
  });

  it('refuses unknown ids and bad key strings', () => {
    expect(validateOverride('site.nope', ['n'], SITE_SHORTCUTS)).toEqual({
      ok: false,
      reason: 'unknown',
    });
    for (const bad of [[], ['a', 'b', 'c'], [''], ['ctrl+n'], ['mod+'], ['two words'], [42], 'n']) {
      expect(validateOverride('site.compose', bad, SITE_SHORTCUTS)).toEqual({
        ok: false,
        reason: 'grammar',
      });
    }
  });

  it('keeps the palette to one keystroke', () => {
    expect(validateOverride('site.palette', ['mod+j'], SITE_SHORTCUTS)).toEqual({ ok: true });
    expect(validateOverride('site.palette', ['x', 'y'], SITE_SHORTCUTS)).toEqual({
      ok: false,
      reason: 'grammar',
    });
  });
});

describe('validateOverrides and sanitizePrefs', () => {
  it('validates a whole map against itself', () => {
    expect(validateOverrides({ 'site.compose': ['n'], 'site.search': ['x'] }, SITE_SHORTCUTS)).toEqual({ ok: true });
    const clash = validateOverrides({ 'site.compose': ['n'], 'site.search': ['n'] }, SITE_SHORTCUTS);
    expect(clash).toMatchObject({ ok: false, error: { reason: 'conflict' } });
  });

  it('turns unknown stored data into safe prefs', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_KEYBOARD_PREFS);
    expect(sanitizePrefs({ singleKeys: 'loud', overrides: 7 })).toEqual(DEFAULT_KEYBOARD_PREFS);
    expect(
      sanitizePrefs(
        {
          singleKeys: 'alt',
          overrides: {
            'site.compose': ['n'],
            'site.search': ['mod+w'],
            'site.help': 'x',
            gone: ['q'],
          },
        },
        new Set(['site.compose', 'site.search', 'site.help']),
      ),
    ).toEqual({ singleKeys: 'alt', overrides: { 'site.compose': ['n'] } });
  });
});

describe('events and labels', () => {
  const event = (init: Partial<KeyboardEvent>) =>
    ({
      key: '',
      code: '',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
    }) as KeyboardEvent;

  it('matches exactly on the modifiers', () => {
    expect(eventMatchesKeystroke('c', event({ key: 'c' }))).toBe(true);
    expect(eventMatchesKeystroke('c', event({ key: 'c', ctrlKey: true }))).toBe(false);
    expect(eventMatchesKeystroke('alt+c', event({ key: 'c' }))).toBe(false);
    expect(eventMatchesKeystroke('alt+c', event({ key: 'c', altKey: true }))).toBe(true);
    expect(eventMatchesKeystroke('mod+k', event({ key: 'k', metaKey: true }))).toBe(true);
  });

  it('matches an Option-modified letter by its physical key (macOS)', () => {
    expect(eventMatchesKeystroke('alt+n', event({ key: 'Dead', code: 'KeyN', altKey: true }))).toBe(true);
    expect(eventMatchesKeystroke('n', event({ key: 'Dead', code: 'KeyN' }))).toBe(false);
  });

  it('records a keydown as a spec', () => {
    expect(keystrokeFromEvent(event({ key: 'C', shiftKey: true }))).toBe('shift+c');
    expect(keystrokeFromEvent(event({ key: '?', shiftKey: true }))).toBe('?');
    expect(keystrokeFromEvent(event({ key: 'k', ctrlKey: true }))).toBe('mod+k');
    expect(keystrokeFromEvent(event({ key: 'Dead', code: 'KeyN', altKey: true }))).toBe('alt+n');
    expect(keystrokeFromEvent(event({ key: 'Shift', shiftKey: true }))).toBeNull();
  });

  it('labels keys per platform', () => {
    expect(keyLabel('mod+k', 'mac')).toEqual(['⌘', 'K']);
    expect(keyLabel('mod+k', 'other')).toEqual(['Ctrl', 'K']);
    expect(keyLabel('alt+c', 'mac')).toEqual(['⌥', 'C']);
    expect(keyLabel('alt+c', 'other')).toEqual(['Alt', 'C']);
    expect(keyLabel('arrowup', 'other')).toEqual(['↑']);
    expect(sequenceText(['g', 'h'], 'other')).toBe('G then H');
  });
});
