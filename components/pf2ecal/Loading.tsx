'use client';

/**
 * Loading states for `/pf2ecal`.
 *
 * The principle here is **layout first, content second**. Every skeleton below
 * is the real component's box model with the text swapped for blocks — same
 * card padding, same grid columns, same seven-column month, same heading
 * heights. So the page paints its full structure on the first frame and the
 * content fills into a layout that never moves. A centred spinner would paint
 * nothing, then reflow the entire page the moment data landed; a skeleton that
 * is *approximately* the right shape does the same thing more subtly, which is
 * worse because nobody notices it in review.
 *
 * On top of that, anything that can take more than a moment says what it is
 * doing and keeps saying it. `useProgressiveStatus` walks a list of messages on
 * a timer, so a slow connection gets "Still loading — this is taking longer than
 * usual" instead of an indefinite shimmer that is indistinguishable from a page
 * that has silently broken. The first message is deliberately delayed: on a fast
 * connection nothing ever appears, because a status line that flashes for 80ms
 * is noise.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EASE } from './motion';

export interface ProgressiveStep {
  /** Milliseconds after start at which this message takes over. */
  after: number;
  /** The already-translated sentence to show from `after` onwards. */
  message: string;
}

/**
 * The message that applies right now, or null while nothing is slow enough to
 * be worth saying.
 *
 * `active` gates the timers rather than the render, so the sequence restarts
 * cleanly on the next load instead of resuming halfway through the last one.
 */
export function useProgressiveStatus(active: boolean, steps: ProgressiveStep[]): string | null {
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (!active) {
      setIndex(-1);
      return;
    }
    const timers = steps.map((step, i) => window.setTimeout(() => setIndex(i), step.after));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
    // The timings are fixed per call site; depending on `steps` would re-run the
    // effect on every render (the array is rebuilt each time now that its
    // strings are translated) and reset the sequence forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return index >= 0 ? (steps[index]?.message ?? null) : null;
}

/**
 * The board's escalation. Nothing shows for the first second, so a fast
 * connection never sees the line flash.
 *
 * A hook rather than a module constant because every key has to be a LITERAL
 * `t()` call: `i18next-parser` reads source, not runtime, so `t(step.key)` over
 * a table of keys extracts nothing and the strings never reach `locales/` —
 * they would work in English forever and in no other language, with nothing
 * failing to say so.
 */
export function useBoardStatus(active: boolean): string | null {
  const { t } = useTranslation('r-pf2ecal');
  const steps: ProgressiveStep[] = [
    { after: 900, message: t('loading-schedule', { defaultValue: 'Loading the schedule…' }) },
    {
      after: 4000,
      message: t('loading-slow', { defaultValue: 'Still loading — the connection looks slow.' }),
    },
    {
      after: 10_000,
      message: t('loading-very-slow', {
        defaultValue: 'Taking longer than usual. The page will fill in as soon as it lands.',
      }),
    },
  ];
  return useProgressiveStatus(active, steps);
}

/** The assistant's. DeepSeek round-trips are seconds, so this starts sooner. */
export function useAssistantStatus(active: boolean): string | null {
  const { t } = useTranslation('r-pf2ecal');
  const steps: ProgressiveStep[] = [
    { after: 600, message: t('thinking-reading', { defaultValue: 'Reading the board…' }) },
    { after: 3500, message: t('thinking-still', { defaultValue: 'Still thinking…' }) },
    {
      after: 9000,
      message: t('thinking-long', {
        defaultValue: 'Nearly there — long answers take a moment.',
      }),
    },
  ];
  return useProgressiveStatus(active, steps);
}

/** A polite, announced status line. Renders nothing until there is something to say. */
export function StatusLine({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {message && (
          <motion.p
            key={message}
            className="pf2e-caption"
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ duration: 0.18, ease: EASE }}
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeletons — each mirrors its real component's box model exactly             */
/* -------------------------------------------------------------------------- */

/** Matches `SessionCard`: same padding, same vertical rhythm. */
export function SessionCardSkeleton() {
  return (
    <div className="pf2e-card p-4 sm:p-5" aria-hidden>
      <div className="pf2e-skeleton mb-2 h-3 w-32" />
      <div className="pf2e-skeleton mb-2 h-6 w-2/3" />
      <div className="pf2e-skeleton mb-2 h-5 w-48" />
      <div className="pf2e-skeleton mb-4 h-4 w-40" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <div className="pf2e-skeleton h-[2.125rem] w-16 rounded-full" />
          <div className="pf2e-skeleton h-[2.125rem] w-20 rounded-full" />
          <div className="pf2e-skeleton h-[2.125rem] w-16 rounded-full" />
        </div>
        <div className="pf2e-skeleton h-[1.9375rem] w-24 rounded-full" />
      </div>
    </div>
  );
}

/** Matches `MonthGrid`: the real 7×6 grid, so the aside never resizes. */
export function MonthGridSkeleton() {
  return (
    <section className="pf2e-card p-4" aria-hidden>
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="pf2e-skeleton h-6 w-32" />
        <div className="flex items-center gap-1">
          <div className="pf2e-skeleton h-[1.9375rem] w-16 rounded-full" />
          <div className="pf2e-skeleton h-9 w-9 rounded-full" />
          <div className="pf2e-skeleton h-9 w-9 rounded-full" />
        </div>
      </header>
      <div className="pf2e-month mb-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex justify-center py-1">
            <div className="pf2e-skeleton h-3 w-4" />
          </div>
        ))}
      </div>
      <div className="pf2e-month">
        {Array.from({ length: 42 }, (_, i) => (
          <div key={i} className="pf2e-daycell">
            <div className="pf2e-skeleton h-7 w-7 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A generic panel skeleton for the announcements and subscribe cards. */
export function PanelSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <section className="pf2e-card p-4" aria-hidden>
      <div className="pf2e-skeleton mb-3 h-6 w-40" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="pf2e-card-flat p-3">
            <div className="pf2e-skeleton mb-2 h-4 w-full" />
            <div className="pf2e-skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The whole board, in skeleton.
 *
 * This is what the route's `pendingComponent` renders, so a navigation into
 * `/pf2ecal` paints the real page geometry — header, two columns, agenda, month
 * grid, panels — before a single byte of data exists. When the loader resolves,
 * the only thing that changes is the text inside the boxes.
 */
export function BoardSkeleton({ status }: { status?: string | null }) {
  return (
    <div className="pf2e">
      <div className="pf2e-shell pt-8 sm:pt-12">
        <header className="mb-6 sm:mb-8">
          <div className="pf2e-skeleton mb-2 h-3 w-28" />
          <div className="pf2e-skeleton mb-3 h-11 w-[min(22rem,80%)]" />
          <div className="pf2e-skeleton mb-1 h-4 w-[min(34rem,95%)]" />
          <div className="pf2e-skeleton h-4 w-40" />
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="pf2e-skeleton h-[2.375rem] w-36 rounded-full" />
            <div className="pf2e-skeleton h-[2.375rem] w-28 rounded-full" />
          </div>
          <div className="mt-4">
            <StatusLine message={status ?? null} />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="flex flex-col gap-6">
            <section>
              <div className="pf2e-skeleton mb-3 h-3 w-20" />
              <div className="flex flex-col gap-3">
                <SessionCardSkeleton />
                <SessionCardSkeleton />
                <SessionCardSkeleton />
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <MonthGridSkeleton />
            <PanelSkeleton rows={2} />
            <PanelSkeleton rows={1} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The route-level pending shell.
 *
 * Separate from `BoardSkeleton` only so it can own the progressive status —
 * `pendingComponent` mounts on navigation and unmounts when the loader
 * resolves, which is exactly the lifetime the escalation should track.
 */
export function BoardPending() {
  const status = useBoardStatus(true);
  return <BoardSkeleton status={status} />;
}
