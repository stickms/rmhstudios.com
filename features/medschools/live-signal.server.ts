/**
 * The "medschools new events" signal (owner 2026-11-24): when the medschools worker commits NEW public events (Admit
 * or SDN, the live feed's sources; never RMH), it publishes a bare signal on the cross-process realtime bus, and the
 * live stream (`app/routes/api/medschools/live/stream.ts`) tells every open `/med` tab to refetch its public queries.
 *
 * The signal carries nothing but the time it was sent: no school, no event, no user. What changed is read through
 * the public endpoints, so the stream can never leak more than an anonymous `GET` would.
 *
 * Channel: `rt:medschools:live` (`createBus('medschools')`, key `live`). Redis carries it between the worker and the
 * web processes; without Redis (dev, tests) the bus is in-process only, so a signal from the worker reaches no stream
 * and the pages keep their polling. Publishing never throws: a signal is a hint, and an ingest must not fail over it.
 */
import { createBus, type RealtimeBus } from '@/lib/realtime-bus.server';

export const LIVE_SIGNAL_NAMESPACE = 'medschools';
export const LIVE_SIGNAL_KEY = 'live';

export interface LiveSignal {
  /** ISO time the signal was sent. */
  at: string;
}

/** At most one signal per this window per process; a burst inside it is sent once, at its end. */
export const LIVE_SIGNAL_COALESCE_MS = 5_000;

/**
 * Only events this recent can change what the pages show at their head (the live feed is newest first, the Today
 * column is the last 24 hours, the index shows each school's newest status), so an older backfilled event sends no
 * signal: a months-long history walk would otherwise make every open tab refetch every few seconds for hours. A
 * day-only report is stored at 00:00 UTC, which a week's window keeps; the 60 s polling covers anything else.
 */
export const LIVE_SIGNAL_RECENT_MS = 7 * 86_400_000;

export interface LiveSignalPublisher {
  /** Call after a commit that created events; `newest` is the latest `occurredAt` among them (null: none created). */
  notify(newest: Date | null | undefined): void;
  /** Drops a pending trailing signal (tests, shutdown). */
  dispose(): void;
}

export function createLiveSignalPublisher(
  getBus: () => Pick<RealtimeBus<LiveSignal>, 'publish'> | null,
  opts: { now?: () => number; windowMs?: number; recentMs?: number } = {},
): LiveSignalPublisher {
  const now = opts.now ?? Date.now;
  const windowMs = opts.windowMs ?? LIVE_SIGNAL_COALESCE_MS;
  const recentMs = opts.recentMs ?? LIVE_SIGNAL_RECENT_MS;
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = () => {
    last = now();
    try {
      getBus()?.publish(LIVE_SIGNAL_KEY, { at: new Date(last).toISOString() });
    } catch {
      // A transport failure is not the ingest's problem; the pages' polling catches up.
    }
  };

  return {
    notify(newest) {
      try {
        if (!newest || !(newest.getTime() >= now() - recentMs)) return;
        if (timer) return; // a trailing signal is already due and will cover this commit
        const wait = last + windowMs - now();
        if (wait <= 0) {
          send();
          return;
        }
        timer = setTimeout(() => {
          timer = null;
          send();
        }, wait);
        timer.unref?.();
      } catch {
        // Never fail an ingest over a hint.
      }
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

let bus: RealtimeBus<LiveSignal> | null = null;

/** The bus, created on first use (importing this module opens no connection). */
export function liveSignalBus(): RealtimeBus<LiveSignal> {
  bus ??= createBus<LiveSignal>(LIVE_SIGNAL_NAMESPACE);
  return bus;
}

/** Subscribe to the signal (the stream route). Returns the unsubscribe. */
export function subscribeLiveSignal(listener: (signal: LiveSignal) => void): () => void {
  return liveSignalBus().subscribe(LIVE_SIGNAL_KEY, listener);
}

const publisher = createLiveSignalPublisher(() => {
  try {
    return liveSignalBus();
  } catch {
    return null;
  }
});

/** The worker's call after a commit of new Admit or SDN events (never RMH). Never throws. */
export function signalNewLiveEvents(newest: Date | null | undefined): void {
  publisher.notify(newest);
}

/** The latest of some dates, or null for none (what `signalNewLiveEvents` takes). */
export function newestOf(dates: Iterable<Date | null | undefined>): Date | null {
  let out: Date | null = null;
  for (const d of dates) if (d && (!out || d.getTime() > out.getTime())) out = d;
  return out;
}
