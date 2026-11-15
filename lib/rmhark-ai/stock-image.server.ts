/**
 * Online-sourced pictures for RMHark bots: search Openverse for a public-domain
 * photo, download it, crop it and store it in our own object storage. Nothing
 * here generates an image, and nothing hotlinks the source.
 *
 * Two keyless sources, public-domain only (CC0 or public domain), so no
 * attribution is owed:
 *
 *  1. Openverse (api.openverse.org), WordPress's open image search over Flickr,
 *     Wikimedia Commons and other collections, asked first because it filters
 *     mature content. Anonymous callers get 20 requests a minute and 200 a day,
 *     which the refresh run stays well under, but anonymous search is slow and
 *     often answers 504 on a cold query (most queries, on 2026-11-14).
 *  2. Wikimedia Commons' own search API, which answers in under a second. It has
 *     no mature filter, so the search excludes explicit terms and every title is
 *     checked against them as well.
 *
 * Every call is bounded by a timeout and every failure is a null: the bot keeps
 * its current look and the next hourly run tries again.
 *
 * Downloads go through `safeFetch`: the URLs come from a third party's index.
 *
 * Server-only.
 */
import sharp from 'sharp';
import { safeFetch } from '@/lib/ssrf-guard.server';
import { deleteObject, putObject } from '@/lib/storage/s3.server';
import {
  userAvatarFilename,
  userAvatarKey,
  userAvatarUrl,
  userBannerKey,
  userBannerUrl,
} from '@/lib/storage/keys';
import { renderBannerRendition } from '@/lib/profile/banner-image.server';
import { removeStoredBanner } from '@/lib/profile/banner-store.server';
import { SITE_URL } from '@/lib/seo';

const OPENVERSE_SEARCH = 'https://api.openverse.org/v1/images/';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Wikimedia's policy asks automated clients for a name and a contact URL. */
const USER_AGENT = `rmhstudios-bot-worker/1.0 (${SITE_URL})`;
const OPENVERSE_TIMEOUT_MS = 12_000;
const COMMONS_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
/** How many search results to try downloading before giving up on a query. */
const MAX_DOWNLOAD_ATTEMPTS = 3;

const AVATAR_SIZE = 512;
/** Wikimedia originals can be 6000px; ask its thumbnailer for this width instead. */
const WIKIMEDIA_THUMB_WIDTH = 1600;

export type StockShape = 'square' | 'wide';

export interface StockCandidate {
  url: string;
  width: number;
  height: number;
}

interface OpenverseResult {
  title?: unknown;
  url?: unknown;
  width?: unknown;
  height?: unknown;
}

/** Whether a result of this size can be cropped to the shape without looking poor. */
function fitsShape(width: number, height: number, shape: StockShape): boolean {
  const aspect = width / height;
  if (shape === 'square') return Math.min(width, height) >= 400 && aspect >= 0.5 && aspect <= 2;
  return width >= 1000 && aspect >= 1.2;
}

/** Words that must not appear in a picture's title (Commons has no mature filter). */
const EXPLICIT_TERMS = [
  'nude',
  'nudity',
  'naked',
  'nsfw',
  'erotic',
  'topless',
  'porn',
  'sex',
  'genital',
  'lingerie',
  'corpse',
  'gore',
] as const;
const EXPLICIT_RE = new RegExp(`\\b(${EXPLICIT_TERMS.join('|')})`, 'i');

export function isExplicitTitle(title: string): boolean {
  return EXPLICIT_RE.test(title.replace(/[_-]+/g, ' '));
}

/** Commons licence names that owe no attribution. */
const PUBLIC_DOMAIN_LICENSES = new Set(['cc0', 'public domain', 'no restrictions', 'pdm']);

/** Public-domain photos fitting `shape`: Openverse first, then Commons; [] when both fail. */
export async function searchStockImages(
  query: string,
  shape: StockShape,
): Promise<StockCandidate[]> {
  const fromOpenverse = await searchOpenverse(query, shape);
  if (fromOpenverse.length > 0) return fromOpenverse;
  return searchCommons(query, shape);
}

async function searchOpenverse(query: string, shape: StockShape): Promise<StockCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    license: 'cc0,pdm',
    mature: 'false',
    page_size: '20',
  });
  try {
    const res = await safeFetch(`${OPENVERSE_SEARCH}?${params}`, {
      timeoutMs: OPENVERSE_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return [];
    }
    const body = (await res.json()) as { results?: OpenverseResult[] };
    const out: StockCandidate[] = [];
    for (const r of body.results ?? []) {
      if (typeof r.url !== 'string' || !r.url.startsWith('https://')) continue;
      if (typeof r.width !== 'number' || typeof r.height !== 'number') continue;
      if (typeof r.title === 'string' && isExplicitTitle(r.title)) continue;
      if (!fitsShape(r.width, r.height, shape)) continue;
      out.push({ url: r.url, width: r.width, height: r.height });
    }
    return out;
  } catch {
    return [];
  }
}

interface CommonsPage {
  title?: unknown;
  imageinfo?: {
    width?: unknown;
    height?: unknown;
    thumburl?: unknown;
    extmetadata?: { LicenseShortName?: { value?: unknown } };
  }[];
}

async function searchCommons(query: string, shape: StockShape): Promise<StockCandidate[]> {
  const exclude = EXPLICIT_TERMS.map((t) => `-${t}`).join(' ');
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap ${exclude}`,
    gsrnamespace: '6',
    gsrlimit: '50',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiextmetadatafilter: 'LicenseShortName',
    // Ask the thumbnailer for a picture no bigger than we keep, instead of a 6000px original.
    iiurlwidth: shape === 'wide' ? '1600' : '800',
  });
  try {
    const res = await safeFetch(`${COMMONS_API}?${params}`, {
      timeoutMs: COMMONS_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return [];
    }
    const body = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const out: StockCandidate[] = [];
    for (const page of Object.values(body.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (!info || typeof page.title !== 'string' || isExplicitTitle(page.title)) continue;
      const license = info.extmetadata?.LicenseShortName?.value;
      if (typeof license !== 'string' || !PUBLIC_DOMAIN_LICENSES.has(license.trim().toLowerCase())) {
        continue;
      }
      if (typeof info.thumburl !== 'string' || !info.thumburl.startsWith('https://')) continue;
      if (typeof info.width !== 'number' || typeof info.height !== 'number') continue;
      if (!fitsShape(info.width, info.height, shape)) continue;
      out.push({ url: info.thumburl, width: info.width, height: info.height });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * A Wikimedia Commons original as a server-side thumbnail of `width` pixels, when
 * the original is wider than that; any other URL unchanged.
 */
export function downsizedUrl(c: StockCandidate, width: number = WIKIMEDIA_THUMB_WIDTH): string {
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/.exec(
    c.url,
  );
  if (!m || c.width <= width) return c.url;
  const [, a, ab, name] = m;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${name}/${width}px-${name}`;
}

/** Download one picture, bounded in time and size; null unless it decodes as an image. */
async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await safeFetch(url, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
      await res.body.cancel().catch(() => undefined);
      return null;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    const meta = await sharp(buf).metadata();
    return meta.width && meta.height ? buf : null;
  } catch {
    return null;
  }
}

/** A downloaded public-domain picture for `query` in `shape`, or null. */
export async function fetchStockImage(
  query: string,
  shape: StockShape,
  random: () => number,
): Promise<Buffer | null> {
  const candidates = await searchStockImages(query, shape);
  // Fisher-Yates, so two bots that search the same thing rarely land on the same picture.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  for (const c of candidates.slice(0, MAX_DOWNLOAD_ATTEMPTS)) {
    const buf = await download(downsizedUrl(c));
    if (buf) return buf;
  }
  return null;
}

function uniqueName(userId: string): string {
  return `bot-${userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
}

/** Find, crop (512px square, centred on what is interesting) and store an avatar; its URL or null. */
export async function storeBotAvatar(
  userId: string,
  query: string,
  random: () => number,
): Promise<string | null> {
  try {
    const raw = await fetchStockImage(query, 'square', random);
    if (!raw) return null;
    const webp = await sharp(raw)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: sharp.strategy.attention })
      .webp({ quality: 82 })
      .toBuffer();
    const filename = uniqueName(userId);
    await putObject(userAvatarKey(filename), webp, 'image/webp');
    return userAvatarUrl(filename);
  } catch {
    return null;
  }
}

/** Find and store a 3:1 banner through the same rendition as uploaded banners; null on any failure. */
export async function storeBotBanner(
  userId: string,
  query: string,
  random: () => number,
): Promise<{ url: string; sizeBytes: number } | null> {
  try {
    const raw = await fetchStockImage(query, 'wide', random);
    if (!raw) return null;
    const rendition = await renderBannerRendition(raw);
    if (!rendition) return null;
    const filename = uniqueName(userId);
    await putObject(userBannerKey(filename), rendition.buffer, rendition.contentType);
    return { url: userBannerUrl(filename), sizeBytes: rendition.buffer.length };
  } catch {
    return null;
  }
}

/** Delete a replaced bot avatar from storage. Only our own `bot-` objects; DiceBear URLs are skipped. */
export async function removeBotAvatar(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const filename = userAvatarFilename(url);
  if (!filename?.startsWith('bot-')) return;
  await deleteObject(userAvatarKey(filename)).catch(() => undefined);
}

/** Delete a replaced bot banner (rendition, any source, CDN copy). */
export async function removeBotBanner(url: string | null | undefined): Promise<void> {
  await removeStoredBanner(url).catch(() => undefined);
}
