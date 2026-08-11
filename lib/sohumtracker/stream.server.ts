/**
 * The live seam behind `/sohumtracker`: one watcher, many viewers.
 *
 * # Why this polls at all
 *
 * The writer is a **different process in a different language** — the Go
 * `discord-bot` worker. There is no in-process event for the web tier to
 * subscribe to, so something has to notice that the database changed. What this
 * module does is make that noticing happen ONCE per web process instead of once
 * per open tab: a single interval reads the state, hashes the parts that move,
 * and pushes to every subscriber only when the hash differs.
 *
 * Ten people watching him sit in a voice channel is one query every few seconds,
 * not ten. That is the whole point of the refcount below — and the reason the
 * interval is torn down when the last subscriber leaves rather than running for
 * the life of the process.
 *
 * # Why the tick is small
 *
 * `getWatchState` is ~100 KB (120 days × 30 figures). Pushing that every few
 * seconds to every viewer would be worse than the polling it replaces. Only the
 * parts that actually move between ticks are sent — the live block, today's row,
 * the totals, and the period summaries — and the client splices them into the
 * state it was server-rendered with. A full refetch is what the refresh button
 * and a reconnect are for.
 */

import { createHash } from 'node:crypto';
import { getWatchState } from './activity.server';
import { DEFAULT_HISTORY_DAYS } from './config';
import type { WatchTickDTO } from './types';

/** How often the shared watcher re-reads the database. */
const POLL_MS = 4_000;

type Subscriber = (tick: WatchTickDTO) => void;

const subscribers = new Set<Subscriber>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastHash = '';
/** The most recent tick, so a new subscriber gets state immediately. */
let lastTick: WatchTickDTO | null = null;

/**
 * Digest of everything the tick carries.
 *
 * Hashing the serialised tick rather than picking fields by hand: the point is
 * "did anything a viewer can see change", and a field added to the DTO later
 * should start being noticed without anyone remembering to add it here.
 */
function hashTick(tick: WatchTickDTO): string {
  // `generatedAt` is excluded — it changes on every single read by definition,
  // so including it would make every poll look like a change and defeat the
  // whole mechanism.
  const { generatedAt: _ignored, ...rest } = tick;
  return createHash('sha1').update(JSON.stringify(rest)).digest('hex');
}

/** Read the current state and reduce it to the compact tick. */
async function readTick(): Promise<WatchTickDTO> {
  const state = await getWatchState({ days: DEFAULT_HISTORY_DAYS });
  const today =
    state.days.find((day) => day.dateKey === state.todayKey) ?? state.days[state.days.length - 1];
  return {
    generatedAt: state.generatedAt,
    todayKey: state.todayKey,
    live: state.live,
    today: today ?? null,
    totals: state.totals,
    weeks: state.weeks,
    months: state.months,
  };
}

async function poll(): Promise<void> {
  let tick: WatchTickDTO;
  try {
    tick = await readTick();
  } catch {
    // A failed read is not an event. Subscribers keep the last good tick and the
    // next interval tries again — a stream that pushed an error would make every
    // open page flicker on one slow query.
    return;
  }
  lastTick = tick;
  const hash = hashTick(tick);
  if (hash === lastHash) return;
  lastHash = hash;
  for (const notify of subscribers) {
    try {
      notify(tick);
    } catch {
      // One broken subscriber must not stop the others being told.
    }
  }
}

/**
 * Subscribe to state changes. Returns the unsubscribe function.
 *
 * The FIRST subscriber starts the interval and the LAST one stops it, so an
 * idle process does no work. Getting that wrong is how a "cheap" background
 * poller ends up querying forever on a box nobody is looking at.
 */
export function subscribeToWatchState(onTick: Subscriber): () => void {
  subscribers.add(onTick);
  if (timer === null) {
    // `unref` so this interval can never be the reason the process refuses to
    // exit on shutdown.
    timer = setInterval(() => void poll(), POLL_MS);
    timer.unref?.();
    // Prime immediately rather than waiting a full interval for the first read.
    void poll();
  }
  return () => {
    subscribers.delete(onTick);
    if (subscribers.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      // Forget the hash too: the next subscriber must get a tick rather than be
      // told "nothing changed" against a comparison from an hour ago.
      lastHash = '';
    }
  };
}

/** The last tick read, if the watcher has one in hand. */
export function currentTick(): WatchTickDTO | null {
  return lastTick;
}

/** Read a tick on demand, for the stream's very first message. */
export async function readCurrentTick(): Promise<WatchTickDTO> {
  return readTick();
}
