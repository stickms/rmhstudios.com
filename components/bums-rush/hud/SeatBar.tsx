'use client';

/**
 * Who is playing, and how close their grip is to tearing.
 *
 * Seat identity is **always** the mark plus the colour (§2.8) — `SeatMark` is
 * the load-bearing half of the colourblind-safe capability claim, so it never
 * appears without it and the colour never appears without it.
 *
 * The tension bars are written straight to the DOM from the loop's `update()`.
 * They move every frame; routing them through React state would reconcile this
 * whole subtree sixty times a second to change one `transform`.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeatIndex } from '@/lib/bums-rush/types';
import { SeatMark } from '../paper/InkControls';
import type { HudLiveFrame, LiveHandle } from './types';

export interface SeatBarEntry {
  seat: SeatIndex;
  name: string;
  /** Local seats get the tension read-out; remote ones only get identity. */
  local: boolean;
}

interface SeatBarProps {
  seats: readonly SeatBarEntry[];
}

export const SeatBar = forwardRef<LiveHandle, SeatBarProps>(function SeatBar({ seats }, ref) {
  const { t } = useTranslation('c-bums-rush');
  const rows = useRef(new Map<SeatIndex, HTMLLIElement>());
  const tensions = useRef(new Map<string, HTMLSpanElement>());

  useImperativeHandle(
    ref,
    (): LiveHandle => ({
      update(frame: HudLiveFrame) {
        for (const seat of frame.seats) {
          const row = rows.current.get(seat.seat);
          if (row) {
            const state = seat.state === 'alive' ? 'alive' : 'down';
            if (row.dataset.state !== state) row.dataset.state = state;
          }
          writeTension(tensions.current.get(`${seat.seat}l`), seat.tensionL, seat.gripL);
          writeTension(tensions.current.get(`${seat.seat}r`), seat.tensionR, seat.gripR);
        }
      },
    }),
    [],
  );

  if (seats.length === 0) return null;

  return (
    <ul
      className="pointer-events-none flex flex-wrap items-center gap-[clamp(0.25rem,1vmin,0.5rem)]"
      aria-label={t('hud.seats', { defaultValue: 'Players' })}
    >
      {seats.map((entry) => (
        <li
          key={entry.seat}
          data-state="alive"
          ref={(node) => {
            if (node) rows.current.set(entry.seat, node);
            else rows.current.delete(entry.seat);
          }}
          className="flex items-center gap-1.5 rounded-bum border border-bum-ink bg-bum-surface px-[clamp(0.3rem,1vmin,0.6rem)] py-[clamp(0.15rem,0.6vmin,0.35rem)] data-[state=down]:opacity-50"
          style={{ transition: 'opacity 160ms linear' }}
        >
          <SeatMark seat={entry.seat} className="size-[clamp(0.7rem,1.8vmin,1rem)] shrink-0" />
          <span
            className="max-w-[8ch] truncate font-medium text-bum-ink"
            style={{ fontSize: 'clamp(0.65rem, 1.5vmin, 0.85rem)' }}
          >
            {entry.name}
          </span>
          {entry.local ? (
            <span className="flex shrink-0 flex-col gap-[2px]" aria-hidden="true">
              <TensionBar
                onNode={(node) => {
                  if (node) tensions.current.set(`${entry.seat}l`, node);
                  else tensions.current.delete(`${entry.seat}l`);
                }}
              />
              <TensionBar
                onNode={(node) => {
                  if (node) tensions.current.set(`${entry.seat}r`, node);
                  else tensions.current.delete(`${entry.seat}r`);
                }}
              />
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
});

/**
 * A grip's load, as a bar that fills toward breaking.
 *
 * `scaleX` on a full-width fill rather than an animated `width`: a width change
 * is a layout change, and this one happens every frame on up to eight bars.
 */
function TensionBar({ onNode }: { onNode: (node: HTMLSpanElement | null) => void }) {
  return (
    <span className="block h-[3px] w-[clamp(1.25rem,3vmin,2rem)] overflow-hidden rounded-full bg-bum-paper-2">
      <span
        ref={onNode}
        className="block h-full w-full origin-left rounded-full bg-bum-graphite"
        style={{ transform: 'scaleX(0)' }}
      />
    </span>
  );
}

/**
 * The one DOM write per bar per frame — and only when the value actually moved,
 * because assigning an identical `transform` still invalidates style.
 */
function writeTension(node: HTMLSpanElement | undefined, tension: number, gripping: boolean): void {
  if (!node) return;
  const value = gripping ? Math.max(0, Math.min(1, tension)) : 0;
  const quantised = Math.round(value * 20) / 20;
  if (node.dataset.v === String(quantised)) return;
  node.dataset.v = String(quantised);
  node.style.transform = `scaleX(${quantised})`;
  // Past the warn ratio the stroke thins in the canvas too (§2.7); the bar
  // turning to the danger ink is that cue's visual twin for anyone who cannot
  // see the drawing well at speed.
  node.style.backgroundColor = quantised >= 0.7 ? 'var(--bum-danger)' : 'var(--bum-graphite)';
}
