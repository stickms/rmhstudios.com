// @vitest-environment node
/**
 * The theme store holds the reader's fonts and this device's sync switch, and records WHEN the user last changed
 * appearance (the "most recent wins" merge) — but not when hydration or the account pull applies values.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore, withoutStamp } from '@/stores/themeStore';
import { APPEARANCE_CHANGED_AT_KEY, DEFAULT_FONTS } from '@/lib/appearance/fonts';

const mem = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ fonts: DEFAULT_FONTS, appearanceSync: true });
});

describe('theme store: fonts and appearance sync', () => {
  it('starts on the default fonts with sync on', () => {
    expect(useThemeStore.getState().fonts).toEqual(DEFAULT_FONTS);
    expect(useThemeStore.getState().appearanceSync).toBe(true);
  });

  it('setFont changes one slot and records the change', () => {
    useThemeStore.getState().setFont('reading', 'literata');
    expect(useThemeStore.getState().fonts).toEqual({ ...DEFAULT_FONTS, reading: 'literata' });
    expect(Number(localStorage.getItem(APPEARANCE_CHANGED_AT_KEY))).toBeGreaterThan(0);
  });

  it('an id that is not valid for the slot is ignored', () => {
    useThemeStore.getState().setFont('main', 'dm-mono' as never);
    expect(useThemeStore.getState().fonts.main).toBe('dm-sans');
  });

  it('values applied by hydration or the account pull are not a user change', () => {
    withoutStamp(() => {
      useThemeStore.getState().setFont('main', 'inter');
      useThemeStore.getState().setColorVision('tritanopia');
    });
    expect(useThemeStore.getState().fonts.main).toBe('inter');
    expect(localStorage.getItem(APPEARANCE_CHANGED_AT_KEY)).toBeNull();
  });

  it('the other appearance setters record a user change too', () => {
    useThemeStore.getState().setJellyMotion('still');
    expect(localStorage.getItem(APPEARANCE_CHANGED_AT_KEY)).not.toBeNull();
  });
});

describe('theme store: hydration flag and no-op font sets (final review minors)', () => {
  it('choosing the face a slot already has changes nothing and records nothing', () => {
    const before = useThemeStore.getState().fonts;
    useThemeStore.getState().setFont('main', 'dm-sans');
    expect(useThemeStore.getState().fonts).toBe(before);
    expect(localStorage.getItem(APPEARANCE_CHANGED_AT_KEY)).toBeNull();
  });

  it('starts unhydrated and is marked once storage has been read', () => {
    useThemeStore.setState({ appearanceHydrated: false });
    expect(useThemeStore.getState().appearanceHydrated).toBe(false);
    useThemeStore.getState().markAppearanceHydrated();
    expect(useThemeStore.getState().appearanceHydrated).toBe(true);
  });
});
