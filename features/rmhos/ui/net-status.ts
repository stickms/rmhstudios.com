/**
 * The toolbar's network state, derived from the hub's `GET /rmhos-net/status` (v86 reports no
 * connection event). Pure: the hook feeds it one sample per poll.
 *  - `on` while the hub says this user's relay socket is connected;
 *  - `error` after 3 failed polls in a row, or `connected: false` for 30 s;
 *  - `error` at once, with `ended`, when the hub answers 401 (the ticket is gone for good);
 *  - `connecting` otherwise (before the first answer, or a short drop v86 reconnects from).
 */
export const FAILURES_TO_ERROR = 3;
export const DISCONNECTED_MS_TO_ERROR = 30_000;
export const POLL_MS = 15_000;

export interface NetTracker {
  failures: number;
  disconnectedSince: number | null;
}

export type NetSample = { at: number; result: { connected: boolean } | 'failed' | 'ended' };

export const initialTracker: NetTracker = { failures: 0, disconnectedSince: null };

export function trackNet(
  prev: NetTracker,
  sample: NetSample,
): { tracker: NetTracker; state: 'connecting' | 'on' | 'error'; ended: boolean } {
  // 401: the hub no longer knows this ticket (12 h cap, idle, evicted). Nothing will reconnect.
  if (sample.result === 'ended') return { tracker: prev, state: 'error', ended: true };
  if (sample.result === 'failed') {
    const failures = prev.failures + 1;
    return {
      tracker: { ...prev, failures },
      state: failures >= FAILURES_TO_ERROR ? 'error' : 'connecting',
      ended: false,
    };
  }
  if (sample.result.connected) {
    return { tracker: { failures: 0, disconnectedSince: null }, state: 'on', ended: false };
  }
  const since = prev.disconnectedSince ?? sample.at;
  return {
    tracker: { failures: 0, disconnectedSince: since },
    state: sample.at - since >= DISCONNECTED_MS_TO_ERROR ? 'error' : 'connecting',
    ended: false,
  };
}

/** `https://host/rmhos-net/status?ticket=…` from the relay's own URL. */
export function statusUrl(relayUrl: string, ticket: string): string {
  const u = new URL(relayUrl);
  u.protocol = u.protocol === 'wss:' || u.protocol === 'https:' ? 'https:' : 'http:';
  u.pathname = `${u.pathname.replace(/\/?$/, '/')}status`;
  u.search = '';
  u.searchParams.set('ticket', ticket);
  return u.toString();
}

/**
 * What a status reply means. `null` is "no information" and changes nothing: a 429 (the hub's
 * per-user limit) says nothing about the connection, so it must not count as a failed poll.
 */
export function statusSample(
  status: number,
  body: { connected?: unknown } | null,
): { connected: boolean } | 'failed' | 'ended' | null {
  if (status === 429) return null;
  if (status === 401) return 'ended';
  if (status >= 200 && status < 300) return { connected: body?.connected === true };
  return 'failed';
}

/** Lets a poll through at most once per `minGapMs` (the visibility-triggered ones). */
export function createPollGate(minGapMs: number) {
  let last = -Infinity;
  return (now: number): boolean => {
    if (now - last < minGapMs) return false;
    last = now;
    return true;
  };
}
