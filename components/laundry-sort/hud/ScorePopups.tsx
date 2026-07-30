'use client';

/**
 * The "+240" that rises out of a bin when a garment lands.
 *
 * Without it the score box is the only feedback and it is at the far corner of
 * the screen from where the player is looking, so a correct sort in a busy
 * round reads as nothing happening at all.
 *
 * Positioned from the garment's world x rather than a full 3D projection: the
 * arena spans the frame almost exactly, so a linear map lands the popup over
 * the right bin to within a few pixels, and it costs nothing per frame.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ARENA, WASH_COLORS } from '@/lib/laundry-sort/constants';
import type { MatchEvent } from '@/lib/laundry-sort/match';

export interface Popup {
  key: number;
  type: MatchEvent['type'];
  points: number;
  combo: number;
  /** Percentage across the stage, 0–100. */
  left: number;
  colorIndex: number;
}

let nextKey = 1;

/** Turn a batch of match events into popups. Exported for the game root. */
export function popupsFromEvents(events: MatchEvent[]): Popup[] {
  return events.map((event) => ({
    key: nextKey++,
    type: event.type,
    points: event.points,
    combo: event.combo,
    left: Math.max(4, Math.min(96, ((event.x / ARENA.halfWidth) * 0.5 + 0.5) * 100)),
    colorIndex: event.colorIndex,
  }));
}

const LIFETIME_MS = 900;

export function ScorePopups({ popups }: { popups: Popup[] }) {
  const { t } = useTranslation('c-laundry-sort');
  const [visible, setVisible] = useState<Popup[]>([]);

  useEffect(() => {
    if (popups.length === 0) return;
    setVisible((prev) => [...prev, ...popups].slice(-12));
    const timer = window.setTimeout(() => {
      const expired = new Set(popups.map((p) => p.key));
      setVisible((prev) => prev.filter((p) => !expired.has(p.key)));
    }, LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [popups]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {visible.map((popup) => {
        const wash = WASH_COLORS[popup.colorIndex] ?? WASH_COLORS[0];
        const label =
          popup.type === 'missed'
            ? t('popup-missed', { defaultValue: 'Missed' })
            : popup.points >= 0
              ? `+${popup.points}`
              : `${popup.points}`;
        const color =
          popup.type === 'sorted'
            ? 'var(--ls-accent)'
            : popup.type === 'wrong'
              ? 'var(--ls-danger)'
              : 'var(--ls-muted)';

        return (
          <div
            key={popup.key}
            className="ls-popup ls-numeric absolute text-lg font-black drop-shadow-lg sm:text-2xl"
            style={{ left: `${popup.left}%`, bottom: '26%', color }}
          >
            {label}
            {popup.type === 'sorted' && popup.combo >= 2 ? (
              <span className="ml-1 text-xs font-bold" style={{ color: wash.hex }}>
                ×{popup.combo}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
