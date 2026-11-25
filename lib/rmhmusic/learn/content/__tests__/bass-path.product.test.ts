import { describe, expect, it } from 'vitest';
import { DECKS, buildSession, deckCards, isKnownCardId } from '../decks';
import { BASS_CLEF_UNIT_ID, PATH, PIANO_PATH, VOICE_PATH, getLesson, isKnownLesson, pathFor } from '../path';
import { isPlayable } from '../routing';
import { clefStep } from '../../theory/clef';
import { GRAND_FIND_HIGH, GRAND_FIND_LOW, findNotePool } from '../../machines/find-note';

/** The lesson ids of every unit that shipped before the bass clef unit: progress rows are keyed by them. */
const EARLIER_IDS = [
  'staff-what-is-a-staff',
  'staff-treble-notes',
  'staff-find-middle-c',
  'keys-layout-and-strings',
  'fretboard-first-frets',
  'play-first-note',
  'match-c',
  'match-white-keys',
  'ear-second-third',
  'ear-fifth-octave',
  'ear-major-minor',
  'chord-play-c-major',
  'scales-major-white',
  'key-signatures-major',
  'scales-major-all',
  'key-signatures-minor',
  'scales-minor-natural',
  'intervals-read-second-third',
  'intervals-read-fourth-fifth-octave',
  'intervals-read-all-sizes',
  'intervals-read-seconds-thirds-quality',
  'intervals-read-quality-wider',
  'rhythm-note-values',
  'rhythm-44-vs-34',
  'rhythm-tap-the-beat',
  'staff-sharps-flats',
  'staff-sharps-flats-bass',
  'staff-keys-sharps',
  'staff-keys-flats',
  // The chords unit (sprint 11) sits on the same shared path, so the check that nothing else joined it names it.
  'chords-ear-four-qualities',
  'chords-read-root-position',
  'chords-play-major-minor',
  'chords-play-dim-aug',
  'chords-read-inversions',
  'voice-staff-notes',
  'voice-first-note',
  'voice-match-five',
  'voice-match-range',
  'voice-interval-steps',
  'voice-interval-leaps',
];

const NEW_IDS = ['bass-clef-lines-spaces', 'bass-clef-all', 'grand-staff-middle', 'grand-staff-play'];
const unit = PIANO_PATH.find((u) => u.id === BASS_CLEF_UNIT_ID);

describe('the bass clef unit', () => {
  it('has four new lesson ids, none of them an id that shipped earlier', () => {
    expect(unit?.lessons.map((l) => l.id)).toEqual(NEW_IDS);
    for (const id of NEW_IDS) expect(EARLIER_IDS).not.toContain(id);
    // No earlier id changed: every one still resolves, and its unit is unchanged.
    for (const id of EARLIER_IDS) expect(isKnownLesson(id), id).toBe(true);
    for (const l of PATH.flatMap((u) => u.lessons)) expect(EARLIER_IDS).toContain(l.id);
  });

  it('runs the lessons in the modes the spec names, all playable', () => {
    expect(unit?.lessons.map((l) => [l.mode, l.deck])).toEqual([
      ['staff-flashcards', 'bass-lines'],
      ['staff-flashcards', 'bass-all'],
      ['staff-flashcards', 'grand-middle'],
      ['grand-staff-find', undefined],
    ]);
    for (const l of unit?.lessons ?? []) {
      expect(l.unit).toBe(BASS_CLEF_UNIT_ID);
      expect(isPlayable(l), l.id).toBe(true);
      expect(getLesson(l.id)).toBe(l);
    }
    // The playing lesson is not the First note played lesson.
    expect(getLesson('play-first-note')?.mode).toBe('play-note');
  });

  it('puts the unit second on the piano path, after Meet the staff and the keys', () => {
    expect(pathFor('piano')).toBe(PIANO_PATH);
    expect(PIANO_PATH[0]?.id).toBe('meet-staff-and-keys');
    expect(PIANO_PATH[1]?.id).toBe(BASS_CLEF_UNIT_ID);
    expect(PIANO_PATH.filter((u) => u.id !== BASS_CLEF_UNIT_ID)).toEqual(PATH);
  });

  it('leaves the guitar path and the singer path as they were', () => {
    expect(pathFor('guitar')).toBe(PATH);
    expect(pathFor('voice')).toBe(VOICE_PATH);
    expect(PATH.some((u) => u.id === BASS_CLEF_UNIT_ID)).toBe(false);
    expect(VOICE_PATH.some((u) => u.id === BASS_CLEF_UNIT_ID)).toBe(false);
    expect(PATH.map((u) => u.id)).toEqual([
      'meet-staff-and-keys',
      'play-it-back',
      'train-your-ear',
      'scales-and-keys',
      'chords-in-every-key',
      'read-intervals',
      'rhythm-basics',
      'read-sharps-flats-keys',
    ]);
  });
});

describe('the bass clef decks', () => {
  const names = (midis: readonly number[]) => midis.map((m) => m);

  it('holds the bass lines, the bass spaces and every bass note E2 to C4', () => {
    expect(names(DECKS['bass-lines']?.midis ?? [])).toEqual([43, 47, 50, 53, 57]);
    expect(names(DECKS['bass-spaces']?.midis ?? [])).toEqual([45, 48, 52, 55]);
    expect(DECKS['bass-all']?.midis[0]).toBe(40);
    expect(DECKS['bass-all']?.midis.at(-1)).toBe(60);
  });

  it('keeps each bass card on its staff: lines on even steps, spaces on odd, all inside the drawable range', () => {
    for (const m of DECKS['bass-lines']?.midis ?? []) expect(clefStep('bass', m) % 2).toBe(0);
    for (const m of DECKS['bass-spaces']?.midis ?? []) expect(Math.abs(clefStep('bass', m)) % 2).toBe(1);
    for (const id of ['bass-lines', 'bass-spaces', 'bass-all']) {
      for (const c of deckCards(DECKS[id]!)) {
        expect(c.clef).toBe('bass');
        const step = clefStep('bass', c.midi);
        expect(step, c.id).toBeGreaterThanOrEqual(-4);
        expect(step, c.id).toBeLessThanOrEqual(12);
      }
    }
    for (const id of ['bass-lines', 'bass-spaces']) {
      for (const c of deckCards(DECKS[id]!)) {
        const step = clefStep('bass', c.midi);
        expect(step >= 0 && step <= 8, c.id).toBe(true);
      }
    }
  });

  it('deals the grand staff deck A3 to E4, middle C once per staff, each card on its own id', () => {
    const deck = DECKS['grand-middle'];
    expect(deck?.grand).toBe(true);
    const cards = deckCards(deck!);
    expect(cards.map((c) => c.id)).toEqual([
      'grand:bass:57',
      'grand:bass:59',
      'grand:bass:60',
      'grand:treble:60',
      'grand:treble:62',
      'grand:treble:64',
    ]);
    for (const c of cards) {
      expect(c.grand).toBe(true);
      expect(c.midi).toBeGreaterThanOrEqual(57);
      expect(c.midi).toBeLessThanOrEqual(64);
      expect(isKnownCardId(c.id)).toBe(true);
    }
    // Reading middle C on the bass staff is a different card from reading it on the treble.
    const cs = cards.filter((c) => c.midi === 60);
    expect(cs.map((c) => c.clef).sort()).toEqual(['bass', 'treble']);
    expect(new Set(cs.map((c) => c.id)).size).toBe(2);
    // No bass card sits above middle C, and every treble card is middle C or above.
    for (const c of cards) expect(c.clef === 'bass' ? c.midi <= 60 : c.midi >= 60).toBe(true);
  });

  it('shows both middle Cs in a session before repeating either', () => {
    const session = buildSession(DECKS['grand-middle']!, 6, () => 0.3);
    expect(new Set(session.map((c) => c.id)).size).toBe(6);
  });

  it('draws the note finder pool from A2 to E4, naturals only', () => {
    const pool = findNotePool('grand-staff-find', 'piano');
    expect(pool[0]).toBe(GRAND_FIND_LOW);
    expect(pool.at(-1)).toBe(GRAND_FIND_HIGH);
    expect(pool).toEqual([45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64]);
    for (const m of pool) expect([0, 2, 4, 5, 7, 9, 11]).toContain(m % 12);
  });
});
