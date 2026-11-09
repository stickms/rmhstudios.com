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

export function StaffCard({
  card,
  state,
  className,
}: {
  card: Card;
  state: StaffCardState;
  className?: string;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const titleId = useId();
  const layout = cardLayout(card.clef, card.midi);
  const glyph = CLEF_GLYPHS[card.clef];
  const answered = state !== 'ask';
  const name = midiToName(card.midi);

  const label = answered
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
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
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
        </g>
      </svg>
      {/* The answer, written under the note once given; the line is reserved while asking. */}
      <figcaption
        aria-hidden="true"
        className={cn('rmm-display h-9 text-center text-[1.75rem] leading-9', ink)}
      >
        {answered ? <span key={card.id}>{noteLetter(card.midi)}</span> : null}
      </figcaption>
    </figure>
  );
}
