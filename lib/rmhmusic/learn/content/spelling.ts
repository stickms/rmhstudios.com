/**
 * Spelled flashcards — sharps, flats and notes read in a key — pure.
 *
 * A natural card (`treble:64`) is named by its letter alone. Two more kinds name a note by its
 * letter AND its accidental, so a card carries the spelling the staff shows, not only the pitch:
 *
 *   accidental card  `treble:66:sharp`, `treble:70:flat`   a sign printed before the notehead. The id
 *                    is the SOUNDING pitch and the sign, so F♯4 and G♭4 (both 66) are two cards.
 *   key card         `key:G:treble:66`, `key:Bb:bass:46`   the major key's signature is drawn after the
 *                    clef and the note carries no sign of its own; the learner names the note the
 *                    signature makes it (F in G major is F♯). The id is the key, the clef and the
 *                    SOUNDING pitch; notes the key leaves alone are cards too, so the learner has to
 *                    tell which letters it alters.
 *
 * `midi` is always the sounding pitch; `written` is the natural the note is drawn on (absent when it
 * is the same as `midi`). Existing natural ids and the rows stored under them are untouched, and
 * `parseCardId` still knows only ids a deck deals.
 *
 * This module imports types only from `decks.ts` (which builds the decks from it), so the two do not
 * form an import cycle.
 */
import type { Card, Deck } from './decks';
import { clefStep, noteLetter, type Clef, type NoteLetter } from '../theory/clef';
import { keySignature, signatureLetters, type Key, type KeySignature } from '../theory/key-signatures';
import { noteGlyphs, parseNote, type Letter } from '../theory/scales';

/** A printed accidental: −1 flat, +1 sharp. */
export type Alteration = -1 | 1;

/** The major keys with a signature the cards teach: three with sharps, three with flats. */
export const KEY_CARD_KEYS = ['G', 'D', 'A', 'F', 'Bb', 'Eb'] as const;
export type KeyCardKey = (typeof KEY_CARD_KEYS)[number];

export const SHARP_KEYS: readonly KeyCardKey[] = ['G', 'D', 'A'];
export const FLAT_KEYS: readonly KeyCardKey[] = ['F', 'Bb', 'Eb'];

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

/** The staff itself, as the natural notes its lines and spaces hold (treble E4–F5, bass G2–A3). */
const STAFF_RANGE: Record<Clef, readonly [number, number]> = {
  treble: [64, 77],
  bass: [43, 57],
};

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function accidentalCardId(clef: Clef, midi: number, accidental: Alteration): string {
  return `${clef}:${midi}:${accidental > 0 ? 'sharp' : 'flat'}`;
}

export function keyCardId(key: KeyCardKey, clef: Clef, midi: number): string {
  return `key:${key}:${clef}:${midi}`;
}

/** The natural notes from `low` to `high`. */
function naturalsIn(low: number, high: number): number[] {
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (NATURAL_PCS.has(mod12(m))) out.push(m);
  return out;
}

/** The natural a card is drawn on: `written` for a spelled card, else its own pitch. */
export function cardWritten(card: Pick<Card, 'midi' | 'written'>): number {
  return card.written ?? card.midi;
}

/** −1, 0 or +1: how far the sounding pitch is from the natural it is written on. */
export function cardAlteration(card: Pick<Card, 'midi' | 'written'>): -1 | 0 | 1 {
  const d = card.midi - cardWritten(card);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

/** Whether the card is named by letter and accidental (an accidental card or a key card). */
export function isSpelledCard(card: Pick<Card, 'accidental' | 'key'>): boolean {
  return card.accidental !== undefined || card.key !== undefined;
}

/** The glyph for an alteration: ♯, ♭ or nothing. */
export function alterationGlyph(a: number): string {
  return a > 0 ? '♯' : a < 0 ? '♭' : '';
}

/** The letter a card is named by (the natural it is written on). */
export function cardLetter(card: Pick<Card, 'midi' | 'written'>): NoteLetter {
  return noteLetter(cardWritten(card));
}

/** The card's name as printed: "F", "F♯", "B♭". */
export function spelledName(card: Pick<Card, 'midi' | 'written'>): string {
  return `${cardLetter(card)}${alterationGlyph(cardAlteration(card))}`;
}

/** A card's name for a screen reader: "F sharp", "B flat", "G". */
export function spelledNameWords(card: Pick<Card, 'midi' | 'written'>, words: { sharp: string; flat: string }): string {
  const a = cardAlteration(card);
  return `${cardLetter(card)}${a > 0 ? ` ${words.sharp}` : a < 0 ? ` ${words.flat}` : ''}`;
}

/** A key card's key as the major key it names: "G", "B♭". */
export function keyCardTonic(key: KeyCardKey): string {
  const tonic = parseNote(key);
  return tonic ? noteGlyphs(tonic) : key;
}

export function isKeyCardKey(v: unknown): v is KeyCardKey {
  return typeof v === 'string' && (KEY_CARD_KEYS as readonly string[]).includes(v);
}

function majorKey(key: KeyCardKey): Key {
  const tonic = parseNote(key);
  if (!tonic) throw new RangeError(`no key ${key}`);
  return { tonic, mode: 'major' };
}

/** The signature a key card's key has (sharps or flats, and how many). */
export function keySignatureOf(key: KeyCardKey): KeySignature {
  return keySignature(majorKey(key));
}

/** The letters the key's signature marks, and whether they are raised or lowered. */
export function keyAlterations(key: KeyCardKey): { letters: readonly Letter[]; alteration: Alteration } {
  const sig = keySignature(majorKey(key));
  return { letters: signatureLetters(sig), alteration: sig.accidental === 'flat' ? -1 : 1 };
}

/** What a key does to a letter: −1 flat, 0 natural, +1 sharp. */
export function keyAlterationOf(key: KeyCardKey, letter: string): -1 | 0 | 1 {
  const { letters, alteration } = keyAlterations(key);
  return (letters as readonly string[]).includes(letter) ? alteration : 0;
}

/** Every accidental card of a clef: each natural on the staff with a sharp, and with a flat, whose result is a black key. */
export function accidentalCards(clef: Clef): Card[] {
  const [lo, hi] = STAFF_RANGE[clef];
  const out: Card[] = [];
  for (const written of naturalsIn(lo, hi)) {
    for (const accidental of [1, -1] as const) {
      const midi = written + accidental;
      // E♯, F♭, B♯ and C♭ sound like white keys: a beginner's flashcards leave them out.
      if (NATURAL_PCS.has(mod12(midi))) continue;
      out.push({ id: accidentalCardId(clef, midi, accidental), clef, midi, written, accidental });
    }
  }
  return out;
}

/** Every card of a key: each natural on both staves, sounding as the key's signature makes it. */
export function keyCards(key: KeyCardKey): Card[] {
  const out: Card[] = [];
  for (const clef of ['treble', 'bass'] as const) {
    const [lo, hi] = STAFF_RANGE[clef];
    for (const written of naturalsIn(lo, hi)) {
      const letter = noteLetter(written);
      const midi = written + keyAlterationOf(key, letter);
      out.push({
        id: keyCardId(key, clef, midi),
        clef,
        midi,
        key,
        ...(midi === written ? {} : { written }),
      });
    }
  }
  return out;
}

/** The decks of spelled cards (`decks.ts` merges them into `DECKS`). */
export const SPELLED_DECKS: Record<string, Deck> = {
  /** Sharps and flats on the treble staff: a sign before the notehead. */
  'accidentals-treble': { id: 'accidentals-treble', clef: 'treble', midis: [], cards: accidentalCards('treble') },
  /** Sharps and flats on the bass staff. */
  'accidentals-bass': { id: 'accidentals-bass', clef: 'bass', midis: [], cards: accidentalCards('bass') },
  /** Notes in G, D and A major, on both staves. */
  'keys-sharps': { id: 'keys-sharps', clef: 'treble', midis: [], cards: SHARP_KEYS.flatMap(keyCards) },
  /** Notes in F, B♭ and E♭ major, on both staves. */
  'keys-flats': { id: 'keys-flats', clef: 'treble', midis: [], cards: FLAT_KEYS.flatMap(keyCards) },
};

/** Where a card sits on its staff, in steps above the clef's bottom line (the written natural's). */
export function cardStep(card: Pick<Card, 'clef' | 'midi' | 'written'>): number {
  return clefStep(card.clef, cardWritten(card));
}
