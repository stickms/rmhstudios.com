/**
 * Warming the browser's HTTP cache for model and animation files the player is likely to ask for next
 * (an item under the pointer, another class's body), so equipping or switching is instant, without
 * downloading anything the person does not look like they will use.
 *
 * Manners: nothing runs on a metered or slow connection (`saveData`, 2g), only one or two requests at a
 * time at low priority, never while the tab is hidden, a URL is asked for at most once per page load, and
 * the queue is short (a newer intent replaces the oldest unstarted one). The files are the ones the viewer
 * requests anyway, at the same URLs, so a prefetched file is never a second copy.
 */
'use client';

const MAX_PARALLEL = 2;
const MAX_QUEUED = 6;

const seen = new Set<string>();
const queue: string[] = [];
let running = 0;

interface Connection {
  saveData?: boolean;
  effectiveType?: string;
}

/** False on a connection where speculative downloads would cost the person something. */
export function mayPrefetch(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (document.visibilityState === 'hidden') return false;
  const c = (navigator as Navigator & { connection?: Connection }).connection;
  return !(c?.saveData || (c?.effectiveType && /^(slow-)?2g$/.test(c.effectiveType)));
}

function pump(): void {
  while (running < MAX_PARALLEL && queue.length) {
    const url = queue.shift()!;
    running++;
    fetch(url, { priority: 'low' } as RequestInit)
      // The body is read and dropped: the HTTP cache keeps the response, and nothing here holds it.
      .then((res) => (res.ok ? res.arrayBuffer() : undefined))
      .catch(() => {
        // Not fetched: a later real request simply loads it normally.
        seen.delete(url);
      })
      .finally(() => {
        running--;
        pump();
      });
  }
}

/** Ask for `urls` to be fetched in the background, if the connection allows and they have not been already. */
export function prefetch(...urls: string[]): void {
  if (!mayPrefetch()) return;
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    queue.push(url);
  }
  // A new intent matters more than an old, unstarted one.
  while (queue.length > MAX_QUEUED) seen.delete(queue.shift()!);
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (idle) idle(pump);
  else setTimeout(pump, 50);
}

/** For tests. */
export function resetPrefetch(): void {
  seen.clear();
  queue.length = 0;
  running = 0;
}
