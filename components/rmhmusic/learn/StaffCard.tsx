'use client';

/**
 * StaffCard — one flashcard: a hand-ruled five-line staff with its clef, the ledger lines the
 * note needs, and one note (head and stem), drawn as if copied out with a pen. Geometry is the
 * pure `lib/rmhmusic/learn/staff-card-layout.ts`.
 *
 * The SVG's box is fixed and the line under it (where the answer is written once given) is
 * reserved, so asking, answering and the next card never move anything. While asking, the image
 * says only which staff the note is on; once answered it names the note. The note's colour (ink,
 * the accent when right, red pencil when wrong) is never the only signal: the lesson says it in
 * words.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Card } from '@/lib/rmhmusic/learn/content/decks';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import {
  CARD_GAP,
  CARD_H,
  CARD_LOW_H,
  CARD_LOW_MIN_STEP,
  CARD_MIN_STEP,
  CARD_NOTE_X,
  CARD_TOP,
  CARD_W,
  CLEF_GLYPHS,
  HEAD_RX,
  HEAD_RY,
  cardLayout,
  ledgerLine,
  ruledLine,
} from '@/lib/rmhmusic/learn/staff-card-layout';
import { noteLetter } from '@/lib/rmhmusic/learn/theory/clef';
import { cn } from '@/lib/utils';

export type StaffCardState = 'ask' | 'right' | 'wrong';

/**
 * The card's box: as wide as the sheet up to 18rem (20rem from 640px). The SVG's fixed aspect
 * ratio and the 2.25rem answer line under it make its height; LessonScreen's placeholder draws the
 * same box.
 */
export const STAFF_BOX = 'mx-auto w-full max-w-72 sm:max-w-80';

/** The low card's aspect ratio, for a placeholder of the same box (`range="low"`). */
export const STAFF_LOW_ASPECT = 'aspect-[200/117]';

export function StaffCard({
  card,
  state,
  className,
  range = 'deck',
  octaveClef = false,
  caption,
  label: labelOverride,
}: {
  card: Card;
  state: StaffCardState;
  className?: string;
  /** `low` reaches three ledger lines under the treble staff (the note finder; see the layout). */
  range?: 'deck' | 'low';
  /** Mark the treble clef with a small 8 below it: read an octave down (guitar music). */
  octaveClef?: boolean;
  /**
   * Written beside the note in every state (the note finder's target), in place of the answer line
   * under the card, which is then not drawn: the card is the SVG's box alone.
   */
  caption?: string;
  /** The image's accessible name, instead of the flashcard's. */
  label?: string;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const titleId = useId();
  const low = range === 'low';
  const height = low ? CARD_LOW_H : CARD_H;
  const layout = cardLayout(card.clef, card.midi, low ? CARD_LOW_MIN_STEP : CARD_MIN_STEP);
  const glyph = CLEF_GLYPHS[card.clef];
  const answered = state !== 'ask';
  const name = midiToName(card.midi);

  const label = labelOverride
    ? labelOverride
    : answered
      ? card.clef === 'bass'
        ? t('flash-card-named-bass', {
            note: name,
            defaultValue: '{{note}} on the bass staff',
          })
        : t('flash-card-named-treble', {
            note: name,
            defaultValue: '{{note}} on the treble staff',
          })
      : card.clef === 'bass'
        ? t('flash-card-ask-bass', { defaultValue: 'A note on the bass staff' })
        : t('flash-card-ask-treble', { defaultValue: 'A note on the treble staff' });

  const ink =
    state === 'right'
      ? 'text-(--app-accent)'
      : state === 'wrong'
        ? 'text-(--app-danger)'
        : 'text-(--app-text)';

  const right = CARD_W - 4;
  return (
    <figure className={cn(STAFF_BOX, className)}>
      <svg
        viewBox={`0 0 ${CARD_W} ${height}`}
        role="img"
        aria-labelledby={titleId}
        className="block h-auto w-full text-(--app-text)"
      >
        <title id={titleId}>{label}</title>
        <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6">
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={ruledLine(i, 4, right)} />
          ))}
          <path d={`M 4.2 ${CARD_TOP - 0.3} L 3.8 ${CARD_TOP + 4 * CARD_GAP + 0.3}`} />
          <path
            d={`M ${right + 0.2} ${CARD_TOP + 0.2} L ${right - 0.2} ${CARD_TOP + 4 * CARD_GAP}`}
          />
        </g>
        <g fill="currentColor">
          <path d={glyph.path} />
          {glyph.dots.map((d) => (
            <circle key={`${d.cx}-${d.cy}`} cx={d.cx} cy={d.cy} r={d.r} />
          ))}
          {octaveClef && card.clef === 'treble' ? (
            // The octave-down treble clef's 8, set small under the clef's tail.
            <text
              x="19.5"
              y="101"
              textAnchor="middle"
              fontSize="10"
              className="rmm-display"
              stroke="none"
            >
              8
            </text>
          ) : null}
        </g>
        <g className={ink} stroke="currentColor" fill="currentColor" strokeLinecap="round">
          {layout.ledgerYs.map((y, i) => (
            <path key={y} d={ledgerLine(y, i)} strokeWidth="1.4" fill="none" />
          ))}
          <line
            x1={layout.stem.x}
            x2={layout.stem.x}
            y1={layout.stem.y1}
            y2={layout.stem.y2}
            strokeWidth="1.3"
          />
          <ellipse
            cx={CARD_NOTE_X}
            cy={layout.noteY}
            rx={HEAD_RX}
            ry={HEAD_RY}
            transform={`rotate(-20 ${CARD_NOTE_X} ${layout.noteY})`}
            stroke="none"
          />
          {caption !== undefined ? (
            // The target's name, pencilled beside its note (the note finder): one annotation on the
            // card, close to what it names, at any height on the staff.
            <text
              key={card.id}
              x={CARD_NOTE_X + 20}
              y={layout.noteY + 6}
              fontSize="19"
              // A margin of paper round the letters where they cross a staff line.
              stroke="var(--app-surface)"
              strokeWidth="4"
              strokeLinejoin="round"
              paintOrder="stroke"
              className="rmm-display"
              data-card-name=""
            >
              {caption}
            </text>
          ) : null}
        </g>
      </svg>
      {caption === undefined ? (
        // The answer, written under the note once given; the line is reserved while asking.
        <figcaption
          aria-hidden="true"
          className={cn('rmm-display h-9 text-center text-[1.75rem] leading-9', ink)}
        >
          {answered ? <span key={card.id}>{noteLetter(card.midi)}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
