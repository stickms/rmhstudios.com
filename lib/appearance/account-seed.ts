/**
 * The account's saved appearance, expressed as the `localStorage` writes the
 * pre-paint script reads — so a signed-in visitor's FIRST frame is already in
 * their account's theme.
 *
 * ## Why this exists
 *
 * Appearance is stored twice: per device in `localStorage` (what `themeScript` in
 * `app/routes/__root.tsx` paints from, before any bundle runs) and per account in
 * `AppearancePreference` (what follows you between devices). The two were
 * reconciled by the account sync in `components/Providers.tsx`, which runs at
 * IDLE — seconds after first paint — and lets the account win.
 *
 * So anyone whose account and device disagreed watched every page load in the
 * device's theme and then flip to the account's: set Midnight on a phone, open
 * the laptop, and the laptop paints Daylight and turns black a few seconds later.
 * Disagreement is not an edge case — it is every user with two devices who has
 * ever changed a setting on one of them, and it recurs until the device's copy
 * happens to be overwritten.
 *
 * The fix is to do the account sync's merge on the SERVER, which already resolves
 * the session for the root loader, and write the result into `localStorage`
 * before `themeScript` reads it. The script itself is unchanged; it simply finds
 * values that already agree with the account. When the idle sync runs it finds
 * nothing to change, so nothing moves.
 *
 * ## The merge rules are the runtime's, exactly
 *
 * {@link accountAppearanceSeed} reproduces the precedence in the account-sync
 * effect in `components/Providers.tsx` field for field, and must keep doing so —
 * this file decides only WHEN the account's values apply, never WHICH win. That
 * includes the one rule worth knowing about: the GET handler returns `false`
 * rather than `null` for a `readableFont` or `reduceMotion` the account never
 * set, and the runtime applies any boolean, so for those two the account always
 * wins. Changing that is a settings decision, not a flash fix, and it belongs in
 * the API and the runtime together if it is ever made.
 *
 * `reduceTransparency` is deliberately absent: glass clarity (`glassLevel`) owns
 * the `reduce-transparency` class now, and the legacy flag drives nothing visible.
 */
import { ACCENT_STORAGE_KEY, isAccentId } from '@/lib/appearance';
import {
  COLOR_VISION_KEY,
  CUSTOM_ACCENT_KEY,
  DENSITY_KEY,
  FONT_SCALE_KEY,
  GLASS_LEVEL_KEY,
  HEX_RE,
  READABLE_FONT_KEY,
  REDUCE_MOTION_KEY,
  isColorVisionMode,
  isGlassLevel,
} from '@/lib/appearance/prefs';
import { SITE_STYLES } from '@/stores/themeStore';

/** The `rmh-style` key, as `themeScript` and `Providers` both read it. */
export const STYLE_STORAGE_KEY = 'rmh-style';

/** The columns of `AppearancePreference` this needs, all optional and nullable. */
export interface AccountAppearanceRow {
  style?: string | null;
  accent?: string | null;
  fontScale?: number | null;
  density?: string | null;
  readableFont?: boolean | null;
  customAccent?: string | null;
  reduceMotion?: boolean | null;
  glassLevel?: number | null;
  colorVision?: string | null;
}

/**
 * `localStorage` key → the value the account says it should hold, or `null` to
 * remove it. A key that is ABSENT is one the account does not win, so the
 * device's own value stands — the same thing the runtime does when it falls back
 * to `store.style` or skips a setter.
 */
export type AppearanceSeed = Record<string, string | null>;

const STYLE_IDS = new Set<string>(SITE_STYLES.map((s) => s.id));

/**
 * The account-sync merge from `components/Providers.tsx`, as storage writes.
 *
 * Each branch mirrors one line of that effect; the comment names it. Values are
 * written in the shape `themeScript` parses, which is not always the shape the
 * store holds: a font scale of 1000 and a density of `cozy` are the defaults, and
 * the script expresses a default by the key being absent.
 */
export function accountAppearanceSeed(
  row: AccountAppearanceRow | null | undefined,
): AppearanceSeed {
  const seed: AppearanceSeed = {};
  if (!row) return seed;

  // `remote.style && SITE_STYLES.some(...) ? remote.style : store.style`
  if (row.style && STYLE_IDS.has(row.style)) seed[STYLE_STORAGE_KEY] = row.style;

  // `isAccentId(remote.accent) ? remote.accent : store.accent`
  if (isAccentId(row.accent)) seed[ACCENT_STORAGE_KEY] = row.accent;

  // `if ([875, 1000, 1125, 1250].includes(Number(r.fontScale))) setFontScale(...)`
  const fontScale = Number(row.fontScale);
  if ([875, 1000, 1125, 1250].includes(fontScale)) {
    seed[FONT_SCALE_KEY] = fontScale === 1000 ? null : String(fontScale);
  }

  // `if (r.density === 'compact' || r.density === 'cozy') setDensity(r.density)`
  if (row.density === 'compact') seed[DENSITY_KEY] = 'compact';
  else if (row.density === 'cozy') seed[DENSITY_KEY] = null;

  // `if (typeof r.readableFont === 'boolean') setReadableFont(...)` — see the
  // header: the API sends `false` for unset, so this always applies.
  if (typeof row.readableFont === 'boolean')
    seed[READABLE_FONT_KEY] = row.readableFont ? '1' : null;

  // `if (typeof r.reduceMotion === 'boolean') setReduceMotion(...)` — likewise.
  if (typeof row.reduceMotion === 'boolean')
    seed[REDUCE_MOTION_KEY] = row.reduceMotion ? '1' : null;

  // `if (typeof r.customAccent === 'string' && HEX_RE.test(...)) setCustomAccent(...)`
  if (typeof row.customAccent === 'string' && HEX_RE.test(row.customAccent)) {
    seed[CUSTOM_ACCENT_KEY] = row.customAccent;
  }

  // `if (isColorVisionMode(r.colorVision)) setColorVision(...)` — `none` is the
  // default, which the script expresses by absence.
  if (isColorVisionMode(row.colorVision)) {
    seed[COLOR_VISION_KEY] = row.colorVision === 'none' ? null : row.colorVision;
  }

  // `if (isGlassLevel(r.glassLevel)) setGlassLevel(...)`
  if (isGlassLevel(row.glassLevel)) seed[GLASS_LEVEL_KEY] = String(row.glassLevel);

  return seed;
}

/**
 * The inline script that applies a seed, for `head()`.
 *
 * It must run BEFORE `themeScript`, which is the whole point, and it must not be
 * able to break the page: every write is inside one `try`, because a full or
 * disabled `localStorage` must degrade to today's behaviour (the idle sync), not
 * to an exception in `<head>`. The payload is validated ids, numbers and a
 * checked hex colour, and `<` is escaped anyway so no value can close the tag.
 */
export function accountSeedScript(seed: AppearanceSeed): string | null {
  if (!Object.keys(seed).length) return null;
  const json = JSON.stringify(seed).replace(/</g, '\\u003c');
  return `(function(){try{var s=${json};for(var k in s){if(s[k]===null)localStorage.removeItem(k);else localStorage.setItem(k,s[k])}}catch(e){}})()`;
}
