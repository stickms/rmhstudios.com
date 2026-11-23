// @vitest-environment node
/**
 * The font pickers and the per-device appearance sync switch (owner, 2026-11-23). With sync on, a font choice goes
 * to the account; with it off, nothing is pushed. Turning sync back on settles "most recent wins" before the normal
 * account pull resumes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

vi.mock('@/lib/appearance/apply-fonts', () => ({ applyFonts: () => {}, ensureFontSheet: () => {}, loadFontFace: async () => {} }));

import { chooseFont, disableAppearanceSync, enableAppearanceSync } from '../appearance-actions';
import { useThemeStore } from '@/stores/themeStore';
import { APPEARANCE_CHANGED_AT_KEY, DEFAULT_FONTS } from '@/lib/appearance/fonts';

beforeEach(() => {
  mem.clear();
  useThemeStore.setState({
    fonts: DEFAULT_FONTS,
    appearanceSync: true,
    style: 'graphite',
    styleFromDevice: false,
    readableFont: false,
    colorVision: 'none',
    jellyMotion: 'lively',
  });
});

describe('appearance actions', () => {
  it('choosing a font with sync on saves that slot to the account', async () => {
    const persist = vi.fn(async () => {});
    await chooseFont('reading', 'literata', { persist });
    expect(useThemeStore.getState().fonts.reading).toBe('literata');
    expect(persist).toHaveBeenCalledWith({ fontReading: 'literata' });
  });

  it('choosing a font with sync off saves nothing to the account', async () => {
    disableAppearanceSync();
    const persist = vi.fn(async () => {});
    await chooseFont('main', 'inter', { persist });
    expect(useThemeStore.getState().fonts.main).toBe('inter');
    expect(persist).not.toHaveBeenCalled();
  });

  it('turning sync on with a newer device pushes the device and keeps it', async () => {
    useThemeStore.setState({ appearanceSync: false, fonts: { ...DEFAULT_FONTS, main: 'inter' } });
    // A choice made on this device is stored (applyFonts writes it), which is what marks it as this device's own.
    mem.set('rmh-font-main', 'inter');
    mem.set(APPEARANCE_CHANGED_AT_KEY, String(Date.parse('2026-11-23T12:00:00Z')));
    const persist = vi.fn(async () => {});
    const get = vi.fn(async () => ({
      style: 'default',
      fontScale: null,
      density: null,
      readableFont: false,
      colorVision: null,
      jellyMotion: null,
      fontMain: 'lora',
      fontReading: null,
      fontMono: null,
      updatedAt: '2026-11-22T12:00:00.000Z',
    }));
    await enableAppearanceSync({ get, persist });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ fontMain: 'inter', style: 'graphite' }));
    expect(useThemeStore.getState().fonts.main).toBe('inter');
    expect(useThemeStore.getState().appearanceSync).toBe(true);
  });

  it("turning sync on with a newer account applies the account's values", async () => {
    useThemeStore.setState({ appearanceSync: false, fonts: { ...DEFAULT_FONTS, main: 'inter' } });
    mem.set(APPEARANCE_CHANGED_AT_KEY, String(Date.parse('2026-11-20T12:00:00Z')));
    const persist = vi.fn(async () => {});
    const get = vi.fn(async () => ({
      style: 'default',
      fontScale: null,
      density: null,
      readableFont: false,
      colorVision: null,
      jellyMotion: null,
      fontMain: 'lora',
      fontReading: null,
      fontMono: null,
      updatedAt: '2026-11-22T12:00:00.000Z',
    }));
    await enableAppearanceSync({ get, persist });
    expect(persist).not.toHaveBeenCalled();
    expect(useThemeStore.getState().fonts.main).toBe('lora');
    expect(useThemeStore.getState().style).toBe('default');
    // Applying the account is not a change made on this device.
    expect(mem.get(APPEARANCE_CHANGED_AT_KEY)).toBe(String(Date.parse('2026-11-20T12:00:00Z')));
  });
});

describe('turning sync on never overwrites the account by mistake (final review)', () => {
  const remoteNewerThanNothing = async () => ({
    style: 'default',
    fontScale: null,
    density: null,
    readableFont: false,
    colorVision: null,
    jellyMotion: null,
    fontMain: 'lora',
    fontReading: 'same',
    fontMono: null,
    updatedAt: '2026-11-22T12:00:00.000Z',
  });

  it('a failed read of the account pushes nothing and leaves sync off', async () => {
    useThemeStore.setState({ appearanceSync: false });
    mem.set(APPEARANCE_CHANGED_AT_KEY, String(Date.parse('2026-11-23T12:00:00Z')));
    const persist = vi.fn(async () => {});
    const ok = await enableAppearanceSync({ get: async () => Promise.reject(new Error('503')), persist });
    expect(ok).toBe(false);
    expect(persist).not.toHaveBeenCalled();
    expect(useThemeStore.getState().appearanceSync).toBe(false);
  });

  it('a failed save leaves sync off, so the pull cannot undo the newer device', async () => {
    useThemeStore.setState({ appearanceSync: false });
    mem.set(APPEARANCE_CHANGED_AT_KEY, String(Date.parse('2026-11-23T12:00:00Z')));
    const ok = await enableAppearanceSync({ get: remoteNewerThanNothing, persist: async () => Promise.reject(new Error('500')) });
    expect(ok).toBe(false);
    expect(useThemeStore.getState().appearanceSync).toBe(false);
  });

  it('a newer device whose fonts were never touched does not push its default fonts', async () => {
    useThemeStore.setState({ appearanceSync: false });
    mem.set(APPEARANCE_CHANGED_AT_KEY, String(Date.parse('2026-11-23T12:00:00Z')));
    // Only the theme was chosen on this device; no rmh-font-* / colour / motion key is stored.
    mem.set('rmh-style', 'graphite');
    const persist = vi.fn(async () => {});
    await enableAppearanceSync({ get: remoteNewerThanNothing, persist });
    const pushed = (persist.mock.calls[0] as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
    expect(pushed).toEqual({ style: 'graphite' });
  });
});

describe('a chosen face is loaded before it is switched on (final review)', () => {
  it("loads the face first, so a mono face's short `optional` window is not missed", async () => {
    const order: string[] = [];
    const loadFace = vi.fn(async (id: string) => {
      order.push(`load:${id}:${useThemeStore.getState().fonts.mono}`);
    });
    await chooseFont('mono', 'jetbrains-mono', { persist: async () => {}, loadFace });
    expect(order).toEqual(['load:jetbrains-mono:dm-mono']);
    expect(useThemeStore.getState().fonts.mono).toBe('jetbrains-mono');
  });
});
