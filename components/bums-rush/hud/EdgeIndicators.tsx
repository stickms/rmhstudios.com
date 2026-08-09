'use client';

/**
 * Arrows for the players the camera could not fit.
 *
 * §5: the camera stops zooming out at 0.55× and shows edge indicators instead,
 * because a player who is invisible with no cue is a player who has no idea
 * whether they are about to be flung. Each arrow is that seat's colour AND its
 * mark AND a distance, so it carries identity without relying on colour alone.
 *
 * This lives **inside** `.app-stage`, unlike the rest of the HUD: it tracks
 * world positions, and the stage's box is the playfield's box. Percentages of
 * the stage are therefore world-accurate at every aspect ratio with no
 * measurement — which is the whole reason the playfield is a stage rather than
 * a full-bleed canvas the HUD has to chase.
 *
 * Four arrows exist from mount and are moved, never created: a pooled node that
 * is hidden costs nothing, and allocating DOM inside a rAF loop is how a swing
 * turns into a stutter.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SEAT_INDICES } from '@/lib/bums-rush/types';
import type { SeatIndex } from '@/lib/bums-rush/types';
import { cn } from '@/lib/utils';
import { SeatMark } from '../paper/InkControls';
import { edgeDistanceMetres, edgeIndicatorPlacement } from './geometry';
import type { HudLiveFrame, LiveHandle } from './types';

interface EdgeIndicatorsProps {
  /** Optional extra classes on the overlay; the layer itself is always inset-0. */
  className?: string;
}

export const EdgeIndicators = forwardRef<LiveHandle, EdgeIndicatorsProps>(
  function EdgeIndicators({ className }, ref) {
    const { t } = useTranslation('c-bums-rush');
    const nodes = useRef(new Map<SeatIndex, HTMLDivElement>());
    const labels = useRef(new Map<SeatIndex, HTMLSpanElement>());
    const arrows = useRef(new Map<SeatIndex, SVGSVGElement>());

    useImperativeHandle(
      ref,
      (): LiveHandle => ({
        update(frame: HudLiveFrame) {
          const visible = new Set<SeatIndex>();

          for (let i = 0; i < frame.edgeCount; i++) {
            const indicator = frame.edges[i];
            if (!indicator) continue;
            visible.add(indicator.seat);

            const node = nodes.current.get(indicator.seat);
            if (!node) continue;
            const placement = edgeIndicatorPlacement(indicator, frame.camera);
            node.hidden = false;
            node.style.left = `${placement.leftPct}%`;
            node.style.top = `${placement.topPct}%`;
            // The badge stays upright — only the arrow turns. A rotating chip
            // would put the seat mark and the distance on their side, which is
            // exactly the information the arrow exists to deliver.
            const arrow = arrows.current.get(indicator.seat);
            if (arrow) arrow.style.transform = `rotate(${placement.angleDeg.toFixed(1)}deg)`;

            const label = labels.current.get(indicator.seat);
            const metres = edgeDistanceMetres(indicator.distance);
            if (label && label.dataset.m !== String(metres)) {
              label.dataset.m = String(metres);
              label.textContent = String(metres);
            }
          }

          for (const seat of SEAT_INDICES) {
            if (visible.has(seat)) continue;
            const node = nodes.current.get(seat);
            if (node && !node.hidden) node.hidden = true;
          }
        },
      }),
      [],
    );

    return (
      <div className={cn('pointer-events-none absolute inset-0', className)} aria-hidden="true">
        {SEAT_INDICES.map((seat) => (
          <div
            key={seat}
            hidden
            ref={(node) => {
              if (node) nodes.current.set(seat, node);
              else nodes.current.delete(seat);
            }}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-bum-ink bg-bum-surface px-1.5 py-0.5"
            style={{ left: '50%', top: '50%' }}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-[clamp(0.6rem,1.6vmin,0.9rem)] text-bum-ink"
              fill="currentColor"
              ref={(node) => {
                if (node) arrows.current.set(seat, node);
                else arrows.current.delete(seat);
              }}
            >
              <path d="M2 8h9M8 3.5 13 8l-5 4.5z" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            <SeatMark seat={seat} className="size-[clamp(0.6rem,1.6vmin,0.9rem)]" />
            <span
              className="tabular-nums text-bum-ink"
              style={{ fontSize: 'clamp(0.55rem, 1.3vmin, 0.75rem)' }}
              ref={(node) => {
                if (node) labels.current.set(seat, node);
                else labels.current.delete(seat);
              }}
            >
              0
            </span>
            <span className="sr-only">
              {t('hud.offscreen', { defaultValue: 'Player off screen' })}
            </span>
          </div>
        ))}
      </div>
    );
  },
);
