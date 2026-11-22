/**
 * What satori draws when Geist has no glyph: emoji, symbols (☆ ♥ ✓), and every
 * script outside Latin (Cyrillic, Greek, CJK, Arabic, Devanagari, …).
 *
 * The OG faces are Geist's latin subset (`./fonts.server`), so before this a post
 * titled "☆ hoop anxiety ☆" unfurled as "▯ hoop anxiety ▯", and emoji were
 * stripped out of the text entirely. satori asks for the missing pieces through
 * `loadAdditionalAsset(languageCode, segment)` once per render, with only the
 * characters it could not draw, and this answers it:
 *
 *  - `emoji` → the Twemoji SVG for that sequence, as a `data:` URI (satori draws
 *    an emoji as an image, which is also how it gets colour);
 *  - anything else → a Noto face for that script from Google Fonts, subset to
 *    exactly `segment` with `&text=`, so a CJK name costs a few kilobytes rather
 *    than a 5 MB font.
 *
 * Both are cached for a week (`cached()`: L1 + Redis, single-flight), keyed by the
 * script and the characters, so a busy post fetches nothing after its first card.
 * Every failure (timeout, 404, offline) answers "nothing": the glyph stays a box,
 * and the card still renders. That is the only network a card render can touch,
 * and the inputs are characters, never a user-supplied URL.
 */

import { cached } from '@/lib/cached.server';

type FontWeight = 400 | 600;
interface FallbackFont {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: 'normal';
}

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/';
const TIMEOUT_MS = 3_000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A segment past this is not one word of a name or title; don't build a cache key out of it. */
const MAX_SEGMENT = 400;

/** satori's language codes → the Noto families that cover them, best first. */
const FAMILIES: Record<string, readonly string[]> = {
  'ja-JP': ['Noto Sans JP'],
  'ko-KR': ['Noto Sans KR'],
  'zh-CN': ['Noto Sans SC'],
  'zh-TW': ['Noto Sans TC'],
  'zh-HK': ['Noto Sans HK'],
  'th-TH': ['Noto Sans Thai'],
  'bn-IN': ['Noto Sans Bengali'],
  'ar-AR': ['Noto Sans Arabic'],
  'ta-IN': ['Noto Sans Tamil'],
  'ml-IN': ['Noto Sans Malayalam'],
  'he-IL': ['Noto Sans Hebrew'],
  'te-IN': ['Noto Sans Telugu'],
  devanagari: ['Noto Sans Devanagari'],
  kannada: ['Noto Sans Kannada'],
  symbol: ['Noto Sans Symbols 2', 'Noto Sans Symbols', 'Noto Sans'],
  math: ['Noto Sans Math', 'Noto Sans Symbols 2'],
};
/** Cyrillic, Greek, Latin Extended and whatever satori could not name. */
const DEFAULT_FAMILIES = ['Noto Sans', 'Noto Sans Symbols 2'];
/** Families published at more than one weight: names are drawn at 600. */
const VARIABLE = new Set(['Noto Sans', 'Noto Sans JP', 'Noto Sans KR', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans HK']);

/**
 * Twemoji's file name for an emoji: its code points in hex joined by `-`, with
 * the U+FE0F variation selector dropped unless the sequence has a ZWJ (the
 * library's own `grabTheRightIcon` rule).
 */
export function twemojiFileName(emoji: string): string {
  const text = emoji.includes('‍') ? emoji : emoji.replace(/️/g, '');
  return [...text].map((c) => c.codePointAt(0)!.toString(16)).join('-');
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null;
  }
}

async function loadEmoji(segment: string): Promise<string> {
  const svg = await cached(
    `og:twemoji:${twemojiFileName(segment)}`,
    TTL_MS,
    async () => {
      const res = await fetchWithTimeout(`${TWEMOJI_BASE}${twemojiFileName(segment)}.svg`);
      if (!res?.ok) return '';
      return res.text();
    },
    { shouldCache: (v) => v !== '' },
  );
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : '';
}

/** One family's faces for `text`, as base64 TTFs with their weights. */
async function loadFamily(family: string, text: string): Promise<{ weight: FontWeight; b64: string }[]> {
  return cached(
    `og:noto:${family}:${text}`,
    TTL_MS,
    async () => {
      const spec = VARIABLE.has(family) ? `${family}:wght@400;600` : family;
      const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec).replace(/%20/g, '+')}&text=${encodeURIComponent(text)}`;
      // A non-browser agent gets `format('truetype')`, which satori reads directly.
      const css = await fetchWithTimeout(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' } });
      if (!css?.ok) return [];
      const faces = [...(await css.text()).matchAll(/font-weight:\s*(\d+);[^}]*?src:\s*url\(([^)]+)\)/g)];
      const out: { weight: FontWeight; b64: string }[] = [];
      for (const [, weight, url] of faces) {
        if (!url?.startsWith('https://fonts.gstatic.com/')) continue;
        const res = await fetchWithTimeout(url);
        if (!res?.ok) continue;
        out.push({
          weight: Number(weight) >= 600 ? 600 : 400,
          b64: Buffer.from(await res.arrayBuffer()).toString('base64'),
        });
      }
      return out;
    },
    { shouldCache: (v) => v.length > 0 },
  );
}

async function loadFonts(languageCode: string, segment: string): Promise<FallbackFont[]> {
  // A run of Han can be several locales at once ("ja-JP|zh-CN|…"); any of them draws it.
  const code = languageCode.split('|')[0] ?? '';
  const families = FAMILIES[code] ?? DEFAULT_FAMILIES;
  const loaded = await Promise.all(families.map((family) => loadFamily(family, segment)));
  return loaded.flatMap((faces, i) =>
    faces.map(({ weight, b64 }) => {
      const buf = Buffer.from(b64, 'base64');
      return {
        name: families[i]!,
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight,
        style: 'normal' as const,
      };
    }),
  );
}

/** satori's `loadAdditionalAsset`. Never throws: a failure leaves the glyph undrawn. */
export async function loadFallbackAsset(languageCode: string, segment: string): Promise<string | FallbackFont[]> {
  if (!segment || segment.length > MAX_SEGMENT) return [];
  try {
    // An empty string would be drawn as an image with no source; "no fonts" leaves the box.
    if (languageCode === 'emoji') return (await loadEmoji(segment)) || [];
    return await loadFonts(languageCode, segment);
  } catch {
    return [];
  }
}
