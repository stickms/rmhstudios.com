/**
 * Every sentence the flashcards say about an answer, as pure functions of the translator, so each
 * case can be checked without a DOM. One key per case; nothing is assembled from fragments except
 * the names of notes and landmarks, which are interpolated the way `{{note}}` always was.
 *
 * After a wrong answer the screen says, in order: what was played (or named) against the right note;
 * how far off it sits on the staff, or — on a key-signature card — what the key does to that letter;
 * and where the RIGHT note sits from the nearest landmark ("one step above the G on the second line").
 */
import type { Card } from '@/lib/rmhmusic/learn/content/decks';
import {
  alterationGlyph,
  cardAlteration,
  cardLetter,
  cardWritten,
  keyCardTonic,
  spelledName,
} from '@/lib/rmhmusic/learn/content/spelling';
import { landmarkHint, type LandmarkHint, type LandmarkId } from '@/lib/rmhmusic/learn/landmarks';
import type { Answer } from '@/lib/rmhmusic/learn/machines/flashcards';
import { spelledNoteName, type Miss } from '@/lib/rmhmusic/learn/miss';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';

export type Translate = (key: string, options: Record<string, unknown>) => string;

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

/** An answer as it is spoken: "E", "F♯", "B♭", or "E4" for a note played with its octave. */
export function answerName(answer: Answer): string {
  if (answer.kind === 'letter') return `${answer.letter}${alterationGlyph(answer.accidental ?? 0)}`;
  if (answer.kind === 'pitch-class') return SHARP_NAMES[((Math.round(answer.pc) % 12) + 12) % 12] ?? '';
  return midiToName(answer.midi).replace('#', '♯');
}

/** The right note as it is spoken in a sentence: its letter and sign with the octave ("F♯4", "B♭3"). */
export function cardNoteName(card: Card): string {
  return spelledNoteName(cardWritten(card), cardAlteration(card));
}

/**
 * The sentences that tell a wrong answer: what was played (or named) against the right note, then
 * how far off it sits on the staff. Each is its own translated string.
 */
export function missSentences(t: Translate, miss: Miss, played: boolean, note: string, said: string): string[] {
  const lead = played
    ? t('flash-miss-played', {
        played: said,
        note,
        defaultValue: 'You played {{played}}, not {{note}}.',
      })
    : t('flash-miss-named', {
        played: said,
        note,
        defaultValue: 'You named {{played}}, not {{note}}.',
      });
  const above = miss.direction === 'above';
  let how: string;
  if (miss.direction === 'level') {
    how = t('flash-miss-level', {
      defaultValue: 'Right line or space, wrong accidental.',
    });
  } else if (miss.steps === 7 && miss.sameLetter) {
    how = above
      ? t('flash-miss-octave-above', {
          defaultValue: 'An octave above the right note.',
        })
      : t('flash-miss-octave-below', {
          defaultValue: 'An octave below the right note.',
        });
  } else if (miss.steps === 1) {
    how = above
      ? t('flash-miss-above-one', {
          defaultValue: 'One step above the right note.',
        })
      : t('flash-miss-below-one', {
          defaultValue: 'One step below the right note.',
        });
  } else {
    how = above
      ? t('flash-miss-above', {
          n: miss.steps,
          count: Number(miss.steps),
          defaultValue_one: '{{n}} step above the right note.',
          defaultValue: '{{n}} steps above the right note.',
        })
      : t('flash-miss-below', {
          n: miss.steps,
          count: Number(miss.steps),
          defaultValue_one: '{{n}} step below the right note.',
          defaultValue: '{{n}} steps below the right note.',
        });
  }
  return [lead, how];
}

/** What a key does to the right note's letter: "F is sharp in G major." (or flat, or natural). */
export function keySentence(t: Translate, card: Card): string | null {
  if (!card.key) return null;
  const letter = cardLetter(card);
  const key = keyCardTonic(card.key);
  const a = cardAlteration(card);
  if (a > 0) return t('flash-key-sharp', { letter, key, defaultValue: '{{letter}} is sharp in {{key}} major.' });
  if (a < 0) return t('flash-key-flat', { letter, key, defaultValue: '{{letter}} is flat in {{key}} major.' });
  return t('flash-key-natural', { letter, key, defaultValue: '{{letter}} is natural in {{key}} major.' });
}

/** A landmark's name as a phrase that follows "above" or "below": "the G on the second line". */
export function landmarkName(t: Translate, id: LandmarkId): string {
  switch (id) {
    case 'treble-middle-c':
      return t('flash-landmark-treble-middle-c', { defaultValue: 'middle C, on the ledger line below the staff' });
    case 'treble-g':
      return t('flash-landmark-treble-g', { defaultValue: 'the G on the second line' });
    case 'treble-c':
      return t('flash-landmark-treble-c', { defaultValue: 'the C in the third space' });
    case 'treble-f':
      return t('flash-landmark-treble-f', { defaultValue: 'the F on the top line' });
    case 'bass-g':
      return t('flash-landmark-bass-g', { defaultValue: 'the G on the bottom line' });
    case 'bass-c':
      return t('flash-landmark-bass-c', { defaultValue: 'the C in the second space' });
    case 'bass-f':
      return t('flash-landmark-bass-f', { defaultValue: 'the F on the fourth line' });
    case 'bass-middle-c':
      return t('flash-landmark-bass-middle-c', { defaultValue: 'middle C, on the ledger line above the staff' });
  }
}

/** Where the right note sits from its nearest landmark: "A4 is one step above the G on the second line." */
export function landmarkSentence(t: Translate, hint: LandmarkHint, note: string): string {
  const landmark = landmarkName(t, hint.landmark.id);
  if (hint.direction === 'on') {
    return t('flash-landmark-on', { note, landmark, defaultValue: '{{note}} is {{landmark}}.' });
  }
  const above = hint.direction === 'above';
  if (hint.steps === 1) {
    return above
      ? t('flash-landmark-above-one', { note, landmark, defaultValue: '{{note}} is one step above {{landmark}}.' })
      : t('flash-landmark-below-one', { note, landmark, defaultValue: '{{note}} is one step below {{landmark}}.' });
  }
  return above
    ? t('flash-landmark-above', {
        note,
        landmark,
        n: hint.steps,
        count: Number(hint.steps),
        defaultValue_one: '{{note}} is {{n}} step above {{landmark}}.',
        defaultValue: '{{note}} is {{n}} steps above {{landmark}}.',
      })
    : t('flash-landmark-below', {
        note,
        landmark,
        n: hint.steps,
        count: Number(hint.steps),
        defaultValue_one: '{{note}} is {{n}} step below {{landmark}}.',
        defaultValue: '{{note}} is {{n}} steps below {{landmark}}.',
      });
}

/**
 * Every sentence for a wrong answer, in the order they are said. The distance is dropped on a key
 * card (the key sentence says why the note is not what it looks like), and the landmark sentence
 * about the right note ends the list.
 */
export function wrongAnswerSentences(t: Translate, card: Card, miss: Miss | null, answer: Answer): string[] {
  const note = cardNoteName(card);
  const out: string[] = [];
  if (miss) {
    const [lead, how] = missSentences(
      t,
      miss,
      answer.kind === 'midi',
      note,
      miss.letterOnly ? answerName(answer) : miss.name,
    );
    out.push(lead);
    const key = keySentence(t, card);
    out.push(key ?? how);
  } else {
    out.push(
      t('flash-that-was', {
        note: answer.kind === 'midi' ? note : spelledName(card),
        defaultValue: 'That was {{note}}.',
      }),
    );
    const key = keySentence(t, card);
    if (key) out.push(key);
  }
  out.push(landmarkSentence(t, landmarkHint(card.clef, cardWritten(card)), note));
  return out.filter((s) => s !== '');
}
