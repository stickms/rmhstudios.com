// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveRequestFonts } from '../fonts-request';
import { accountAppearanceSeed } from '../account-seed';
import { DEFAULT_FONTS, FONT_KEYS } from '../fonts';

const cookie = 'rmh-fonts=inter.literata.jetbrains-mono';

describe('resolveRequestFonts: what the first paint is set in', () => {
  it('no row and no cookie: the defaults', () => {
    expect(resolveRequestFonts({ row: null, cookieHeader: null })).toEqual({ choice: DEFAULT_FONTS, syncOff: false });
  });

  it('the cookie when signed out', () => {
    expect(resolveRequestFonts({ row: null, cookieHeader: cookie }).choice).toEqual({
      main: 'inter',
      reading: 'literata',
      mono: 'jetbrains-mono',
    });
  });

  it("the account's non-null value beats the cookie, slot by slot", () => {
    const r = resolveRequestFonts({
      row: { fontMain: 'lora', fontReading: null, fontMono: 'dm-mono' },
      cookieHeader: cookie,
    });
    expect(r.choice).toEqual({ main: 'lora', reading: 'literata', mono: 'dm-mono' });
  });

  it('a row whose fonts were never chosen leaves the device cookie standing', () => {
    expect(
      resolveRequestFonts({ row: { fontMain: null, fontReading: null, fontMono: null }, cookieHeader: cookie }).choice,
    ).toEqual({ main: 'inter', reading: 'literata', mono: 'jetbrains-mono' });
  });

  it('sync off on this device: the account is ignored', () => {
    const r = resolveRequestFonts({
      row: { fontMain: 'lora', fontReading: 'lora', fontMono: 'geist-mono' },
      cookieHeader: `${cookie}; rmh-appearance-sync=0`,
    });
    expect(r).toEqual({ choice: { main: 'inter', reading: 'literata', mono: 'jetbrains-mono' }, syncOff: true });
  });

  it('a stored id no longer in the catalogue is the default', () => {
    expect(
      resolveRequestFonts({ row: { fontMain: 'retired-face', fontReading: null, fontMono: null }, cookieHeader: null })
        .choice.main,
    ).toBe('dm-sans');
  });
});

describe('account seed: fonts', () => {
  it('writes a chosen face and removes the key for a default (the default is absence)', () => {
    const seed = accountAppearanceSeed({ fontMain: 'inter', fontReading: 'same', fontMono: 'dm-mono' });
    expect(seed[FONT_KEYS.main]).toBe('inter');
    expect(seed[FONT_KEYS.reading]).toBeNull();
    expect(seed[FONT_KEYS.mono]).toBeNull();
  });

  it('a never-chosen font leaves the device value alone', () => {
    const seed = accountAppearanceSeed({ fontMain: null });
    expect(FONT_KEYS.main in seed).toBe(false);
  });
});
