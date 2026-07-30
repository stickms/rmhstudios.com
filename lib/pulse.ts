'use client';

/**
 * The client half of `POST /api/pulse` — one shared timer for everything a
 * signed-in tab needs to keep fresh in the background.
 *
 * Before this, four independent module singletons each ran their own interval
 * against their own endpoint (presence heartbeat, notification badge, the
 * friends-online widget, the friends rail). Each was individually well behaved —
 * ref-counted, idle-deferred, visibility-aware — but they never knew about each
 * other, so an idle tab still made ~4 authenticated requests a minute and the
 * server resolved the session ~4 times to answer them.
 *
 * This module owns the single interval. Consumers subscribe to the *sections*
 * they need; the request asks for the union of the currently-subscribed sections,
 * so a section with no live consumer costs nothing on either side. The heartbeat
 * is implicit — every pulse marks presence — so simply having any subscriber
 * keeps the user "online now".
 *
 * Shape deliberately mirrors the hooks it replaced: values are cached at module
 * scope and replayed to new subscribers immediately, so a component that mounts
 * between pulses renders the last known value instead of a spinner.
 */

export type PulseSection = 'notifications' | 'friends' | 'activeFriends';

export interface PulseData {
  notifications: number;
  friends: unknown[] | null;
  activeFriends: unknown[] | null;
}

/** One tick a minute; the old timers were 45–60s and this replaces all of them. */
const PULSE_INTERVAL_MS = 60_000;

type Listener = (data: PulseData) => void;

const data: PulseData = { notifications: 0, friends: null, activeFriends: null };

/** section → number of live consumers. A section is requested while count > 0. */
const demand = new Map<PulseSection, number>();
const listeners = new Set<Listener>();

let timer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;
let inFlight: Promise<void> | null = null;
/** The section set the in-flight request was built with (see requestPulse). */
let inFlightWant: PulseSection[] = [];
let controller: AbortController | null = null;
/** Bumped on teardown so a response that raced it cannot repopulate the cache. */
let generation = 0;

function broadcast() {
  for (const l of listeners) l(data);
}

function wanted(): PulseSection[] {
  return [...demand.entries()].filter(([, n]) => n > 0).map(([s]) => s);
}

/**
 * Fetch one pulse. Concurrent callers (interval + focus + an explicit refresh can
 * all land together) share the single in-flight request.
 */
export function requestPulse(): Promise<void> {
  if (inFlight) {
    // The in-flight request asked for whatever was demanded when it was built. If
    // a consumer has mounted since and added a section, that section is NOT in it
    // — sharing it would make the new consumer wait a full interval for its first
    // value. Chain a follow-up instead. The follow-up asks for the complete
    // current set, so this settles after one extra round trip.
    const covered = wanted().every((s) => inFlightWant.includes(s));
    if (covered) return inFlight;
    return inFlight.then(() => requestPulse());
  }

  const requestGeneration = generation;
  inFlightWant = wanted();
  const ac = new AbortController();
  controller = ac;

  // Start in a microtask so `inFlight` owns the request before any mocked or
  // platform fetch implementation can throw synchronously.
  const run = Promise.resolve()
    .then(async () => {
      const res = await fetch('/api/pulse', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ want: wanted() }),
        signal: ac.signal,
      });
      if (!res.ok) return;
      const body = (await res.json()) as Partial<PulseData> & { ok?: boolean };
      // Ignore a response that raced teardown, so one user's values can never
      // repopulate the cache after the last subscriber left (and, on a shared
      // device, after a sign-out).
      if (requestGeneration !== generation) return;

      // Absent sections keep their previous value — a section the server skipped
      // or failed is not the same as "it is now empty".
      let changed = false;
      if (typeof body.notifications === 'number' && body.notifications !== data.notifications) {
        data.notifications = body.notifications;
        changed = true;
      }
      if (Array.isArray(body.friends)) {
        data.friends = body.friends;
        changed = true;
      }
      if (Array.isArray(body.activeFriends)) {
        data.activeFriends = body.activeFriends;
        changed = true;
      }
      if (changed) broadcast();
    })
    .catch(() => {
      // Network hiccup or teardown abort — keep the last known values.
    })
    .finally(() => {
      // A stopped transport may already have started a newer request; only the
      // request that still owns these slots may clear them.
      if (controller === ac) {
        controller = null;
        inFlight = null;
      }
    });

  inFlight = run;
  return run;
}

function onVisible() {
  if (document.visibilityState === 'visible') void requestPulse();
}

function onFocus() {
  void requestPulse();
}

function start() {
  if (timer) return;
  void requestPulse();
  // A hidden tab does not tick — it has nothing to display and its user is not
  // "online now" in any meaningful sense (the heartbeat this carries deliberately
  // behaved the same way). Returning to the tab fires `visibilitychange`, which
  // pulses immediately, so the first visible frame is already fresh.
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void requestPulse();
  }, PULSE_INTERVAL_MS);
  if (!listenersBound) {
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    listenersBound = true;
  }
}

function stop() {
  generation++;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  controller?.abort();
  controller = null;
  inFlight = null;
  inFlightWant = [];
  if (listenersBound) {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onFocus);
    listenersBound = false;
  }
  data.notifications = 0;
  data.friends = null;
  data.activeFriends = null;
}

/**
 * Register interest in `sections` and get notified on every pulse. Returns the
 * unsubscribe function; the shared timer starts with the first subscriber and
 * stops with the last.
 *
 * Pass `[]` to keep the pulse (and therefore the presence heartbeat) running
 * without needing any of its payload.
 */
export function subscribePulse(sections: PulseSection[], listener: Listener): () => void {
  for (const s of sections) demand.set(s, (demand.get(s) ?? 0) + 1);
  listeners.add(listener);

  // A newly-mounted consumer may have arrived after this section's first fetch,
  // or may have just added a section nobody was asking for. Re-pulse when the
  // requested set grew; otherwise replay what we already have.
  const isFirst = listeners.size === 1;
  if (isFirst) {
    start();
  } else if (sections.some((s) => demand.get(s) === 1)) {
    void requestPulse();
  } else {
    listener(data);
  }

  return () => {
    for (const s of sections) {
      const n = (demand.get(s) ?? 1) - 1;
      if (n <= 0) demand.delete(s);
      else demand.set(s, n);
    }
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/** Current cached values — for a consumer's initial render before the first pulse. */
export function pulseSnapshot(): PulseData {
  return data;
}

/**
 * Overwrite the cached notification count and fan it out. The badge is updated
 * optimistically when the user reads their notifications, so it must not wait a
 * full interval to reflect an action the user just took.
 */
export function setPulseNotifications(n: number) {
  if (data.notifications === n) return;
  data.notifications = n;
  broadcast();
}
