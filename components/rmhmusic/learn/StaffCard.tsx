/**
 * StaffCard — one flashcard: a hand-ruled five-line staff with its clef, the ledger lines the
 * note needs, and one note (head and stem), drawn as if copied out with a pen. Geometry is the
 * pure `lib/rmhmusic/learn/staff-card-layout.ts`.
 *
 * The SVG's box is fixed and the line under it (where the answer is written once given) is
 * reserved, so asking, answering and the next card never move anything. While asking, the image
 * says only which staff the note is on; once answered it names the note. The note finder instead
 * gives a `caption`: its target's name pencilled beside the note in every state, with no line under
 * the card. All SVG text is `direction="ltr"` so RTL locales do not mirror it. The note's colour (ink,
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
  CARD_ACC_X,
  cardLayout,
  flatPath,
  keySignatureLayout,
  ledgerLine,
  nowMarkPath,
  ruledLine,
  sharpPath,
  sheetLayout,
  sheetLedgerLine,
  type SheetNote,
} from '@/lib/rmhmusic/learn/staff-card-layout';
import {
  cardAlteration,
  cardWritten,
  isSpelledCard,
  keyCardTonic,
  spelledName,
  spelledNameWords,
} from '@/lib/rmhmusic/learn/content/spelling';
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

/** How far left of the right note the played (wrong) note sits: clear of a neighbouring head. */
const PLAYED_DX = 28;

/**
 * A wrong answer as the card draws it: the pitch it sounds, and — for a sharp or flat — the natural it
 * is written on and the sign before it, so a wrong G♭ is drawn on the G line with a flat. A bare
 * number is a natural note (or a black key drawn on the natural below it, as the staff spells it).
 */
export interface PlayedNote {
  midi: number;
  written?: number;
  accidental?: -1 | 0 | 1;
}

export function StaffCard({
  card,
  state,
  className,
  range = 'deck',
  octaveClef = false,
  caption,
  label: labelOverride,
  played,
}: {
  card: Card;
  state: StaffCardState;
  /**
   * A wrong answer's pitch, drawn as a second (red pencil) notehead beside the right note, so the
   * learner sees how far off it was. The right note then takes the accent colour. Only drawn once
   * the card is answered wrong.
   */
  played?: number | PlayedNote | null;
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
  const minStep = low ? CARD_LOW_MIN_STEP : CARD_MIN_STEP;
  // A sharp, a flat or a note a key alters is drawn on the natural it is written on.
  const layout = cardLayout(card.clef, cardWritten(card), minStep);
  const spelled = isSpelledCard(card);
  const sign = cardAlteration(card);

  const answered = state !== 'ask';
  const words = {
    sharp: t('flash-word-sharp', { defaultValue: 'sharp' }),
    flat: t('flash-word-flat', { defaultValue: 'flat' }),
  };
  // A natural card is named as it always was ("E4"); a spelled one by letter and sign ("F sharp 4").
  const name = spelled
    ? `${spelledNameWords(card, words)} ${Math.floor(cardWritten(card) / 12) - 1}`
    : midiToName(card.midi);
  const keyName = card.key ? keyCardTonic(card.key) : null;
  const playedNote: PlayedNote | null =
    state === 'wrong' && played !== undefined && played !== null
      ? typeof played === 'number'
        ? { midi: played }
        : played
      : null;
  const miss =
    playedNote && Number.isFinite(playedNote.midi)
      ? (() => {
          const written = playedNote.written ?? playedNote.midi;
          const accidental = playedNote.accidental ?? 0;
          return {
            layout: cardLayout(card.clef, written, minStep),
            accidental,
            // "D4" for a natural, "F sharp 4" for a sign (a screen reader says the sign as a word).
            name:
              accidental === 0
                ? `${noteLetter(written)}${Math.floor(written / 12) - 1}`
                : `${noteLetter(written)} ${accidental > 0 ? words.sharp : words.flat} ${Math.floor(written / 12) - 1}`,
          };
        })()
      : null;

  const label = labelOverride
    ? labelOverride
    : miss
      ? card.clef === 'bass'
        ? t('flash-card-miss-bass', {
            note: name,
            played: miss.name,
            defaultValue: '{{note}} on the bass staff; you played {{played}}',
          })
        : t('flash-card-miss-treble', {
            note: name,
            played: miss.name,
            defaultValue: '{{note}} on the treble staff; you played {{played}}',
          })
      : answered
        ? keyName
          ? card.clef === 'bass'
            ? t('flash-card-named-key-bass', {
                note: name,
                key: keyName,
                defaultValue: '{{note}} on the bass staff, in {{key}} major',
              })
            : t('flash-card-named-key-treble', {
                note: name,
                key: keyName,
                defaultValue: '{{note}} on the treble staff, in {{key}} major',
              })
          : card.clef === 'bass'
            ? t('flash-card-named-bass', {
                note: name,
                defaultValue: '{{note}} on the bass staff',
              })
            : t('flash-card-named-treble', {
                note: name,
                defaultValue: '{{note}} on the treble staff',
              })
        : keyName
          ? card.clef === 'bass'
            ? t('flash-card-ask-key-bass', {
                key: keyName,
                defaultValue: 'A note on the bass staff, in {{key}} major',
              })
            : t('flash-card-ask-key-treble', {
                key: keyName,
                defaultValue: 'A note on the treble staff, in {{key}} major',
              })
          : card.accidental !== undefined
            ? card.clef === 'bass'
              ? t('flash-card-ask-accidental-bass', {
                  defaultValue: 'A sharp or flat note on the bass staff',
                })
              : t('flash-card-ask-accidental-treble', {
                  defaultValue: 'A sharp or flat note on the treble staff',
                })
            : card.clef === 'bass'
              ? t('flash-card-ask-bass', {
                  defaultValue: 'A note on the bass staff',
                })
              : t('flash-card-ask-treble', {
                  defaultValue: 'A note on the treble staff',
                });

  const ink = state === 'right' || miss ? 'text-app-accent' : state === 'wrong' ? 'text-app-danger' : 'text-app-text';

  return (
    <figure className={cn(STAFF_BOX, className)}>
      <svg
        viewBox={`0 0 ${CARD_W} ${height}`}
        role="img"
        aria-labelledby={titleId}
        className="block h-auto w-full text-app-text"
      >
        <title id={titleId}>{label}</title>
        <StaffRuling clef={card.clef} octaveClef={octaveClef} />
        {card.key ? (
          // The key signature, after the clef: part of the question, so it keeps the page's ink in every state.
          <g stroke="currentColor" fill="none" strokeLinecap="round" data-key-signature={card.key}>
            {keySignatureLayout(card.clef, card.key).map((k) => (
              <path
                key={`${k.x}-${k.y}`}
                d={k.kind === 'sharp' ? sharpPath(k.x, k.y) : flatPath(k.x, k.y)}
                strokeWidth={k.kind === 'sharp' ? 1.2 : 1.3}
              />
            ))}
          </g>
        ) : null}
        <g className={ink} stroke="currentColor" fill="currentColor" strokeLinecap="round">
          {layout.ledgerYs.map((y, i) => (
            <path key={y} d={ledgerLine(y, i)} strokeWidth="1.4" fill="none" />
          ))}
          {card.accidental !== undefined && sign !== 0 ? (
            // The sign printed before the notehead (an accidental card), pencilled like the sheet's.
            <path
              d={sign > 0 ? sharpPath(CARD_ACC_X, layout.noteY) : flatPath(CARD_ACC_X, layout.noteY)}
              strokeWidth={sign > 0 ? 1.2 : 1.3}
              fill="none"
              data-accidental={sign > 0 ? 'sharp' : 'flat'}
            />
          ) : null}
          <line x1={layout.stem.x} x2={layout.stem.x} y1={layout.stem.y1} y2={layout.stem.y2} strokeWidth="1.3" />
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
              // `text-anchor: start` ends at x under `dir="rtl"`, which put the name on the note.
              direction="ltr"
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
        {miss ? (
          // The note the learner played, left of the right one so two neighbouring notes do not
          // overlap, in red pencil; the sentence under the card says it in words.
          <g
            className="text-app-danger"
            stroke="currentColor"
            fill="currentColor"
            strokeLinecap="round"
            data-played-note=""
          >
            {miss.layout.ledgerYs.map((y, i) => (
              <path key={y} d={ledgerLine(y, i, CARD_NOTE_X - PLAYED_DX)} strokeWidth="1.4" fill="none" />
            ))}
            {miss.accidental !== 0 ? (
              <path
                d={
                  miss.accidental > 0
                    ? sharpPath(CARD_ACC_X - PLAYED_DX, miss.layout.noteY)
                    : flatPath(CARD_ACC_X - PLAYED_DX, miss.layout.noteY)
                }
                strokeWidth={miss.accidental > 0 ? 1.2 : 1.3}
                fill="none"
              />
            ) : null}
            <ellipse
              cx={CARD_NOTE_X - PLAYED_DX}
              cy={miss.layout.noteY}
              rx={HEAD_RX}
              ry={HEAD_RY}
              transform={`rotate(-20 ${CARD_NOTE_X - PLAYED_DX} ${miss.layout.noteY})`}
              stroke="none"
            />
          </g>
        ) : null}
      </svg>
      {caption === undefined ? (
        // The answer, written under the note once given; the line is reserved while asking.
        <figcaption aria-hidden="true" className={cn('rmm-display h-9 text-center text-[1.75rem] leading-9', ink)}>
          {answered ? <span key={card.id}>{spelled ? spelledName(card) : noteLetter(card.midi)}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * The ruled staff, its bar lines and its clef (with the octave clef's 8): the part every sheet
 * shares, card or sprint.
 */
export function StaffRuling({ clef, octaveClef = false }: { clef: Card['clef']; octaveClef?: boolean }) {
  const glyph = CLEF_GLYPHS[clef];
  const right = CARD_W - 4;
  return (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={ruledLine(i, 4, right)} />
        ))}
        <path d={`M 4.2 ${CARD_TOP - 0.3} L 3.8 ${CARD_TOP + 4 * CARD_GAP + 0.3}`} />
        <path d={`M ${right + 0.2} ${CARD_TOP + 0.2} L ${right - 0.2} ${CARD_TOP + 4 * CARD_GAP}`} />
      </g>
      <g fill="currentColor">
        <path d={glyph.path} />
        {glyph.dots.map((d) => (
          <circle key={`${d.cx}-${d.cy}`} cx={d.cx} cy={d.cy} r={d.r} />
        ))}
        {octaveClef && clef === 'treble' ? (
          // The octave-down treble clef's 8, set small under the clef's tail.
          <text
            x="19.5"
            y="101"
            textAnchor="middle"
            // Positioned in the card's own coordinates, whatever the page's direction (ar, ur).
            direction="ltr"
            fontSize="10"
            className="rmm-display"
            stroke="none"
          >
            8
          </text>
        ) : null}
      </g>
    </>
  );
}

/** A written note's name as the sheet spells it: its letter and the accidental printed before it. */
export function sheetNoteName(n: SheetNote): string {
  return `${noteLetter(n.written)}${n.accidental > 0 ? '♯' : n.accidental < 0 ? '♭' : ''}`;
}

/**
 * The sight reading game's sheet: the card's box, staff and clef with a prompt's notes on it — one
 * note, a chord on one stem, or a bar of notes with a pencilled "now" mark under the next one
 * (`sheetLayout`). Every prompt of every level fits the same box, so a run never moves the page.
 * Once answered, a pencil tick or a red-pencil cross is drawn in the corner and the right notes are
 * written under the staff (on the reserved line, as on a card). The caller names the image
 * (`label`): the notes are said in words, never only drawn. All SVG text is `direction="ltr"`.
 */
export function SprintSheet({
  clef,
  notes,
  arrangement,
  now,
  state,
  label,
  className,
  range = 'deck',
  octaveClef = false,
  played,
}: {
  clef: Card['clef'];
  /**
   * A wrong answer's notes as the page would write them, drawn in red pencil `dx` SVG units left
   * of the written notes (`sprint/miss.ts`); the written notes then take the accent colour. Only
   * drawn once the prompt is answered wrong.
   */
  played?: {
    notes: readonly SheetNote[];
    dx: number;
  } | null;
  notes: readonly SheetNote[];
  arrangement: 'chord' | 'bar';
  /** A bar: the note to play next. */
  now?: number;
  state: StaffCardState;
  /**
   * The image's name. While asking it must not give the answer away (say only what kind of prompt
   * is on which staff); the notes are named once answered.
   */
  label: string;
  className?: string;
  /** `low`: the note finder's taller card, three ledger lines under the treble staff (guitar). */
  range?: 'deck' | 'low';
  /** The treble clef with the small 8 under it (guitar music, read an octave down). */
  octaveClef?: boolean;
}) {
  const titleId = useId();
  const low = range === 'low';
  const layout = sheetLayout(clef, notes, arrangement, now, low ? CARD_LOW_MIN_STEP : CARD_MIN_STEP);
  const answered = state !== 'ask';
  const miss =
    state === 'wrong' && played && played.notes.length > 0
      ? {
          ...played,
          layout: sheetLayout(clef, played.notes, 'chord', undefined, low ? CARD_LOW_MIN_STEP : CARD_MIN_STEP),
        }
      : null;
  const ink = state === 'right' || miss ? 'text-app-accent' : state === 'wrong' ? 'text-app-danger' : 'text-app-text';
  return (
    <figure className={cn(STAFF_BOX, className)}>
      <svg
        viewBox={`0 0 ${CARD_W} ${low ? CARD_LOW_H : CARD_H}`}
        role="img"
        aria-labelledby={titleId}
        className="block h-auto w-full text-app-text"
      >
        <title id={titleId}>{label}</title>
        <StaffRuling clef={clef} octaveClef={octaveClef} />
        <g className={ink} stroke="currentColor" fill="currentColor" strokeLinecap="round">
          {layout.ledgers.map((l, i) => (
            <path key={`${l.y}-${l.x0}`} d={sheetLedgerLine(l, i)} strokeWidth="1.4" fill="none" />
          ))}
          {layout.stems.map((s) => (
            <line key={`${s.x}-${s.y1}`} x1={s.x} x2={s.x} y1={s.y1} y2={s.y2} strokeWidth="1.3" />
          ))}
          {layout.heads.map((h, i) => (
            <ellipse
              key={`${i}-${h.x}-${h.y}`}
              cx={h.x}
              cy={h.y}
              rx={HEAD_RX}
              ry={HEAD_RY}
              transform={`rotate(-20 ${h.x} ${h.y})`}
              stroke="none"
            />
          ))}
          {layout.accidentals.map((a) => (
            <path
              key={`${a.x}-${a.y}`}
              d={a.kind === 'sharp' ? sharpPath(a.x, a.y) : flatPath(a.x, a.y)}
              strokeWidth={a.kind === 'sharp' ? 1.2 : 1.3}
              fill="none"
            />
          ))}
        </g>
        {miss ? (
          // What the learner played, in red pencil beside the written notes: heads, ledger lines
          // and accidentals only (no stem), so two columns never read as one chord.
          <g
            className="text-app-danger"
            transform={`translate(${miss.dx} 0)`}
            stroke="currentColor"
            fill="currentColor"
            strokeLinecap="round"
            data-played-notes=""
          >
            {miss.layout.ledgers.map((l, i) => (
              <path key={`${l.y}-${l.x0}`} d={sheetLedgerLine(l, i)} strokeWidth="1.4" fill="none" />
            ))}
            {miss.layout.heads.map((h, i) => (
              <ellipse
                key={`${i}-${h.x}-${h.y}`}
                cx={h.x}
                cy={h.y}
                rx={HEAD_RX}
                ry={HEAD_RY}
                transform={`rotate(-20 ${h.x} ${h.y})`}
                stroke="none"
              />
            ))}
            {miss.layout.accidentals.map((a) => (
              <path
                key={`${a.x}-${a.y}`}
                d={a.kind === 'sharp' ? sharpPath(a.x, a.y) : flatPath(a.x, a.y)}
                strokeWidth={a.kind === 'sharp' ? 1.2 : 1.3}
                fill="none"
              />
            ))}
          </g>
        ) : null}
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4">
          {layout.now && !answered ? <path d={nowMarkPath(layout.now.x, layout.now.y)} /> : null}
          {state === 'right' ? (
            <path className="text-app-accent" d="M 180 12 L 184.5 17 L 193 5.5" />
          ) : state === 'wrong' ? (
            <path className="text-app-danger" d="M 181 6 L 192 17 M 192.5 6.5 L 180.5 16.5" />
          ) : null}
        </g>
      </svg>
      <figcaption
        aria-hidden="true"
        dir="ltr"
        className={cn('rmm-display h-9 text-center text-[1.75rem] leading-9', ink)}
      >
        {answered ? notes.map(sheetNoteName).join(' ') : null}
      </figcaption>
    </figure>
  );
}
