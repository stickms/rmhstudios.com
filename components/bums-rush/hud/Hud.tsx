'use client';

/**
 * The chrome around a running level.
 *
 * Sits **outside** `.app-stage` (§5): in the letterbox, where it uses space the
 * playfield cannot. On an ultrawide that is 440px of paper either side; on a
 * 4:3 tablet it is a band top and bottom; on a 16:9 monitor there is no
 * letterbox at all and the HUD overlays the world, which is why every element
 * here is small, high-contrast and pinned to a corner.
 *
 * Three layout facts it has to survive:
 *
 * - **The top-left corner belongs to `GameBackLink`**, which the route pins to
 *   the window. Nothing here goes there.
 * - **The bottom corners belong to thumbs.** On touch those are the virtual
 *   sticks, so the seat bar and the clock live in a centred column at the top
 *   instead — which also happens to be the only region that is comfortable on
 *   every aspect ratio from 21:9 to 9:20.
 * - **`.app-hud` is already inset by the safe area.** Children use ordinary
 *   offsets and are measured from the first pixel the hardware does not cover.
 *
 * The clock is written directly to a text node from the loop; everything else
 * is ordinary React, because everything else changes a few times a minute.
 */

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause } from 'lucide-react';
import type { Assists, Level, SeatIndex } from '@/lib/bums-rush/types';
import { clockTick, formatClock } from '../format';
import { useNumberFormat } from '../hooks';
import { AssistChip } from './AssistChip';
import { ObjectiveTray } from './ObjectiveTray';
import { SeatBar, type SeatBarEntry } from './SeatBar';
import type { HudLiveFrame, LiveHandle } from './types';

interface HudProps {
  level: Level;
  seats: readonly SeatBarEntry[];
  localSeats: readonly SeatIndex[];
  assists: Assists;
  completedObjectives: readonly string[];
  objectivesOpen: boolean;
  onToggleObjectives: () => void;
  onPause: () => void;
  /** Announced politely to a screen reader — objectives, checkpoints, deaths. */
  announcement: string;
}

export const Hud = forwardRef<LiveHandle, HudProps>(function Hud(
  {
    level,
    seats,
    localSeats,
    assists,
    completedObjectives,
    objectivesOpen,
    onToggleObjectives,
    onPause,
    announcement,
  },
  ref,
) {
  const { t } = useTranslation('c-bums-rush');
  const nf = useNumberFormat();
  const clockNode = useRef<HTMLSpanElement | null>(null);
  const seatBar = useRef<LiveHandle | null>(null);
  const lastTick = useRef(-1);

  const zeroClock = useMemo(() => formatClock(0, nf), [nf]);

  useImperativeHandle(
    ref,
    (): LiveHandle => ({
      update(frame: HudLiveFrame) {
        // Only touch the DOM when the hundredths actually moved: at 60fps a new
        // centisecond arrives every 1.67 frames, so this skips ~40% of writes,
        // and `textContent` is the expensive half of painting a timer.
        const tick = clockTick(frame.elapsedMs);
        if (tick !== lastTick.current) {
          lastTick.current = tick;
          if (clockNode.current) clockNode.current.textContent = formatClock(frame.elapsedMs, nf);
        }
        seatBar.current?.update(frame);
      },
    }),
    [nf],
  );

  const primarySeat = localSeats[0] ?? 0;

  return (
    <div className="app-hud pointer-events-none z-20">
      {/* Top centre column: clock, then who is playing. Clear of the back link
          in the top-left and of the thumb zones at the bottom. */}
      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center gap-1"
        style={{ paddingTop: 'clamp(0.35rem, 1.5vmin, 0.75rem)' }}
      >
        <p
          className="rounded-bum border border-bum-ink bg-bum-surface px-2 py-0.5 font-semibold tabular-nums text-bum-ink"
          style={{ fontSize: 'clamp(0.8rem, 2.4vmin, 1.35rem)' }}
        >
          <span className="sr-only">{t('hud.time', { defaultValue: 'Time' })}: </span>
          <span ref={clockNode}>{zeroClock}</span>
        </p>
        <SeatBar ref={seatBar} seats={seats} />
        <AssistChip seat={primarySeat} assists={assists} showSeat={seats.length > 1} />
      </div>

      {/* Top right: the two controls that are not a verb. */}
      <div
        className="absolute top-0 right-0 flex items-start gap-2"
        style={{ paddingTop: 'clamp(0.35rem, 1.5vmin, 0.75rem)', paddingRight: 'clamp(0.35rem, 1.5vmin, 0.75rem)' }}
      >
        <ObjectiveTray
          objectives={level.objectives}
          completed={completedObjectives}
          open={objectivesOpen}
          onToggle={onToggleObjectives}
        />
        <button
          type="button"
          onClick={onPause}
          aria-label={t('hud.pause', { defaultValue: 'Pause' })}
          className="pointer-events-auto flex items-center justify-center rounded-full border-2 border-bum-ink bg-bum-surface text-bum-ink transition-colors hover:bg-bum-paper-2 active:bg-bum-highlight"
          style={{ width: 'clamp(2.25rem, 6vmin, 3rem)', height: 'clamp(2.25rem, 6vmin, 3rem)' }}
        >
          <Pause className="size-[clamp(0.9rem,2.5vmin,1.25rem)]" aria-hidden="true" />
        </button>
      </div>

      {/*
        The screen-reader mirror for everything that happens in the drawing.
        §13: in-world sticky notes and audio cues get a text twin here, because
        the canvas itself is not screen-reader playable and we do not pretend
        otherwise.
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
});
