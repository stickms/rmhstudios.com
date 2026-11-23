/**
 * Which fonts a request's first paint is set in (design: docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md).
 *
 * Per slot: the account's value when the row holds one (null = never chosen) and appearance sync is on for this
 * device; else the device's `rmh-fonts` cookie; else the default. The pre-paint fonts step repairs the rare device
 * whose cookie is missing (lib/prepaint/fonts.ts). Client-safe; the root loader calls it on the server.
 */
import {
  DEFAULT_FONTS,
  appearanceSyncOff,
  isFontFor,
  parseFontsCookie,
  type FontChoice,
  type FontSlot,
} from '@/lib/appearance/fonts';

export interface AccountFontsRow {
  fontMain?: string | null;
  fontReading?: string | null;
  fontMono?: string | null;
}

const COLUMN: Record<FontSlot, keyof AccountFontsRow> = { main: 'fontMain', reading: 'fontReading', mono: 'fontMono' };

export function resolveRequestFonts({
  row,
  cookieHeader,
}: {
  row: AccountFontsRow | null | undefined;
  cookieHeader: string | null | undefined;
}): { choice: FontChoice; syncOff: boolean } {
  const syncOff = appearanceSyncOff(cookieHeader);
  const device = parseFontsCookie(cookieHeader) ?? DEFAULT_FONTS;
  const pick = <S extends FontSlot>(slot: S): FontChoice[S] => {
    const account = syncOff ? null : row?.[COLUMN[slot]];
    if (account != null) return (isFontFor(slot, account) ? account : DEFAULT_FONTS[slot]) as FontChoice[S];
    return device[slot];
  };
  return { choice: { main: pick('main'), reading: pick('reading'), mono: pick('mono') }, syncOff };
}
