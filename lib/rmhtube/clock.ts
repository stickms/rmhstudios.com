/**
 * RmhTube — Client Clock Synchronization (NTP-lite)
 *
 * Consumer device clocks routinely differ from the server clock by seconds.
 * All sync timeline math is done in *server time*, so the client must learn the
 * offset between its own `Date.now()` and the server's.
 *
 * For each ping/pong round trip:
 *     rtt    = nowLocal - clientTime
 *     offset = serverTime + rtt/2 - nowLocal      // add to local → server time
 *
 * We keep the offset from the lowest-RTT sample in a burst (least
 * jitter-contaminated), which is the standard NTP best-sample heuristic.
 *
 * This is intentionally a tiny stateful module rather than store state: it is
 * high-frequency, purely about timing, and must not trigger React re-renders.
 */

let offsetMs = 0;
let hasSynced = false;
let bestRtt = Infinity;

/** Server-clock "now" in ms, as best the client can estimate it. */
export function getServerNow(): number {
  return Date.now() + offsetMs;
}

/** Current estimated offset (serverTime - localTime), in ms. */
export function getClockOffset(): number {
  return offsetMs;
}

export function hasClockSync(): boolean {
  return hasSynced;
}

/**
 * Record a pong. `clientTime` is what we sent; `serverTime` is the server's
 * clock at reply. Lower-RTT samples overwrite higher-RTT ones.
 */
export function recordPong(clientTime: number, serverTime: number): void {
  const nowLocal = Date.now();
  const rtt = nowLocal - clientTime;
  if (rtt < 0) return; // clock went backwards mid-flight; ignore
  if (rtt <= bestRtt) {
    bestRtt = rtt;
    offsetMs = serverTime + rtt / 2 - nowLocal;
    hasSynced = true;
  }
}

/**
 * Begin a fresh measurement burst. Resets the best-RTT tracker so a new burst
 * can settle on the current network conditions (e.g. after a tab-return).
 */
export function beginClockSyncBurst(): void {
  bestRtt = Infinity;
}

/** Reset everything (on disconnect). */
export function resetClock(): void {
  offsetMs = 0;
  hasSynced = false;
  bestRtt = Infinity;
}
