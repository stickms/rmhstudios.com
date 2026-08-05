/**
 * Link-unfurl parsing (B15) — pure, client-safe, no network.
 *
 * Split out of `unfurl.server.ts` so the precedence rules (og:* → twitter:* →
 * `<title>`) and the URL canonicalisation that keys the cache can be unit-tested
 * without a server, a socket, or a Redis.
 *
 * Two things here are load-bearing beyond "parse some HTML":
 *
 * 1. **Canonicalisation is the cache key.** A link posted 500 times is 500
 *    slightly different strings — trailing slash, `utm_*` tail, a `#anchor`,
 *    a capitalised host. Normalising all of those to one key is what turns 500
 *    outbound fetches into one.
 * 2. **The image is never handed to the browser raw.** `proxiedImageUrl` rewrites
 *    every unfurled image to our own `/api/image-proxy`, so rendering a preview
 *    cannot leak the viewer's IP to a third-party host or drop a mixed-content
 *    image into an https page.
 */

/** The shape stored in the cache and returned to the client. */
export interface Unfurled {
  /** The canonical URL the metadata belongs to. */
  url: string;
  title: string | null;
  description: string | null;
  /** Always a same-origin `/api/image-proxy` path, never a third-party URL. */
  image: string | null;
  /** Display host (`og:site_name` when present, else the hostname). */
  site: string;
}

/** Raw metadata lifted out of a document, before proxying/normalisation. */
export interface ParsedMeta {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/**
 * Query parameters that identify a campaign/referrer rather than a document.
 * Stripping them is what makes the same article shared from four places one
 * cache entry instead of four.
 */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ga_/i,
  /^mc_/i,
  /^_hs/i,
  /^(fbclid|gclid|dclid|gbraid|wbraid|msclkid|igshid|mkt_tok|yclid|twclid|vero_id|s_kwcid)$/i,
  /^(ref|ref_src|ref_url|referrer|source)$/i,
];

function isTrackingParam(name: string): boolean {
  return TRACKING_PARAMS.some((re) => re.test(name));
}

/**
 * Normalise a user-supplied URL into the string used as the cache key.
 *
 * Returns `null` for anything that is not an absolute http(s) URL — the caller
 * treats that as "not unfurlable" rather than attempting a fetch. Note this does
 * NOT decide whether the URL is safe to fetch; that is `safeFetch`'s job and it
 * runs on every hop.
 */
export function canonicalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname) return null;

  url.hash = '';
  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase();
  // The default port is implied; keeping it would key `:443` separately.
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }

  const kept: [string, string][] = [];
  for (const [key, value] of url.searchParams) {
    if (!isTrackingParam(key)) kept.push([key, value]);
  }
  // Sorted so `?b=2&a=1` and `?a=1&b=2` are one key.
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  url.search = '';
  for (const [key, value] of kept) url.searchParams.append(key, value);

  // "/" and "" are the same document; deeper paths keep their trailing slash
  // because some servers genuinely distinguish them.
  if (url.pathname === '/') url.pathname = '';

  return url.toString();
}

/** Display host for a URL (`example.com`), or an empty string if unparseable. */
export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

/** Decode the handful of entities that actually appear in meta content. */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    const key = body.toLowerCase();
    if (key.startsWith('#x')) {
      const code = parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[key] ?? match;
  });
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

const META_TAG = /<meta\b([^>]*)>/gi;
const ATTR = /([a-z0-9:_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/**
 * All `<meta>` tags in the document, keyed by their lowercased `property`/`name`.
 * First occurrence wins — pages that repeat `og:image` list the primary first.
 */
function metaMap(html: string): Map<string, string> {
  const out = new Map<string, string>();
  META_TAG.lastIndex = 0;
  let tag: RegExpExecArray | null;
  while ((tag = META_TAG.exec(html))) {
    const attrs = new Map<string, string>();
    ATTR.lastIndex = 0;
    let attr: RegExpExecArray | null;
    while ((attr = ATTR.exec(tag[1]))) {
      attrs.set(attr[1].toLowerCase(), attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    const key = (attrs.get('property') ?? attrs.get('name') ?? attrs.get('itemprop') ?? '')
      .trim()
      .toLowerCase();
    const content = attrs.get('content');
    if (!key || content === undefined) continue;
    if (!out.has(key)) out.set(key, content);
  }
  return out;
}

/** The document `<title>`, if any. */
function documentTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : null;
}

/**
 * Extract metadata with the documented precedence: `og:*` first (the standard
 * the publisher opted into), `twitter:*` next (the fallback most CMSes emit),
 * then the plain document `<title>` / `<meta name="description">`.
 */
export function parseOpenGraph(html: string): ParsedMeta {
  const meta = metaMap(html);
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = clean(meta.get(key));
      if (value) return value;
    }
    return null;
  };

  return {
    title: pick('og:title', 'twitter:title') ?? clean(documentTitle(html)),
    description: pick('og:description', 'twitter:description', 'description'),
    image: pick(
      'og:image:secure_url',
      'og:image:url',
      'og:image',
      'twitter:image',
      'twitter:image:src',
    ),
    siteName: pick('og:site_name', 'application-name'),
  };
}

/**
 * Rewrite an unfurled image to our own proxy.
 *
 * Returns `null` for anything that is not an absolute http(s) URL, including
 * `data:` — a data URI would be inlined into the response body, and a relative
 * path resolved against the wrong origin is a broken image at best.
 */
export function proxiedImageUrl(src: string | null, base?: string): string | null {
  if (!src) return null;
  let absolute: URL;
  try {
    absolute = base ? new URL(src, base) : new URL(src);
  } catch {
    return null;
  }
  if (absolute.protocol !== 'https:' && absolute.protocol !== 'http:') return null;
  return `/api/image-proxy?url=${encodeURIComponent(absolute.toString())}`;
}

/** Assemble the client-facing record from parsed metadata. */
export function buildUnfurled(canonicalUrl: string, meta: ParsedMeta): Unfurled {
  return {
    url: canonicalUrl,
    title: meta.title,
    description: meta.description,
    image: proxiedImageUrl(meta.image, canonicalUrl),
    site: meta.siteName ?? hostOf(canonicalUrl),
  };
}
