/**
 * Put the reader's fonts on the page (client only): the `data-font-*` attributes (app/fonts/choice-rules.css maps them
 * to the --site-font-* variables; a default is expressed by absence), the localStorage cache the pre-paint step reads,
 * the `rmh-fonts` cookie the server renders from, and one stylesheet per face in use. The pre-paint twin of this is
 * lib/prepaint/fonts.ts. Design: docs/superpowers/specs/2026-11-23-font-choice-and-appearance-sync-design.md.
 */
import { removeKey, writeString } from '@/lib/core/persist';
import {
  DEFAULT_FONTS,
  FONT_KEYS,
  FONTS_COOKIE,
  fontEntry,
  fontsInUse,
  formatFontsCookie,
  type FontChoice,
  type FontId,
} from '@/lib/appearance/fonts';
import { FONT_ASSETS } from '@/lib/appearance/font-assets.gen';

/** Link a face's stylesheet once (the defaults live in the site sheet and are skipped). */
export function ensureFontSheet(id: FontId): void {
  if (id === 'dm-sans' || id === 'dm-mono') return;
  const href = FONT_ASSETS[id].sheet;
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Link a face and wait (up to 3 s) for its Latin file, BEFORE the page switches to it. A mono face is
 * `font-display: optional`: switched on cold, it misses its ~100 ms window and the fallback stays for the life of the
 * document, so a pick would look like it did nothing until a reload (final review, 2026-11-23).
 */
export async function loadFontFace(id: FontId | 'same'): Promise<void> {
  if (id === 'same' || typeof document === 'undefined') return;
  ensureFontSheet(id);
  const family = fontEntry(id)?.family;
  if (!family || !document.fonts?.load) return;
  await Promise.race([
    document.fonts.load(`1em "${family}"`).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}

export function applyFonts(fonts: FontChoice): void {
  const html = document.documentElement;
  for (const slot of ['main', 'reading', 'mono'] as const) {
    const v = fonts[slot];
    const attr = `data-font-${slot}`;
    if (v === DEFAULT_FONTS[slot]) {
      html.removeAttribute(attr);
      removeKey(FONT_KEYS[slot]);
    } else {
      html.setAttribute(attr, v);
      writeString(FONT_KEYS[slot], v);
    }
  }
  for (const id of fontsInUse(fonts)) ensureFontSheet(id);
  const value = formatFontsCookie(fonts);
  document.cookie = value
    ? `${FONTS_COOKIE}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`
    : `${FONTS_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
