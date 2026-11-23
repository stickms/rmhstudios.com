/**
 * Turns one RSS/Atom item (as `rss-parser` hands it over) into an RMH News candidate: a clean headline, a plain-text
 * excerpt, the best picture the feed offers, a canonical link and a publication time.
 *
 * Pure and dependency-free, so the tests feed it the shapes the real feeds publish (lib/news-wire/sources.ts):
 * `media:content` at several widths (The Guardian, Ars Technica), `media:thumbnail` (BBC, Wired), an image
 * `<enclosure>` (Engadget), or only an `<img>` inside the HTML body (NPR, The Verge, The Conversation).
 */

import type { NewsSource } from './sources';

/** The `media:*` element as rss-parser keeps it: attributes under `$`. */
interface MediaElement {
  $?: { url?: string; width?: string; height?: string; medium?: string; type?: string };
}

/** The fields of an rss-parser item this reads (it is configured with the custom fields in ingest.server.ts). */
export interface FeedItem {
  title?: string;
  link?: string;
  guid?: string;
  id?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  contentEncoded?: string;
  summary?: string;
  categories?: Array<string | { _?: string }>;
  enclosure?: { url?: string; type?: string };
  mediaContent?: MediaElement[];
  mediaThumbnail?: MediaElement[];
}

export interface WireCandidate {
  url: string;
  title: string;
  /** Plain text, at most {@link EXCERPT_MAX} characters. */
  description: string;
  imageUrl: string | null;
  publishedAt: Date;
  /** The outlet's own tags, plain text. */
  tags: string[];
}

export const EXCERPT_MAX = 420;
const TITLE_MAX = 300;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** HTML to one line of plain text: scripts and styles dropped, tags removed, entities decoded, space collapsed. */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|figure|figcaption)[\s\S]*?<\/\1>/gi, ' ')
      // Block-level tags separate words; inline ones (<b>, <a>, <span>) sit inside them.
      .replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|section|article|blockquote|header|footer)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut at a word boundary and add an ellipsis when anything was cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

const TRACKING_PARAM =
  /^(utm_[a-z]+|at_[a-z_]+|cmp|cmpid|ito|ns_[a-z]+|ocid|fbclid|gclid|mc_[a-z]+|ref|src|taid|guccounter|smid)$/i;

/** An http(s) URL with tracking parameters and the fragment removed, or null when it is not one. */
export function cleanUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.toString();
}

/** Pictures are drawn on an https page: an http one is upgraded, anything else is dropped. */
function httpsImage(raw: string | undefined | null): string | null {
  const url = cleanUrl(raw ? decodeEntities(raw) : raw);
  if (!url) return null;
  return url.startsWith('http:') ? `https:${url.slice(5)}` : url;
}

const widthOf = (m: MediaElement) => Number(m.$?.width) || 0;
const isImage = (m: MediaElement) => {
  const medium = m.$?.medium;
  const type = m.$?.type;
  if (medium) return medium === 'image';
  if (type) return type.startsWith('image/');
  return true;
};

/** The widest image `media:*` element with a URL. */
function widest(elements: MediaElement[] | undefined): string | null {
  const best = (elements ?? []).filter((m) => m.$?.url && isImage(m)).sort((a, b) => widthOf(b) - widthOf(a))[0];
  return best?.$?.url ?? null;
}

const IMG_SRC = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;

/** The feed's best picture for the item: the widest `media:content`, then `media:thumbnail`, enclosure, inline `<img>`. */
export function pickImage(item: FeedItem, source?: Pick<NewsSource, 'upgradeImage'>): string | null {
  const enclosure =
    item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith('image/'))
      ? item.enclosure.url
      : null;
  const inline = [item.contentEncoded, item.content, item.summary]
    .map((html) => (html ? IMG_SRC.exec(html)?.[1] : undefined))
    .find(Boolean);
  const raw = widest(item.mediaContent) ?? widest(item.mediaThumbnail) ?? enclosure ?? inline ?? null;
  const url = httpsImage(raw);
  // A 1×1 tracking pixel is not a picture.
  if (!url || /(?:pixel|spacer|blank|1x1)\.(?:gif|png)/i.test(url) || /feeds\.feedburner\.com/.test(url)) return null;
  return source?.upgradeImage ? source.upgradeImage(url) : url;
}

function tagText(tag: string | { _?: string }): string {
  return stripHtml(typeof tag === 'string' ? tag : (tag._ ?? ''));
}

function publishedAt(item: FeedItem, now: Date): Date {
  const raw = item.isoDate ?? item.pubDate;
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return now;
  // A feed that dates an item in the future would pin it to the top of the page.
  return parsed.getTime() > now.getTime() + 60 * 60 * 1000 ? now : parsed;
}

/** One feed item as an RMH News candidate, or null when it has no headline or no usable link. */
export function parseFeedItem(
  item: FeedItem,
  source?: Pick<NewsSource, 'upgradeImage'>,
  now = new Date(),
): WireCandidate | null {
  const title = truncate(stripHtml(item.title ?? ''), TITLE_MAX);
  const url = cleanUrl(item.link ?? (item.guid?.startsWith('http') ? item.guid : undefined) ?? item.id);
  if (!title || !url) return null;
  const html = item.contentSnippet ? null : (item.summary ?? item.content ?? item.contentEncoded ?? '');
  const excerpt = item.contentSnippet ? stripHtml(item.contentSnippet) : stripHtml(html ?? '');
  return {
    url,
    title,
    // Some feeds repeat the headline as the excerpt; that is no excerpt.
    description: excerpt === title ? '' : truncate(excerpt, EXCERPT_MAX),
    imageUrl: pickImage(item, source),
    publishedAt: publishedAt(item, now),
    tags: (item.categories ?? []).map(tagText).filter(Boolean).slice(0, 12),
  };
}

/** FNV-1a over the string, base 36: short, stable and good enough to keep two slugs for one headline apart. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, '0').slice(0, 7);
}

/** The article's slug: the headline in ASCII words, then a hash of the link, so the same headline twice stays two. */
export function wireSlug(title: string, url: string): string {
  const full = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Cut long headlines at a whole word.
  const words = full.length <= 72 ? full : full.slice(0, 72).replace(/-[^-]*$/, '');
  return `${words || 'story'}-${shortHash(url)}`;
}
