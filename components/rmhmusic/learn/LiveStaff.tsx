'use client';

/**
 * LiveStaff — a small treble staff that shows the note just played at its pitch, with ledger
 * lines, a sharp for a black key and an ottava sign for a note beyond the drawn range, and its
 * name underneath: the first step towards reading music. Positions come from the pure
 * `lib/rmhmusic/learn/staff.ts`.
 *
 * Its box is fixed (the SVG's aspect ratio, a reserved line for the name), so the first note
 * appears without moving anything. It is a labelled image whose label follows the note; with
 * `announce` it also says the note in a polite live region (off where the screen around it already
 * announces what it hears). It subscribes to notes itself, so a note re-renders this staff only.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { InputSource } from '@/lib/rmhmusic/learn/input/events';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { fitToStaff } from '@/lib/rmhmusic/learn/staff';
import { cn } from '@/lib/utils';
import { useLastNote } from './useLearnInput';

const GAP = 10;
/** The top line's y; the drawing runs from 3 ledger lines above to 4 below. */
const TOP = 42;
const NOTE_X = 128;
const yOf = (step: number) => TOP + 4 * GAP - (step * GAP) / 2;

/** A treble (G) clef drawn as one pen stroke curling round the G line (y = TOP + 30). */
const CLEF =
  `M 22 ${TOP + 56} C 14 ${TOP + 58} 12 ${TOP + 48} 19 ${TOP + 47} ` +
  `L 21 ${TOP - 16} C 30 ${TOP - 10} 29 ${TOP + 4} 16 ${TOP + 16} ` +
  `C 6 ${TOP + 26} 8 ${TOP + 41} 21 ${TOP + 41} C 31 ${TOP + 41} 32 ${TOP + 27} 22 ${TOP + 26} ` +
  `C 15 ${TOP + 26} 15 ${TOP + 35} 21 ${TOP + 35}`;

interface LiveStaffProps {
  /** Only notes from this input (the setup preview shows one input's notes). */
  source?: InputSource;
  /** Show this note instead of following the input (e.g. the note that completed a lesson). */
  note?: number;
  /** Say each note in a polite live region. */
  announce?: boolean;
  className?: string;
}

export function LiveStaff({ source, note, announce = true, className }: LiveStaffProps) {
  const { t } = useTranslation('c-rmhmusic');
  const titleId = useId();
  const last = useLastNote(source);
  const midi = note ?? last?.midi ?? null;
  const name = midi === null ? null : midiToName(midi);
  const fit = midi === null ? null : fitToStaff(midi);
  const label = name
    ? t('staff-last-note', { note: name, defaultValue: 'Last note: {{note}}' })
    : t('staff-empty', { defaultValue: 'Staff: no note played yet' });

  return (
    <figure className={cn('mx-auto w-full max-w-64', className)}>
      <svg
        viewBox="0 0 200 132"
        role="img"
        aria-labelledby={titleId}
        className="block h-auto w-full text-(--app-text)"
      >
        <title id={titleId}>{label}</title>
        <g stroke="currentColor" strokeWidth="1" opacity="0.55">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="4" x2="196" y1={TOP + i * GAP} y2={TOP + i * GAP} />
          ))}
          <line x1="4" x2="4" y1={TOP} y2={TOP + 4 * GAP} />
          <line x1="196" x2="196" y1={TOP} y2={TOP + 4 * GAP} />
        </g>
        <path d={CLEF} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="19" cy={TOP + 52} r="3" fill="currentColor" />
        {fit && (
          <g className="text-(--app-accent)" stroke="currentColor" fill="currentColor">
            {fit.position.ledgerLines.map((s) => (
              <line
                key={s}
                x1={NOTE_X - 12}
                x2={NOTE_X + 12}
                y1={yOf(s)}
                y2={yOf(s)}
                strokeWidth="1.4"
              />
            ))}
            <ellipse
              cx={NOTE_X}
              cy={yOf(fit.position.step)}
              rx="6.6"
              ry="4.6"
              transform={`rotate(-20 ${NOTE_X} ${yOf(fit.position.step)})`}
              stroke="none"
            />
            {fit.position.accidental === 'sharp' && (
              <g
                strokeWidth="1.4"
                transform={`translate(${NOTE_X - 17} ${yOf(fit.position.step)})`}
              >
                <line x1="-2" x2="-2" y1="-9" y2="10" />
                <line x1="2.5" x2="2.5" y1="-10" y2="9" />
                <line x1="-5.5" x2="6" y1="-1.5" y2="-4.5" strokeWidth="2.4" />
                <line x1="-5.5" x2="6" y1="4.5" y2="1.5" strokeWidth="2.4" />
              </g>
            )}
            {fit.ottava !== 0 && (
              <text
                x={NOTE_X + 14}
                y={fit.ottava < 0 ? yOf(fit.position.step) + 20 : yOf(fit.position.step) - 12}
                stroke="none"
                fontSize="11"
                fontStyle="italic"
                className="rmm-display"
              >
                {fit.ottava < 0
                  ? fit.ottava === -1
                    ? '8vb'
                    : '15mb'
                  : fit.ottava === 1
                    ? '8va'
                    : '15ma'}
              </text>
            )}
          </g>
        )}
      </svg>
      <figcaption
        aria-hidden="true"
        className="min-h-9 text-center font-(family-name:--app-font-mono) text-2xl font-bold text-(--app-accent)"
      >
        {name}
      </figcaption>
      {announce && (
        <p className="sr-only" aria-live="polite">
          {name ? label : null}
        </p>
      )}
    </figure>
  );
}
