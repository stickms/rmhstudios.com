import { describe, expect, it } from 'vitest';
import { DECKS, deckCards, isKnownCardId } from './decks';
import { PATH, VOICE_PATH, getLesson } from './path';
import { buildPracticeSession, completedLessonIds, practiceAvailable, practiceDecks } from './practice';
import { isPlayable } from './routing';
import { newCard, review } from '../srs/schedule';

const SPELLED = ['staff-sharps-flats', 'staff-sharps-flats-bass', 'staff-keys-sharps', 'staff-keys-flats'] as const;
const DECK_OF = {
  'staff-sharps-flats': 'accidentals-treble',
  'staff-sharps-flats-bass': 'accidentals-bass',
  'staff-keys-sharps': 'keys-sharps',
  'staff-keys-flats': 'keys-flats',
} as const;
const NOW = Date.UTC(2026, 10, 22, 12);

describe('the sharps, flats and keys lessons', () => {
  it('are staff-flashcard lessons on the piano and guitar path, each with its own spelled deck, and playable', () => {
    for (const id of SPELLED) {
      const lesson = getLesson(id);
      expect(lesson?.mode, id).toBe('staff-flashcards');
      expect(lesson?.deck, id).toBe(DECK_OF[id]);
      expect(lesson?.unit, id).toBe('read-sharps-flats-keys');
      expect(isPlayable(lesson), id).toBe(true);
      expect(DECKS[DECK_OF[id]], id).toBeDefined();
    }
  });

  it('sit in one unit at the end of the piano and guitar path, and not on the singer’s path', () => {
    const ids = PATH.map((u) => u.id);
    expect(ids.indexOf('read-sharps-flats-keys')).toBe(ids.length - 1);
    expect(ids.indexOf('read-sharps-flats-keys')).toBeGreaterThan(ids.indexOf('scales-and-keys'));
    expect(VOICE_PATH.some((u) => u.id === 'read-sharps-flats-keys')).toBe(false);
  });

  it('only deal ids the server accepts', () => {
    for (const id of SPELLED) {
      for (const c of deckCards(DECKS[DECK_OF[id]])) expect(isKnownCardId(c.id), c.id).toBe(true);
    }
  });
});

describe('Practice and the new decks', () => {
  const all = new Set(SPELLED.map((id) => DECK_OF[id]));
  const ids = (decks: { id: string }[]) => decks.map((d) => d.id);

  it('keeps every spelled deck out of Practice until its lesson is completed', () => {
    const none = ids(practiceDecks('piano', null, new Set()));
    for (const deck of all) expect(none, deck).not.toContain(deck);
    // With no `completed` argument at all (an older caller), the same.
    for (const deck of all) expect(ids(practiceDecks('piano')), deck).not.toContain(deck);
  });

  it('lets in exactly the decks whose lesson is done', () => {
    const decks = ids(practiceDecks('piano', null, new Set(['staff-keys-sharps', 'staff-sharps-flats'])));
    expect(decks).toContain('keys-sharps');
    expect(decks).toContain('accidentals-treble');
    expect(decks).not.toContain('keys-flats');
    expect(decks).not.toContain('accidentals-bass');
  });

  it('never changes the decks a beginner already has', () => {
    const before = ids(practiceDecks('piano', null, new Set()));
    expect(before).toEqual(expect.arrayContaining(['treble-lines', 'treble-all', 'middle-c']));
    expect(before).not.toContain('bass-all'); // no lesson uses it: unchanged
  });

  it('keeps a singer’s Practice to their range’s deck', () => {
    expect(ids(practiceDecks('voice', 'alto', new Set(SPELLED)))).toEqual(['voice-alto']);
  });

  it('deals a spelled card once its lesson is done, and never to a beginner', () => {
    const rand = () => 0.5;
    const beginner = buildPracticeSession([], practiceDecks('piano', null, new Set()), NOW, rand, 200);
    expect(beginner.some((c) => c.accidental !== undefined || c.key !== undefined)).toBe(false);
    const learner = buildPracticeSession([], practiceDecks('piano', null, new Set(SPELLED)), NOW, rand, 400);
    expect(learner.some((c) => c.accidental !== undefined)).toBe(true);
    expect(learner.some((c) => c.key !== undefined)).toBe(true);
  });

  it('brings back a remembered spelled card when it is due, even with its lesson state unknown', () => {
    const id = 'key:G:treble:66';
    const state = review(newCard(NOW - 10 * 86_400_000), 'good', NOW - 10 * 86_400_000);
    const dealt = buildPracticeSession([{ cardId: id, state }], [], NOW, () => 0, 10);
    expect(dealt.map((c) => c.id)).toEqual([id]);
    expect(dealt[0]).toMatchObject({ key: 'G', midi: 66, written: 65 });
  });

  it('counts the learner’s completed lessons from the progress rows', () => {
    expect(
      completedLessonIds([
        { lessonId: 'staff-keys-flats', completedAt: '2026-11-20T00:00:00.000Z' },
        { lessonId: 'staff-sharps-flats', completedAt: null },
      ]),
    ).toEqual(new Set(['staff-keys-flats']));
  });

  it('offers Practice with a spelled deck only to a learner who has met flashcards and finished that lesson', () => {
    const met = [{ lessonId: 'staff-what-is-a-staff', completedAt: '2026-11-20T00:00:00.000Z' }];
    expect(practiceAvailable([], met, NOW, 'piano')).toBe(true);
    expect(practiceAvailable([], [], NOW, 'piano')).toBe(false);
  });
});
