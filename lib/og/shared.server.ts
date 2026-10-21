/**
 * Shared plumbing for every satori-rendered OG card.
 *
 * The five card renderers (`post-image`, `post-story`, `profile-image`,
 * `replay-image`, `stat-card`) each carried their own byte-identical copy of the
 * font loader, the avatar fetcher, the text helpers and the palette. That was
 * not only five copies of the logic — each copy owned its own module-level
 * cache, so a process that rendered all five card types fetched the two Inter
 * faces five times and held five copies of them (plus five separate 200-entry
 * avatar LRUs) resident for the life of the process. Sharing the module shares
 * the caches, which is the point.
 */

import { renderAsync } from '@resvg/resvg-js';
import { LRUCache } from 'lru-cache';
import { loadOgImage } from '@/lib/og/media.server';
import { cpuGate } from '@/lib/images/cpu-gate.server';

/* -------------------------------------------------------------------------- */
/* Fonts                                                                      */
/* -------------------------------------------------------------------------- */

const FONT_REGULAR_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf';
const FONT_BOLD_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf';
const FONT_FETCH_TIMEOUT_MS = 5_000;
// After a font fetch failure, cool down before retrying instead of re-hitting
// Google on every single request — a Google Fonts hiccup otherwise turns into a
// per-request fetch storm and a 500 loop.
const FONT_FAIL_COOLDOWN_MS = 30_000;

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let fontsLoading: Promise<void> | null = null;
let fontFailUntil = 0;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
    return await r.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

export function loadFonts(): Promise<void> {
  if (fontRegular && fontBold) return Promise.resolve();
  if (fontsLoading) return fontsLoading;
  // Negative cache: fail fast during the cooldown window rather than retrying.
  if (Date.now() < fontFailUntil)
    return Promise.reject(new Error('Fonts unavailable (cooling down)'));
  fontsLoading = Promise.all([fetchFont(FONT_REGULAR_URL), fetchFont(FONT_BOLD_URL)])
    .then(([reg, bold]) => {
      fontRegular = reg;
      fontBold = bold;
    })
    .catch((err) => {
      fontsLoading = null;
      fontFailUntil = Date.now() + FONT_FAIL_COOLDOWN_MS;
      throw err;
    });
  return fontsLoading;
}

// Warm the cache at import time; failures are handled per-render by loadFonts().
loadFonts().catch(() => {});

/**
 * The satori `fonts` array. Call `await loadFonts()` first — this throws rather
 * than handing satori `null` buffers, which is the check each renderer used to
 * spell out as `if (!fontRegular || !fontBold) throw …`.
 */
export function satoriFonts() {
  if (!fontRegular || !fontBold) throw new Error('Fonts not loaded');
  return [
    { name: 'Inter', data: fontRegular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: fontBold, weight: 700 as const, style: 'normal' as const },
  ];
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
 * The card palette, hand-mirrored from the DEFAULT theme's `--site-*` block in
 * `app/globals.css`. satori cannot read CSS custom properties, so this is the
 * one place in the codebase allowed to restate them — keep it in sync when the
 * default theme's tokens move.
 *
 * The default theme is strict monochrome glass (design.md §1): white canvas,
 * ink text, ink accent, hairline black borders. Cards are therefore ink on
 * white — not the old dark/amber scheme, which matched no theme the site has
 * shipped since the rewrite.
 */
export const CANVAS = '#ffffff'; // --site-bg
export const INK = '#000000'; // --site-text, --site-accent
export const INK_FG = '#ffffff'; // --site-accent-fg
export const MUTED = '#565656'; // --site-text-muted
export const DIM = '#767676'; // --site-text-dim
export const HAIRLINE = 'rgba(0, 0, 0, 0.16)'; // --site-border
export const HAIRLINE_SOFT = 'rgba(0, 0, 0, 0.08)'; // --site-glass-rim
export const GLASS = 'rgba(255, 255, 255, 0.72)'; // --site-glass-tint
export const GLASS_STRONG = 'rgba(255, 255, 255, 0.86)'; // --site-glass-tint-strong
export const WELL = 'rgba(0, 0, 0, 0.045)'; // --site-bg-subtle

/**
 * Everything geometric on a card is a site token times this.
 *
 * A 1200×630 card is displayed at roughly half that in every unfurl that
 * matters (Discord ~500px, Twitter ~600px, iMessage ~340px), so a 22px radius
 * and a 1px hairline drawn at card scale arrive at the viewer as 11px and half
 * a pixel — a rounder, fainter box than the site's. Doubling the tokens means
 * the card lands on the *rendered* value the design specifies.
 */
export const SCALE = 2;
export const RADIUS = 22 * SCALE; // --site-radius
export const RADIUS_SM = 14 * SCALE; // --site-radius-sm
export const HAIRLINE_W = 1 * SCALE; // --site-border-width

/* -------------------------------------------------------------------------- */
/* Rasterising + the rendered-PNG cache                                       */
/* -------------------------------------------------------------------------- */

/**
 * SVG -> PNG without holding the event loop.
 *
 * Every card renderer used to finish with `new Resvg(svg).render().asPng()`, a
 * synchronous native call: 175-190 ms for a 1200x630 card and 810-850 ms for a
 * 1080x1920 story card, all of it on the one web event loop, so every other
 * request in the process stood still for the duration (results/ws-6.md).
 * `renderAsync` runs the same rasteriser on the libuv threadpool and produces
 * byte-identical PNGs; the gate keeps the pool from being monopolised.
 *
 * `loadSystemFonts: false` because satori emits glyphs as `<path>` outlines (no
 * `<text>` survives into the SVG), so resvg has nothing to look a font up for
 * and the default system-font scan is pure construction cost.
 */
export function rasterizeSvg(svg: string, width: number): Promise<Buffer> {
  return cpuGate.run(async () => {
    const image = await renderAsync(svg, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: false },
    });
    return Buffer.from(image.asPng());
  });
}

/**
 * A bounded, TTL'd cache of rendered card PNGs with in-flight de-duplication.
 *
 * Replaces the five hand-copied `Map` + FIFO-eviction blocks. The new part is
 * the in-flight map: N concurrent requests for one cold card (a link pasted
 * into a busy channel makes the crawlers of every member arrive together)
 * rendered it N times; now they share one render.
 *
 * Staleness is the caller's key: "everything drawn is in the key" (see
 * docs/open-graph.md), and `ttlMs` bounds how long a card whose inputs the key
 * cannot see (an avatar re-upload, a swept attachment) can lag.
 */
export interface CardCache {
  /** Return the cached PNG for `key`, or render it once for all concurrent callers. */
  getOrRender(key: string, produce: () => Promise<Buffer>, ttlMs?: number): Promise<Buffer>;
  readonly size: number;
}

export function createCardCache(opts: { max: number; ttlMs: number }): CardCache {
  const done = new LRUCache<string, Buffer>({ max: opts.max, ttl: opts.ttlMs });
  const inflight = new Map<string, Promise<Buffer>>();
  return {
    getOrRender(key, produce, ttlMs) {
      const hit = done.get(key);
      if (hit) return Promise.resolve(hit);
      const running = inflight.get(key);
      if (running) return running;
      const p = produce()
        .then((png) => {
          done.set(key, png, ttlMs ? { ttl: ttlMs } : undefined);
          return png;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
    get size() {
      return done.size;
    },
  };
}
