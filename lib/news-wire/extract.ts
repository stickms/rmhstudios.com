/**
 * Reads an outlet's article page for two things only: its share picture (`og:image`, for feeds that publish none) and
 * the article's text, which is what the DeepSeek summary is written from (./summary.server.ts). Nothing extracted here
 * is shown to readers as it is: the picture is a link to the outlet's own image, the text only feeds the summary.
 *
 * Pure, regex-based and forgiving: a page it cannot read yields nothing, and the summary then says so instead of
 * guessing from the headline.
 */

import { decodeEntities, stripHtml } from './parse';

/** The longest text handed to the model: about 3,000 tokens, plenty for a news story's facts. */
export const ARTICLE_TEXT_MAX = 12_000;
/** Below this the page held no article we could find (a paywall, a video page, a cookie wall). */
export const ARTICLE_TEXT_MIN = 400;

const META = /<meta\b[^>]*>/gi;
const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
    .exec(tag)
    ?.slice(2)
    .find((v) => v !== undefined);

/** The page's `og:image` (or `twitter:image`), absolute and https, or null. */
export function extractOgImage(html: string, pageUrl: string): string | null {
  let found: string | null = null;
  for (const tag of html.match(META) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    if (key !== 'og:image' && key !== 'og:image:secure_url' && key !== 'twitter:image') continue;
    const content = attr(tag, 'content');
    if (!content) continue;
    found = content;
    if (key !== 'twitter:image') break;
  }
  if (!found) return null;
  try {
    const url = new URL(decodeEntities(found.trim()), pageUrl);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** `articleBody` from the page's JSON-LD, which most news sites publish whole. */
function jsonLdBody(html: string): string | null {
  const blocks = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const block of blocks) {
    const json = block.replace(/^<script\b[^>]*>/i, '').replace(/<\/script>$/i, '');
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      continue;
    }
    const stack: unknown[] = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === 'object') {
        const body = (node as Record<string, unknown>).articleBody;
        if (typeof body === 'string' && body.length >= ARTICLE_TEXT_MIN) return stripHtml(body);
        stack.push(...Object.values(node as Record<string, unknown>));
      }
    }
  }
  return null;
}

const NOISE = /<(script|style|noscript|nav|header|footer|aside|form|figure|svg|button)\b[\s\S]*?<\/\1>/gi;

function paragraphsIn(html: string): string {
  const out: string[] = [];
  for (const m of html.replace(NOISE, ' ').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripHtml(m[1] ?? '');
    // Bylines, captions and "Sign up for our newsletter" lines are short; paragraphs of a story are not.
    if (text.length >= 60) out.push(text);
  }
  return out.join('\n\n');
}

/** The story's paragraphs: inside the page's `<article>` elements when they hold the story, else the whole page. */
function paragraphs(html: string): string {
  const articles = html.match(/<article\b[\s\S]*?<\/article>/gi) ?? [];
  const inArticles = articles.length ? paragraphsIn(articles.join('\n')) : '';
  return inArticles.length >= ARTICLE_TEXT_MIN ? inArticles : paragraphsIn(html);
}

/** The article's text, at most {@link ARTICLE_TEXT_MAX} characters, or '' when there is too little to be a story. */
export function extractArticleText(html: string): string {
  // Some outlets put only the first paragraphs in their JSON-LD: the longer reading wins.
  const ld = jsonLdBody(html) ?? '';
  const ps = paragraphs(html);
  const text = ld.length >= ps.length ? ld : ps;
  if (text.length < ARTICLE_TEXT_MIN) return '';
  return text.length > ARTICLE_TEXT_MAX ? text.slice(0, ARTICLE_TEXT_MAX) : text;
}
