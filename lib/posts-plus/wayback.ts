/**
 * X11 - pure helpers for the dead-link rescue job (no network, no Prisma), split
 * out so the rules that decide "is this link gone" and "is this a usable
 * snapshot" can be unit-tested.
 */

export type LinkVerdict = 'ok' | 'gone' | 'unknown';

/**
 * What a final HTTP status says about a link.
 *
 * Only 404 and 410 mean the page is gone. Everything else that is not a success
 * (401/403 walls, 429 throttling, 5xx outages, 405/501 method refusals) says
 * nothing about whether the page still exists, so it must never count toward
 * "dead" - rescuing a link that is merely behind a login would swap a working
 * card for a stale copy.
 */
export function classifyStatus(status: number): LinkVerdict {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 404 || status === 410) return 'gone';
  return 'unknown';
}

export interface WaybackSnapshot {
  /** https URL on archive.org. */
  url: string;
  /** 14-digit YYYYMMDDhhmmss. */
  timestamp: string;
}

/**
 * Pick a usable snapshot out of the `archive.org/wayback/available` response.
 * Requires an available, HTTP-200 capture on an archive.org host; anything else
 * (including a malformed body) is "no snapshot".
 */
export function parseWaybackResponse(json: unknown): WaybackSnapshot | null {
  const closest = (json as { archived_snapshots?: { closest?: unknown } } | null)
    ?.archived_snapshots?.closest as
    { available?: unknown; status?: unknown; url?: unknown; timestamp?: unknown } | undefined;
  if (!closest || closest.available !== true) return null;
  if (String(closest.status) !== '200') return null;
  if (typeof closest.url !== 'string' || typeof closest.timestamp !== 'string') return null;
  if (!/^\d{14}$/.test(closest.timestamp)) return null;
  let parsed: URL;
  try {
    parsed = new URL(closest.url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'archive.org' && !host.endsWith('.archive.org')) return null;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  parsed.protocol = 'https:';
  return { url: parsed.toString(), timestamp: closest.timestamp };
}

/** "20200131093000" -> ISO date string, for the "Archived copy" label. */
export function waybackTimestampToIso(ts: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Consecutive 404/410 checks before a link is considered dead. */
export const DEAD_AFTER_FAILS = 2;
