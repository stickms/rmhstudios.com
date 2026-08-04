/**
 * `rel="me"` verification — the outbound half of J1.
 *
 * This is the exact case `CLAUDE.md` §8 names: a server-side fetch of a URL a
 * stranger typed in. Every request therefore goes through `safeFetch`
 * (`lib/ssrf-guard.server`), which validates the URL, re-validates every
 * redirect hop and pins the connection to the address it checked. Nothing in
 * this module may reach for bare `fetch`.
 *
 * Three further limits, because a verify button is an amplification vector as
 * well as an SSRF one:
 *   - a hard byte cap read off the STREAM (a `content-length` header is a
 *     claim, not a fact — a hostile server can send gigabytes with no header
 *     at all, so the cap is enforced chunk by chunk);
 *   - a short timeout;
 *   - HTTPS only, and at most two redirect hops.
 *
 * Rate limiting is the caller's job and is enforced at the route
 * (`app/routes/api/profile-links/$id/verify.ts`) with a per-user bucket.
 */

import type { ProfileLink as ProfileLinkRow } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { safeFetch, SsrfError } from '@/lib/ssrf-guard.server';
import { htmlVerifiesHandle } from '@/lib/profile-links/rel-me';

/** 512 KB is far more than any `<head>` needs and small enough to be cheap. */
export const MAX_VERIFY_BYTES = 512 * 1024;
/** A page that has not answered in 6s is not going to. */
export const VERIFY_TIMEOUT_MS = 6_000;
/** How long a successful check is trusted before the sweep re-runs it. */
export const REVERIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type VerifyOutcome =
  | 'verified'
  /** Fetched fine, no matching `rel="me"` — the ordinary "not set up yet" case. */
  | 'no-match'
  /** The URL is one the SSRF guard refuses to fetch. */
  | 'blocked'
  /** Network error, timeout, non-2xx, or a body we will not parse. */
  | 'unreachable';

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** The row as it now stands, so callers need no follow-up read. */
  link: ProfileLinkRow;
}

/** Only markup is worth scanning; a PDF or an image cannot carry `rel="me"`. */
function looksLikeHtml(contentType: string | null): boolean {
  if (!contentType) return true; // no header — try it, the byte cap bounds the risk
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === '' || type === 'text/html' || type === 'application/xhtml+xml';
}

/**
 * Read at most `MAX_VERIFY_BYTES` from a response body.
 *
 * Enforced against the stream rather than `content-length` so a server that
 * lies about (or omits) its length cannot make us buffer an unbounded body.
 */
async function readCapped(res: Response, cap: number): Promise<string> {
  const body = res.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = cap - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total = cap;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(joined);
}

/**
 * Fetch a URL and decide whether it links back to `handle` with `rel="me"`.
 *
 * Pure of database access so it can be exercised against a local server; the
 * row update is `verifyProfileLink` below.
 */
export async function checkRelMe(url: string, handle: string): Promise<VerifyOutcome> {
  let res: Response;
  try {
    res = await safeFetch(url, {
      // HTTPS only. A claim proven over plaintext http is a claim proven to
      // whoever is on the path, which is not a claim.
      allowedProtocols: ['https:'],
      maxRedirects: 2,
      timeoutMs: VERIFY_TIMEOUT_MS,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'RMHStudios-LinkVerifier/1.0 (+https://rmhstudios.com)',
      },
    });
  } catch (error) {
    return error instanceof SsrfError ? 'blocked' : 'unreachable';
  }

  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return 'unreachable';
  }
  if (!looksLikeHtml(res.headers.get('content-type'))) {
    await res.body?.cancel().catch(() => {});
    return 'no-match';
  }

  let html: string;
  try {
    html = await readCapped(res, MAX_VERIFY_BYTES);
  } catch {
    return 'unreachable';
  }

  return htmlVerifiesHandle(html, handle, url) ? 'verified' : 'no-match';
}

/**
 * Verify one link and stamp the row.
 *
 * `lastCheckedAt` always moves, so a failing link is not re-checked in a loop.
 * `verifiedAt` is set on a match and **cleared on `no-match`** — the mark
 * describes the page as it is now, and a domain that stopped linking back has
 * stopped making the claim. It is deliberately NOT cleared on `unreachable` or
 * `blocked`: an outage is not a retraction, and letting a timeout strip a
 * verification would make the mark flap with the target's uptime.
 */
export async function verifyProfileLink(
  userId: string,
  linkId: string,
): Promise<VerifyResult | null> {
  const [link, user] = await Promise.all([
    prisma.profileLink.findFirst({ where: { id: linkId, userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { handle: true } }),
  ]);
  if (!link) return null;
  // No handle means no canonical profile URL to link back TO, so there is
  // nothing a page could be matching against.
  if (!user?.handle) return { outcome: 'no-match', link };

  const outcome = await checkRelMe(link.url, user.handle);
  const now = new Date();
  const updated = await prisma.profileLink.update({
    where: { id: link.id },
    data: {
      lastCheckedAt: now,
      ...(outcome === 'verified' ? { verifiedAt: now } : {}),
      ...(outcome === 'no-match' ? { verifiedAt: null } : {}),
    },
  });
  return { outcome, link: updated };
}

/**
 * Re-check links whose verification has gone stale (J1 §5).
 *
 * Written to be driven by a worker tick, not by the web tier — there is no cron
 * in the SSR process (`lib/CLAUDE.md`). Only links that are currently *verified*
 * are swept: an unverified link has nothing to lose, and re-fetching every
 * unverified URL on the site on a schedule would turn this into a crawler.
 *
 * Drops the mark **silently** when a page stops matching. There is no "your
 * verification expired" notification on purpose: the check is about the page's
 * current state, and a notification would train people to treat the mark as a
 * status they hold rather than a fact about a document.
 */
export async function reverifyStaleProfileLinks(
  options: { batchSize?: number; now?: Date } = {},
): Promise<{ checked: number; dropped: number }> {
  const { batchSize = 25, now = new Date() } = options;
  const cutoff = new Date(now.getTime() - REVERIFY_AFTER_MS);

  const due = await prisma.profileLink.findMany({
    where: {
      verifiedAt: { not: null },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
    },
    orderBy: [{ lastCheckedAt: 'asc' }],
    take: batchSize,
    select: { id: true, userId: true },
  });

  let checked = 0;
  let dropped = 0;
  for (const row of due) {
    const result = await verifyProfileLink(row.userId, row.id).catch(() => null);
    if (!result) continue;
    checked++;
    if (result.outcome === 'no-match') dropped++;
  }
  return { checked, dropped };
}
