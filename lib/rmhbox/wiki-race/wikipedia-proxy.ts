/**
 * Wiki-Race — Wikipedia Content Proxy
 *
 * Fetches, sanitizes, and caches Wikipedia articles for the Wiki-Race game.
 * Strips external links, scripts, and editing UI. Converts internal wiki
 * links to data attributes for WebSocket-based navigation.
 *
 * Wikimedia's API etiquette (and its 429s when ignored): a User-Agent that
 * names the client and how to reach its operator, bounded requests, backing
 * off on 429/503 as Retry-After says, and not refetching the same page. So:
 * one module-level cache shared by every game in the process (an article
 * fetched for one lobby serves the next), each request times out, and a
 * 429/5xx/network failure is retried at most twice.
 */

import { parse as parseHTML } from 'node-html-parser';
import sanitizeHtml from 'sanitize-html';
import { LRUCache } from 'lru-cache';

/** Policy-compliant User-Agent: client name/version and a contact URL (no personal data). */
export const WIKIPEDIA_USER_AGENT = 'RMHStudios-RMHbox/1.0 (https://rmhstudios.com; party game)';
/** Per-request timeout. */
const FETCH_TIMEOUT_MS = 8_000;
/** Retries after the first attempt (429, 5xx, timeout or network error). */
const MAX_RETRIES = 2;
/** Longest we wait between attempts, whatever Retry-After asks. */
const MAX_RETRY_WAIT_MS = 5_000;
/** Shared article cache bounds: entries and time to live. */
const SHARED_CACHE_MAX = 200;
const SHARED_CACHE_TTL_MS = 60 * 60 * 1000;

export interface CachedArticle {
  title: string;
  sanitizedHtml: string;
  links: Set<string>;
  fetchedAt: number;
}

// Global rate limiter for Wikipedia API (max 200 req/s)
let lastFetchTimestamp = 0;
const MIN_FETCH_INTERVAL_MS = 5; // ~200 req/s

/**
 * The process-wide article cache. In-process on purpose: values hold a Set
 * (not JSON), each sanitized article is costly to rebuild, and the only
 * consumer is the single rmhbox hub process.
 */
const sharedArticleCache = new LRUCache<string, CachedArticle>({
  max: SHARED_CACHE_MAX,
  ttl: SHARED_CACHE_TTL_MS,
});

/**
 * The article cache. Returns the shared process-wide cache (it used to be one
 * cache per game, so every lobby refetched the same pages).
 */
export function createArticleCache(): LRUCache<string, CachedArticle> {
  return sharedArticleCache;
}

/**
 * Fetches a Wikipedia article, sanitizes the HTML, and extracts internal links.
 * Returns null if the article cannot be fetched (after retries).
 */
export async function fetchArticle(
  title: string,
  cache: LRUCache<string, CachedArticle> = sharedArticleCache,
): Promise<CachedArticle | null> {
  // Check cache first
  const normalizedTitle = title.replace(/ /g, '_');
  const cached = cache.get(normalizedTitle);
  if (cached) return cached;

  return fetchAndBuild(normalizedTitle, cache);
}

/** Milliseconds to wait before retry `attempt` (1-based): Retry-After if given, else 1 s, 2 s; capped. */
function retryDelayMs(response: Response | null, attempt: number): number {
  const header = response?.headers.get('retry-after');
  let ms = attempt * 1000;
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) ms = seconds * 1000;
    else {
      const at = Date.parse(header);
      if (Number.isFinite(at)) ms = at - Date.now();
    }
  }
  return Math.max(0, Math.min(MAX_RETRY_WAIT_MS, ms));
}

/** GET with a timeout, retrying 429 / 5xx / network failures. Returns null on a final failure or a 4xx. */
async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; ; attempt++) {
    let response: Response | null = null;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': WIKIPEDIA_USER_AGENT,
          'Api-User-Agent': WIKIPEDIA_USER_AGENT,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return response;
      // Not found / bad title: retrying will not help.
      if (response.status !== 429 && response.status < 500) return null;
    } catch {
      // Timeout or network error: retry below.
      response = null;
    }
    if (attempt >= MAX_RETRIES) return null;
    await new Promise((r) => globalThis.setTimeout(r, retryDelayMs(response, attempt + 1)));
  }
}

async function fetchAndBuild(
  normalizedTitle: string,
  cache: LRUCache<string, CachedArticle>,
): Promise<CachedArticle | null> {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastFetchTimestamp;
  // (A negative gap means the clock went backwards: don't wait on it.)
  if (elapsed >= 0 && elapsed < MIN_FETCH_INTERVAL_MS) {
    await new Promise((r) => globalThis.setTimeout(r, MIN_FETCH_INTERVAL_MS - elapsed));
  }
  lastFetchTimestamp = Date.now();

  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(normalizedTitle)}`;
    const response = await fetchWithRetry(url);
    if (!response) return null;

    // Detect redirects: extract the canonical title from the final URL.
    // Wikipedia's REST API follows redirects (e.g. Stem_cells → Stem_cell),
    // so response.url contains the actual article path.
    let canonicalTitle = normalizedTitle;
    const urlMatch = response.url.match(/\/page\/html\/([^?#]+)$/);
    if (urlMatch) {
      canonicalTitle = decodeURIComponent(urlMatch[1]);
    }

    // Check cache for the canonical title in case it was already fetched
    if (canonicalTitle !== normalizedTitle) {
      const cachedCanonical = cache.get(canonicalTitle);
      if (cachedCanonical) {
        // Also cache under the original title for future lookups
        cache.set(normalizedTitle, cachedCanonical);
        return cachedCanonical;
      }
    }

    const rawHtml = await response.text();

    // Yield to the event loop before CPU-intensive parsing
    await new Promise((r) => globalThis.setTimeout(r, 0));

    const root = parseHTML(rawHtml);

    // Extract internal wiki links
    const links = new Set<string>();
    const anchors = root.querySelectorAll('a[href]');
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      // Match internal wiki links: /wiki/Article_Title (but not /wiki/Special:, /wiki/File:, etc.)
      const match = href.match(/^\.\/([^#:]+)$/);
      if (match) {
        const linkTitle = decodeURIComponent(match[1]);
        links.add(linkTitle);
      }
    }

    // Yield to the event loop before CPU-intensive sanitization
    await new Promise((r) => globalThis.setTimeout(r, 0));

    // Sanitize HTML
    const sanitized = sanitizeHtml(rawHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        'img',
        'figure',
        'figcaption',
        'section',
        'span',
        'sup',
        'sub',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'caption',
      ]),
      allowedAttributes: {
        a: ['data-wiki-target', 'class'],
        img: ['src', 'alt', 'width', 'height'],
        span: ['class'],
        td: ['colspan', 'rowspan'],
        th: ['colspan', 'rowspan'],
      },
      transformTags: {
        a: (tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag => {
          const href = attribs.href || '';
          const match = href.match(/^\.\/([^#:]+)$/);
          if (match) {
            const linkTitle = decodeURIComponent(match[1]);
            return {
              tagName,
              attribs: {
                'data-wiki-target': linkTitle,
                class: 'wiki-link',
              },
            };
          }
          // Strip non-wiki links
          return {
            tagName: 'span',
            attribs: {
              class: 'stripped-link',
            },
          };
        },
        img: (_tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag => {
          let src = attribs.src || '';
          // Ensure all image URLs use HTTPS (Wikipedia may serve
          // protocol-relative //upload.wikimedia.org/… URLs)
          if (src.startsWith('//')) {
            src = 'https:' + src;
          } else if (src.startsWith('http://')) {
            src = src.replace(/^http:\/\//, 'https://');
          }
          return {
            tagName: 'img',
            attribs: {
              ...attribs,
              src,
            },
          };
        },
      },
      exclusiveFilter: (frame) => {
        // Remove nav, footer, script, style, edit links
        const tag = frame.tag;
        if (['script', 'style', 'nav', 'footer'].includes(tag)) return true;
        // Remove elements with edit-related classes
        const cls = frame.attribs?.class || '';
        if (cls.includes('mw-editsection') || cls.includes('reference')) return true;
        return false;
      },
    });

    const article: CachedArticle = {
      title: canonicalTitle,
      sanitizedHtml: sanitized,
      links,
      fetchedAt: Date.now(),
    };

    cache.set(canonicalTitle, article);
    // Also cache under the original title so future lookups for the
    // redirect source resolve instantly.
    if (canonicalTitle !== normalizedTitle) {
      cache.set(normalizedTitle, article);
    }
    return article;
  } catch {
    return null;
  }
}
