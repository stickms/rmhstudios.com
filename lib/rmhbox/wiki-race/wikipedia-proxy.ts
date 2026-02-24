/**
 * Wiki-Race — Wikipedia Content Proxy
 *
 * Fetches, sanitizes, and caches Wikipedia articles for the Wiki-Race game.
 * Strips external links, scripts, and editing UI. Converts internal wiki
 * links to data attributes for WebSocket-based navigation.
 */

import { parse as parseHTML } from 'node-html-parser';
import sanitizeHtml from 'sanitize-html';
import { LRUCache } from 'lru-cache';
import { WR_CACHE_MAX, WR_CACHE_TTL } from '../constants';

export interface CachedArticle {
  title: string;
  sanitizedHtml: string;
  links: Set<string>;
  fetchedAt: number;
}

// Global rate limiter for Wikipedia API (max 200 req/s)
let lastFetchTimestamp = 0;
const MIN_FETCH_INTERVAL_MS = 5; // ~200 req/s

/** Creates an LRU cache for Wikipedia articles. */
export function createArticleCache(): LRUCache<string, CachedArticle> {
  return new LRUCache<string, CachedArticle>({
    max: WR_CACHE_MAX,
    ttl: WR_CACHE_TTL,
  });
}

/**
 * Fetches a Wikipedia article, sanitizes the HTML, and extracts internal links.
 * Returns null if the article cannot be fetched.
 */
export async function fetchArticle(
  title: string,
  cache?: LRUCache<string, CachedArticle>,
): Promise<CachedArticle | null> {
  // Check cache first
  const normalizedTitle = title.replace(/ /g, '_');
  if (cache) {
    const cached = cache.get(normalizedTitle);
    if (cached) return cached;
  }

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastFetchTimestamp;
  if (elapsed < MIN_FETCH_INTERVAL_MS) {
    await new Promise((r) => globalThis.setTimeout(r, MIN_FETCH_INTERVAL_MS - elapsed));
  }
  lastFetchTimestamp = Date.now();

  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(normalizedTitle)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RMHbox-WikiRace/1.0 (game; non-commercial)' },
    });

    if (!response.ok) return null;

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
        'img', 'figure', 'figcaption', 'section', 'span', 'sup', 'sub',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
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
          return { tagName: 'span', attribs: { class: 'stripped-link' } };
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
      title: normalizedTitle,
      sanitizedHtml: sanitized,
      links,
      fetchedAt: Date.now(),
    };

    if (cache) cache.set(normalizedTitle, article);
    return article;
  } catch {
    return null;
  }
}
