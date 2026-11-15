/**
 * The toolbar's network state, derived from the hub's `GET /rmhos-net/status` (v86 reports no
 * connection event). Pure: the hook feeds it one sample per poll.
 *  - `on` while the hub says this user's relay socket is connected;
 *  - `error` after 3 failed polls in a row, or `connected: false` for 30 s;
 *  - `connecting` otherwise (before the first answer, or a short drop v86 reconnects from).
 */
export const FAILURES_TO_ERROR = 3;
export const DISCONNECTED_MS_TO_ERROR = 30_000;
export const POLL_MS = 15_000;

export interface NetTracker {
  failures: number;
  disconnectedSince: number | null;
}

export type NetSample = { at: number; result: { connected: boolean } | 'failed' };

export const initialTracker: NetTracker = { failures: 0, disconnectedSince: null };

export function trackNet(
  prev: NetTracker,
  sample: NetSample,
): { tracker: NetTracker; state: 'connecting' | 'on' | 'error' } {
  if (sample.result === 'failed') {
    const failures = prev.failures + 1;
    return {
      tracker: { ...prev, failures },
      state: failures >= FAILURES_TO_ERROR ? 'error' : 'connecting',
    };
  }
  if (sample.result.connected) {
    return { tracker: { failures: 0, disconnectedSince: null }, state: 'on' };
  }
  const since = prev.disconnectedSince ?? sample.at;
  return {
    tracker: { failures: 0, disconnectedSince: since },
    state: sample.at - since >= DISCONNECTED_MS_TO_ERROR ? 'error' : 'connecting',
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
