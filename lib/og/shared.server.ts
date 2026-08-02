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

import { LRUCache } from 'lru-cache';
import { safeFetch } from '@/lib/ssrf-guard.server';

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

// Small in-process cache of resolved avatar data URIs, keyed by source URL, so a
// card re-render (or many cards sharing an author) doesn't re-fetch + re-encode
// the same avatar.
const avatarCache = new LRUCache<string, string>({ max: 200, ttl: 10 * 60 * 1000 });

export async function fetchAvatarDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const hit = avatarCache.get(url);
  if (hit) return hit;
  try {
    // User-supplied URL → SSRF guard, with a tight timeout so a slow avatar host
    // can't stall card rendering (and the request handler behind it).
    const res = await safeFetch(url, { timeoutMs: 3_000 });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || 'image/png';
    const dataUri = `data:${type};base64,${buf.toString('base64')}`;
    avatarCache.set(url, dataUri);
    return dataUri;
  } catch {
    return null;
  }
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

/** Card palette. Deliberately hard-coded: satori can't read CSS custom
 * properties, so these mirror the `--site-*` dark tokens by hand. */
export const BG = '#0b0d12';
export const SURFACE = '#161922';
export const TEXT = '#f4f6fb';
export const MUTED = '#9aa3b2';
export const ACCENT = '#f5a623';
