/**
 * `rel="me"` matching — the whole of J1's verification decision, as pure logic.
 *
 * The claim a verified profile link makes is **"this person controls this
 * domain"**, and nothing else. It is not a checkmark, it is not importance, and
 * it never becomes a badge on the account (design plan J1 §4). The check itself
 * is one fetch and one string match, which is exactly why it has to be written
 * carefully: a sloppy match hands anyone a "verified" mark on `nytimes.com`.
 *
 * Everything here is client-safe and dependency-free so the matcher can be
 * unit-tested against hostile HTML without a network or a database. The fetch
 * half lives in `verify.server.ts`.
 *
 * What counts as a match: an `<a>` or `<link>` element whose `rel` attribute
 * contains the token `me` (a space-separated token list — `rel="me nofollow"`
 * matches, `rel="meme"` does not) and whose `href` resolves to this site's
 * canonical profile URL for the handle being claimed.
 *
 * What deliberately does NOT count, each one a way this check has been broken
 * elsewhere:
 *   - anything inside an HTML comment, `<script>`, `<style>`, `<template>` or
 *     `<textarea>` — an attacker who can get a comment onto a page they do not
 *     control could otherwise verify it;
 *   - `https://rmhstudios.com.evil.test/u/alice` — host is compared after URL
 *     parsing, never by prefix;
 *   - `https://evil.test/?to=https://rmhstudios.com/u/alice` — the query string
 *     is not the path;
 *   - `/u/alice-two` when claiming `alice` — the path is compared segment-wise;
 *   - a `rel="me"` pointing at somebody else's profile.
 */

import { SITE_URL } from '@/lib/seo';

/**
 * Hosts whose `/u/<handle>` path is a real RMH profile. `www.` is accepted
 * because people copy the address bar, and Cloudflare serves both.
 */
export const PROFILE_HOSTS: readonly string[] = ['rmhstudios.com', 'www.rmhstudios.com'];

/** The canonical, copy-pasteable back-link a user puts on their own site. */
export function profileUrlFor(handle: string): string {
  return `${SITE_URL}/u/${handle}`;
}

/**
 * The `rel` value RMH itself emits on an outbound profile link.
 *
 * The reciprocal half of J1: a *verified* link is marked `me` so a Mastodon (or
 * any other `rel="me"` consumer) profile can verify **against** an RMH profile,
 * which is what makes this participate in the existing web of trust instead of
 * being a private badge. Unverified links get no `me` — asserting the identity
 * edge before it is proven would make the token meaningless in both directions.
 *
 * `nofollow ugc noopener noreferrer` is carried in both cases: an outbound link
 * a stranger typed into a profile is user-generated content whether or not the
 * domain checks out.
 */
export function profileLinkRel(verified: boolean): string {
  return verified ? 'me nofollow ugc noopener noreferrer' : 'nofollow ugc noopener noreferrer';
}

/** Case-insensitively strip a leading `www.` so host comparison is stable. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

/**
 * Regions of an HTML document whose text is not live markup. Stripped before
 * matching so a `rel="me"` inside a comment, a script string, or a `<textarea>`
 * (i.e. anywhere a visitor's post body can land) cannot verify a domain.
 */
const INERT_REGIONS: readonly RegExp[] = [
  /<!--[\s\S]*?(?:-->|$)/gi,
  /<script\b[\s\S]*?(?:<\/script\s*>|$)/gi,
  /<style\b[\s\S]*?(?:<\/style\s*>|$)/gi,
  /<template\b[\s\S]*?(?:<\/template\s*>|$)/gi,
  /<textarea\b[\s\S]*?(?:<\/textarea\s*>|$)/gi,
];

/** Drop comments and raw-text elements from a document before scanning it. */
export function stripInertMarkup(html: string): string {
  let out = html;
  for (const re of INERT_REGIONS) out = out.replace(re, ' ');
  return out;
}

/** The five entities that can appear in an attribute value, decoded. */
function decodeEntities(value: string): string {
  return value
    .replace(/&(?:amp|AMP);/g, '&')
    .replace(/&(?:lt|LT);/g, '<')
    .replace(/&(?:gt|GT);/g, '>')
    .replace(/&(?:quot|QUOT);/g, '"')
    .replace(/&(?:apos|#39);/g, "'");
}

/** Read one attribute out of an opening tag, tolerating quoting styles. */
function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'\`=<>]+))`, 'i');
  const m = re.exec(tag);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
}

/** True when a `rel` attribute's token list contains `me`. */
export function relContainsMe(rel: string | null): boolean {
  if (!rel) return false;
  return rel
    .trim()
    .split(/\s+/)
    .some((token) => token.toLowerCase() === 'me');
}

/**
 * The handle a URL claims, or `null` when the URL is not an RMH profile URL.
 *
 * Parsed, never pattern-matched: `https://rmhstudios.com.evil.test/u/alice` and
 * `https://evil.test/?u=https://rmhstudios.com/u/alice` both return `null`
 * because host and path are read off a parsed `URL`.
 */
export function profileHandleFromUrl(href: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!PROFILE_HOSTS.some((h) => normalizeHost(h) === normalizeHost(url.hostname))) return null;

  // Segment-wise, so `/u/alice-two` never satisfies a claim on `alice` and a
  // percent-encoded `/u/%61lice` still resolves to `alice`.
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2 || segments[0].toLowerCase() !== 'u') return null;
  let handle: string;
  try {
    handle = decodeURIComponent(segments[1]);
  } catch {
    return null;
  }
  return handle.toLowerCase() || null;
}

/** One `rel="me"` edge found in a document. */
export interface RelMeLink {
  /** The raw `href` as written on the page. */
  href: string;
  /** The RMH handle it claims, when it is an RMH profile URL. */
  handle: string | null;
}

/**
 * Every `rel="me"` `<a>` / `<link>` in a document, in source order.
 *
 * `pageUrl` resolves relative hrefs — a site that links back with `/u/alice`
 * relative to its own origin is not claiming an RMH profile, and resolving
 * against the page's own URL is what makes that fall out correctly instead of
 * throwing.
 */
export function findRelMeLinks(html: string, pageUrl?: string): RelMeLink[] {
  const source = stripInertMarkup(html);
  const tagRe = /<(a|link)\b([^>]*)>/gi;
  const found: RelMeLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(source))) {
    const tag = m[0];
    if (!relContainsMe(attr(tag, 'rel'))) continue;
    const href = attr(tag, 'href');
    if (!href) continue;
    found.push({ href, handle: profileHandleFromUrl(href, pageUrl) });
  }
  return found;
}

/**
 * The verification decision: does this page link back to `handle` with
 * `rel="me"`?
 *
 * Handle comparison is case-insensitive because handles are lowercase by rule
 * (`lib/handle.ts`) but a hand-typed back-link often is not.
 */
export function htmlVerifiesHandle(html: string, handle: string, pageUrl?: string): boolean {
  const wanted = handle.trim().toLowerCase();
  if (!wanted) return false;
  return findRelMeLinks(html, pageUrl).some((link) => link.handle === wanted);
}
