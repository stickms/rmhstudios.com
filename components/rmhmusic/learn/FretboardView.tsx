'use client';

/**
 * FretboardView — the first frets of a guitar neck, drawn on the page's paper: six strings across
 * (the high E on top and the low E at the bottom, as a player sees the neck looking down, and as
 * tab is written), the open strings left of the nut, then frets 1 to 5, with ink dots at the 3rd
 * and 5th frets and the fret numbers underneath. Every place a finger can go is a button, so the
 * learner answers by tapping it.
 *
 * Strings: the theory module indexes them low to high (0 = the low E … 5 = the high E); the
 * learner reads guitarists' numbers (string 1 = the high E … string 6 = the low E,
 * `stringNumber`). Each cell is named "String 3, G, fret 2" or "String 6, E, open": the string's
 * number and its open note (which the board shows at the left), never the note the cell sounds —
 * that is the question.
 *
 * Keyboard: one cell is in the tab order (roving focus). The arrow keys move it — up and down
 * across strings as drawn, left and right along the frets — Home and End jump to the open string
 * and the 5th fret, and Enter or Space answer.
 *
 * Size: rows are 2.75rem (44px) tall. Columns are at least 44px wide and share the width, a little
 * narrower up the neck like real frets; at 320px the board bleeds into the page gutter (as the
 * piano does) so six 44px columns fit. If they still cannot (very large text) the board scrolls
 * sideways inside its own box; the page never does. The box's height is fixed by
 * `.rmm-find__board`, so asking, feedback and the next question move nothing.
 *
 * A tap sounds the note it plays (the same small voice as the on-screen piano) and answers by
 * position; the lesson judges it by the pitch that position sounds. Marks (`right`, `wrong`) are
 * drawn once answered: a filled notehead on every place that sounds the target, an open one in red
 * pencil where the learner tapped. They are decoration; the lesson says the same in words.
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { playNote } from '@/lib/rmhmusic/learn/audio/voice';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import {
  FIRST_FRETS,
  STANDARD_TUNING,
  STRING_COUNT,
  fretMidi,
  stringNumber,
  type FretPosition,
} from '@/lib/rmhmusic/learn/theory/fretboard';
import { cn } from '@/lib/utils';
import { Notehead } from './Notehead';

/** How long a tapped note sounds. */
const TAP_NOTE_MS = 700;

/** String thickness in px, low E (index 0) to high E. */
const GAUGE = [3, 2.5, 2, 1.5, 1.25, 1];

/** Rows top to bottom: the high E first. */
const ROWS = Array.from({ length: STRING_COUNT }, (_, i) => STRING_COUNT - 1 - i);
const FRETS = Array.from({ length: FIRST_FRETS + 1 }, (_, i) => i);
/** The frets with an inlay dot. */
const INLAYS = [3, 5];

const openName = (string: number) => midiToName(STANDARD_TUNING[string]).replace(/-?\d+$/, '');
const same = (a: FretPosition | null | undefined, string: number, fret: number) =>
  !!a && a.string === string && a.fret === fret;

export const FretboardView = memo(function FretboardView({
  asking,
  onAnswer,
  right,
  wrong,
  className,
}: {
  /** False once the question is answered: the cells stay focusable but answer nothing. */
  asking: boolean;
  onAnswer: (position: FretPosition) => void;
  /** Every place that sounds the target, once answered. */
  right?: readonly FretPosition[];
  /** Where the learner tapped, when that was wrong. */
  wrong?: FretPosition | null;
  className?: string;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const [focus, setFocus] = useState<FretPosition>({ string: STRING_COUNT - 1, fret: 0 });
  const grid = useRef<HTMLDivElement>(null);
  const releases = useRef(new Set<() => void>());

  // Let go of any note still sounding when the board goes away.
  useEffect(() => {
    const live = releases.current;
    return () => {
      for (const release of live) release();
      live.clear();
    };
  }, []);

  const sound = (midi: number) => {
    const release = playNote(midi, 0.8);
    releases.current.add(release);
    window.setTimeout(() => {
      release();
      releases.current.delete(release);
    }, TAP_NOTE_MS);
  };

  const tap = (string: number, fret: number) => {
    setFocus({ string, fret });
    if (!asking) return;
    sound(fretMidi(string, fret));
    onAnswer({ string, fret });
  };

  const move = (to: FretPosition) => {
    setFocus(to);
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-string="${to.string}"][data-fret="${to.fret}"]`)
      ?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, string: number, fret: number) => {
    let to: FretPosition | null = null;
    if (e.key === 'ArrowUp') to = { string: Math.min(STRING_COUNT - 1, string + 1), fret };
    else if (e.key === 'ArrowDown') to = { string: Math.max(0, string - 1), fret };
    else if (e.key === 'ArrowRight') to = { string, fret: Math.min(FIRST_FRETS, fret + 1) };
    else if (e.key === 'ArrowLeft') to = { string, fret: Math.max(0, fret - 1) };
    else if (e.key === 'Home') to = { string, fret: 0 };
    else if (e.key === 'End') to = { string, fret: FIRST_FRETS };
    if (!to) return;
    e.preventDefault();
    move(to);
  };

  return (
    // The board runs low frets to high, left to right, in every language (like the piano).
    <div dir="ltr" className={cn('rmm-fret rmm-sheet', className)} data-jelly-zone="playfield">
      <div
        ref={grid}
        role="group"
        aria-label={t('find-fretboard', { defaultValue: 'Fretboard, frets 0 to 5' })}
        className="rmm-fret__grid"
      >
        {INLAYS.map((fret) => (
          <span
            key={`inlay-${fret}`}
            aria-hidden="true"
            className="rmm-fret__inlay"
            style={{ gridColumn: fret + 2 }}
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
              <circle cx="5" cy="5" r="4.2" fill="currentColor" />
            </svg>
          </span>
        ))}
        {ROWS.map((string, row) => (
          <div key={string} className="contents">
            <span
              aria-hidden="true"
              className="rmm-fret__name rmm-display"
              style={{ gridRow: row + 1, gridColumn: 1 }}
            >
              {openName(string)}
            </span>
            {FRETS.map((fret) => {
              const isRight = !!right?.some((p) => same(p, string, fret));
              const isWrong = same(wrong, string, fret);
              const n = stringNumber(string);
              const name = openName(string);
              return (
                <button
                  key={fret}
                  type="button"
                  data-string={string}
                  data-fret={fret}
                  tabIndex={same(focus, string, fret) ? 0 : -1}
                  aria-label={
                    fret === 0
                      ? t('find-cell-open', {
                          n,
                          name,
                          defaultValue: 'String {{n}}, {{name}}, open',
                        })
                      : t('find-cell-fret', {
                          n,
                          name,
                          fret,
                          defaultValue: 'String {{n}}, {{name}}, fret {{fret}}',
                        })
                  }
                  aria-disabled={!asking || undefined}
                  onClick={() => tap(string, fret)}
                  onKeyDown={(e) => onKeyDown(e, string, fret)}
                  onFocus={() => setFocus({ string, fret })}
                  className="rmm-fret__cell"
                  style={
                    {
                      gridRow: row + 1,
                      gridColumn: fret + 2,
                      '--rmm-gauge': `${GAUGE[string]}px`,
                    } as CSSProperties
                  }
                >
                  {(isRight || isWrong) && (
                    <Notehead
                      kind={isRight ? 'filled' : 'open'}
                      className={cn(
                        'relative h-4 w-5',
                        isRight ? 'text-(--app-accent)' : 'text-(--app-danger)',
                      )}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
        {FRETS.slice(1).map((fret) => (
          <span
            key={`n-${fret}`}
            aria-hidden="true"
            className="rmm-fret__number"
            style={{ gridRow: STRING_COUNT + 1, gridColumn: fret + 2 }}
          >
            {fret}
          </span>
        ))}
      </div>
    </div>
  );
});
