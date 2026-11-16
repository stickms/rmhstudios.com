/**
 * Shared plumbing for every satori-rendered OG card.
 *
 * The five card renderers (`post-image`, `post-story`, `profile-image`,
 * `replay-image`, `stat-card`) each carried their own byte-identical copy of the
 * font loader, the avatar fetcher, the text helpers and the palette. That was
 * not only five copies of the logic — each copy owned its own module-level
 * cache, so a process that rendered all five card types loaded the two
 * font faces five times and held five copies of them (plus five separate 200-entry
 * avatar LRUs) resident for the life of the process. Sharing the module shares
 * the caches, which is the point.
 */

import { loadOgImage } from '@/lib/og/media.server';
import { satoriFontFaces } from '@/lib/og/fonts.server';

/* -------------------------------------------------------------------------- */
/* Fonts                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Geist 400/500/600 (Steel's weights, Y1: never 700 or above), read from disk by `./fonts.server`.
 * Kept async so the renderers' `await loadFonts()` call sites do not change, and so
 * a missing file is a rejected render rather than an import-time crash.
 */
export async function loadFonts(): Promise<void> {
  satoriFontFaces({ weights: [400, 500, 600] });
}

/** The satori `fonts` array. */
export function satoriFonts() {
  return satoriFontFaces({ weights: [400, 500, 600] });
}

/* -------------------------------------------------------------------------- */
/* Avatars                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The largest an avatar is drawn on any card (the profile card's 52 × `SCALE`),
 * rounded up to the next power of two. One size for every caller, because the
 * point of a shared cache is that the profile card and the post card resolve
 * the same author to the same bytes.
 */
const AVATAR_PX = 128;

/**
 * An author's avatar as a `data:` URI, or null when it can't be resolved.
 *
 * This used to `safeFetch` the URL as stored, which meant it only ever worked
 * for the OAuth avatars and the CDN form: an uploaded avatar is stored as the
 * local proxy path `/api/profile/avatar/<file>`, and an https-only,
 * absolute-only guard rejects that — so every user who had actually set an
 * avatar rendered as their initial, and did so *only* on the deployments
 * without a CDN, which is the one place nobody looks at an unfurl. Going
 * through `loadOgImage` reads those out of object storage directly and
 * normalises the result to a PNG at one known size, so the format the user
 * happened to upload (webp, avif) stops being resvg's problem.
 */
export async function fetchAvatarDataUri(url: string | null | undefined): Promise<string | null> {
  const image = await loadOgImage(url, {
    width: AVATAR_PX,
    height: AVATAR_PX,
    fit: 'cover',
    // Avatars are drawn inside a circular clip, so their own transparency has
    // to survive to the composite.
    alpha: true,
  });
  return image?.src ?? null;
}

/* -------------------------------------------------------------------------- */
/* Text + palette                                                             */
/* -------------------------------------------------------------------------- */

/**
 * satori has no emoji font loaded, so emoji render as tofu — drop them, along
 * with the variation selectors and ZWJs that glue sequences together, then
 * collapse the whitespace the removal leaves behind.
 */
export function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ');
}

export function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/* -------------------------------------------------------------------------- */
/* Palette + scale                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The card palette: Steel's Day edition (design.md §2, `app/globals/tokens-themes.css`),
 * restated by hand because satori cannot read CSS custom properties. This is the
 * one place in the codebase allowed to restate them; keep it in sync with the
 * `:root` block and `lib/__tests__/steel-tokens.test.ts`.
 *
 * Steel is flat (R1): every value here is a solid colour. There is no
 * translucency, so the old glass tints are gone and the names that remain map
 * onto the Steel roles a card uses.
 */
export const CANVAS = '#fafafa'; // --site-bg: the page
export const SURFACE = '#ffffff'; // --site-surface: controls (a stat chip)
export const INK = '#0b0d10'; // --site-text, --site-accent
export const INK_FG = '#fafafa'; // --site-accent-fg: text on ink
export const MUTED = '#606873'; // --site-text-muted
/** Steel has no lighter grey for text (T1): the dimmest text is the muted ink. */
export const DIM = MUTED;
export const HAIRLINE = '#e3e6e9'; // --site-border: every rule and control border
export const WELL = '#f0f2f4'; // --site-bg-subtle: picture placeholder, quoted fragment

/**
 * Everything geometric on a card is a site token times this.
 *
 * A 1200×630 card is displayed at roughly half that in every unfurl that
 * matters (Discord ~500px, Twitter ~600px, iMessage ~340px), so an 8px radius
 * and a 1px hairline drawn at card scale would arrive at the viewer as 4px and half
 * a pixel. Doubling the tokens means the card lands on the *rendered* value the
 * design specifies.
 */
export const SCALE = 2;
export const RADIUS = 8 * SCALE; // --site-radius
export const RADIUS_SM = 4 * SCALE; // --site-radius-sm
export const HAIRLINE_W = 1 * SCALE; // a 1px rule
