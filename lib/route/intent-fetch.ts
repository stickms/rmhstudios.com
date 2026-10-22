'use client';

/**
 * Start a page's own client-side GETs before the page mounts, and hand each
 * response to the page exactly once.
 *
 * Several pages fetch their main content from a mount effect rather than a
 * route loader (a post's body and comments, a profile's posts). Opened by a
 * click, that is two round trips in series: the route's loader and chunk, then
 * — once the page has mounted and painted its spinner — the content request.
 * Starting the content request when the open begins (a route's `beforeLoad`, or
 * the press that will become the click) overlaps the two, and when the response
 * is already back the page renders it in its first commit.
 *
 * The responses are per-viewer (a post's liked state and visibility, a
 * profile's posts as this viewer may see them), so the rules are all about never
 * showing one that a later action made stale:
 * - Client-only, in-memory, per tab. Nothing is shared between users or written
 *   to any HTTP cache.
 * - **Taken once.** The page that consumes an entry deletes it, so any later
 *   mount (a back navigation, a remount) fetches fresh.
 * - **Started only when the open is already happening** — a navigation, or a
 *   press on the thing being opened — never on hover, focus or a speculative
 *   preload. A hover can be followed by a like and then the open, all within a
 *   second; a press cannot, so nothing the reader does can land between the
 *   request and its use.
 * - **Short-lived once answered.** In flight, an entry stands in for as long as
 *   it takes (a slow network is when it helps most). Once answered, it is good
 *   for {@link FRESH_MS}: enough for the page that started it to mount, too
 *   short to survive a long-press reaction (press, menu, pick) and then an open.
 *
 * Measured effect: docs/performance-audit-2026-10-21.md §Instant navigation.
 */

/** How long an answered request may stand in for a fresh one. */
const FRESH_MS = 1_000;

/** Upper bound on an unanswered one, so a hung request is not waited on forever by a later open. */
const IN_FLIGHT_MAX_MS = 15_000;

/** A response as the page consumes it: the status, and the parsed JSON body (null on 404/204). */
export interface IntentResult {
  status: number;
  data: unknown;
}

interface Entry {
  at: number;
  promise: Promise<IntentResult>;
  settled?: IntentResult;
  settledAt?: number;
}

const entries = new Map<string, Entry>();

/** The GET itself — also what a page calls when nothing was started for it. */
export function fetchIntent(url: string): Promise<IntentResult> {
  return fetch(url).then(async (res) => ({
    status: res.status,
    data: res.status === 404 || res.status === 204 ? null : await res.json(),
  }));
}

function fresh(url: string): Entry | null {
  const entry = entries.get(url);
  if (!entry) return null;
  const now = Date.now();
  const usable =
    entry.settledAt !== undefined
      ? now - entry.settledAt < FRESH_MS
      : now - entry.at < IN_FLIGHT_MAX_MS;
  if (!usable) {
    entries.delete(url);
    return null;
  }
  return entry;
}

/** Start (or keep) a GET for `url`. Idempotent while usable; a no-op on the server. */
export function startIntentFetch(url: string): void {
  if (typeof window === 'undefined') return;
  if (fresh(url)) return;
  const entry: Entry = { at: Date.now(), promise: fetchIntent(url) };
  entry.promise.then(
    (result) => {
      entry.settled = result;
      entry.settledAt = Date.now();
    },
    // A failed head start must not surface as an unhandled rejection; the page
    // that takes it handles the failure exactly as it handles its own fetch.
    () => {},
  );
  entries.set(url, entry);
}

/**
 * The response, if it has already arrived — for a component's initial state, so
 * content that landed before the page mounted is in the page's first commit.
 * Does not consume the entry (a render can run more than once).
 */
export function peekIntentFetch(url: string): IntentResult | undefined {
  return fresh(url)?.settled;
}

/** Hand out the started request once, or `null` if none is usable. */
export function takeIntentFetch(url: string): Promise<IntentResult> | null {
  const entry = fresh(url);
  if (!entry) return null;
  entries.delete(url);
  return entry.promise;
}

/** {@link takeIntentFetch}, falling back to a fresh request. */
export function takeOrFetch(url: string): Promise<IntentResult> {
  return takeIntentFetch(url) ?? fetchIntent(url);
}
