import { describe, expect, it } from 'vitest';
import { DAY_MS, newCard, review, type CardState } from '../srs/schedule';
import { DECKS, cardId, voiceDeck } from './decks';
import {
  PRACTICE_CARDS,
  buildPracticeSession,
  buildWeakSession,
  hasDueReviewedCard,
  newCardsIntroduced,
  newCardsLeft,
  practiceAvailable,
  practiceDecks,
  stateFromRow,
  type CardRow,
} from './practice';

/** mulberry32, so a failing deal can be replayed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = Date.UTC(2026, 10, 9, 12);

/** A card reviewed once with `good` at `at` (so due a couple of days later). */
function seen(
  id: string,
  at: number,
): {
  cardId: string;
  state: CardState;
} {
  return {
    cardId: id,
    state: review(newCard(at), 'good', at),
  };
}

const decks = practiceDecks();
const pool = new Set(decks.flatMap((d) => d.midis.map((m) => cardId(d.clef, m))));

describe('practiceDecks', () => {
  it('is the decks of the shipped flashcard lessons', () => {
    expect(decks.map((d) => d.id).sort()).toEqual(['middle-c', 'treble-all', 'treble-lines']);
  });
});

describe('buildPracticeSession', () => {
  it('deals ten new cards from the unlocked decks when nothing is remembered', () => {
    const cards = buildPracticeSession([], decks, NOW, seeded(1));
    expect(cards).toHaveLength(PRACTICE_CARDS);
    expect(new Set(cards.map((c) => c.id)).size).toBe(PRACTICE_CARDS);
    for (const c of cards) expect(pool.has(c.id)).toBe(true);
  });

  it('puts due cards first, most overdue first, then tops up with new ones', () => {
    const rows = [
      seen('treble:64', NOW - 10 * DAY_MS), // due ~8 days ago
      seen('treble:67', NOW - 30 * DAY_MS), // due ~28 days ago: most overdue
      seen('treble:71', NOW), // not due
    ];
    const cards = buildPracticeSession(rows, decks, NOW, seeded(2));
    expect(cards.slice(0, 2).map((c) => c.id)).toEqual(['treble:67', 'treble:64']);
    expect(cards).toHaveLength(PRACTICE_CARDS);
    const rest = cards.slice(2).map((c) => c.id);
    // The top-up is new cards only: never one already remembered (due or not).
    for (const id of rest) expect(['treble:64', 'treble:67', 'treble:71']).not.toContain(id);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
  });

  it('caps at ten even when more are due', () => {
    const rows = [...pool].map((id) => seen(id, NOW - 30 * DAY_MS));
    const cards = buildPracticeSession(rows, decks, NOW, seeded(3));
    expect(cards).toHaveLength(PRACTICE_CARDS);
    expect(new Set(cards.map((c) => c.id)).size).toBe(PRACTICE_CARDS);
  });

  it('is short (or empty) when every card is remembered and few are due', () => {
    const rows = [...pool].map((id) => seen(id, NOW));
    expect(buildPracticeSession(rows, decks, NOW, seeded(4))).toEqual([]);
    rows[0] = seen(rows[0].cardId, NOW - 30 * DAY_MS);
    expect(buildPracticeSession(rows, decks, NOW, seeded(4)).map((c) => c.id)).toEqual([rows[0].cardId]);
  });

  it('skips a remembered id no deck knows, and a remembered card from a locked deck tops up nothing', () => {
    const rows = [seen('treble:61', NOW - 30 * DAY_MS), seen('bass:40', NOW - 30 * DAY_MS)];
    const cards = buildPracticeSession(rows, decks, NOW, seeded(5));
    expect(cards.map((c) => c.id)).not.toContain('treble:61');
    // A due card is practised whatever deck it came from (it is a known card).
    expect(cards[0].id).toBe('bass:40');
    expect(cards).toHaveLength(PRACTICE_CARDS);
  });

  it('is deterministic for an injected rand', () => {
    const a = buildPracticeSession([], decks, NOW, seeded(7)).map((c) => c.id);
    const b = buildPracticeSession([], decks, NOW, seeded(7)).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('respects a smaller limit', () => {
    expect(buildPracticeSession([], decks, NOW, seeded(8), 3)).toHaveLength(3);
    expect(buildPracticeSession([], [DECKS['treble-lines']], NOW, seeded(8), 50)).toHaveLength(5);
  });
});

describe('stateFromRow', () => {
  it('turns ISO times back into epoch ms', () => {
    const s = stateFromRow({
      cardId: 'treble:64',
      due: new Date(NOW).toISOString(),
      lastReviewAt: null,
      stability: 0,
      difficulty: 5,
      reps: 0,
      lapses: 0,
    });
    expect(s).toEqual({
      ...newCard(NOW),
    });
  });
  it('maps an unparseable time to NaN for the scheduler to repair, never throws', () => {
    const s = stateFromRow({
      cardId: 'treble:64',
      due: 'nope',
      lastReviewAt: 'nope',
      stability: 1,
      difficulty: 5,
      reps: 1,
      lapses: 0,
    });
    expect(Number.isNaN(s.due)).toBe(true);
    expect(s.last).toBeNull();
  });
});

describe('hasDueReviewedCard', () => {
  const row = (patch: Partial<CardRow>): CardRow => ({
    cardId: 'treble:64',
    due: new Date(NOW - DAY_MS).toISOString(),
    lastReviewAt: new Date(NOW - 3 * DAY_MS).toISOString(),
    stability: 2,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    ...patch,
  });
  it('is true only for a reviewed, known card that is due', () => {
    expect(hasDueReviewedCard([], NOW)).toBe(false);
    expect(hasDueReviewedCard([row({})], NOW)).toBe(true);
    expect(
      hasDueReviewedCard(
        [
          row({
            due: new Date(NOW + DAY_MS).toISOString(),
          }),
        ],
        NOW,
      ),
    ).toBe(false);
    expect(
      hasDueReviewedCard(
        [
          row({
            reps: 0,
          }),
        ],
        NOW,
      ),
    ).toBe(false);
    expect(
      hasDueReviewedCard(
        [
          row({
            cardId: 'treble:61',
          }),
        ],
        NOW,
      ),
    ).toBe(false);
  });
});

describe('practiceAvailable (the home link)', () => {
  const done = [
    {
      lessonId: 'staff-what-is-a-staff',
      completedAt: new Date(NOW).toISOString(),
    },
  ];
  const notDone = [
    {
      lessonId: 'staff-what-is-a-staff',
      completedAt: null,
    },
  ];
  const row = (patch: Partial<CardRow>): CardRow => ({
    cardId: 'treble:64',
    due: new Date(NOW + 30 * DAY_MS).toISOString(),
    lastReviewAt: new Date(NOW).toISOString(),
    stability: 30,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    ...patch,
  });

  it('is hidden until a flashcard lesson is finished, though no row exists yet', () => {
    expect(practiceAvailable([], [], NOW)).toBe(false);
    expect(practiceAvailable([], notDone, NOW)).toBe(false);
    // First-note is not a flashcard lesson.
    expect(
      practiceAvailable(
        [],
        [
          {
            lessonId: 'play-first-note',
            completedAt: 'x',
          },
        ],
        NOW,
      ),
    ).toBe(false);
  });

  it('appears after a flashcard lesson, because new cards are waiting', () => {
    expect(practiceAvailable([], done, NOW)).toBe(true);
  });

  it('appears when a reviewed card is due, with or without a finished lesson', () => {
    const due = row({
      due: new Date(NOW - DAY_MS).toISOString(),
    });
    expect(practiceAvailable([due], [], NOW)).toBe(true);
    expect(practiceAvailable([due], done, NOW)).toBe(true);
  });

  it('goes away once every shipped card is remembered and none is due', () => {
    const all = practiceDecks().flatMap((d) => d.midis.map((m) => cardId(d.clef, m)));
    const rows = [...new Set(all)].map((id) =>
      row({
        cardId: id,
      }),
    );
    expect(practiceAvailable(rows, done, NOW)).toBe(false);
    // ...and returns as soon as one comes due.
    rows[0] = row({
      cardId: rows[0].cardId,
      due: new Date(NOW - 1).toISOString(),
    });
    expect(practiceAvailable(rows, done, NOW)).toBe(true);
  });
});

describe('Practice for singers (the voice path)', () => {
  it('deals a singer new cards from their range’s deck, not the piano and guitar decks', () => {
    expect(practiceDecks('voice', 'tenor')).toEqual([voiceDeck('tenor')]);
    expect(practiceDecks('voice', 'bass')).toEqual([voiceDeck('bass')]);
    // Piano and guitar keep the shipped decks of their path.
    expect(practiceDecks('piano')).toEqual(practiceDecks());
    expect(practiceDecks('guitar', null)).toEqual(practiceDecks());
  });

  it('has no new cards for a singer who has not chosen a range (never assumed alto)', () => {
    expect(practiceDecks('voice', null)).toEqual([]);
  });

  it('the home link follows the same decks: a singer with every range card remembered sees none', () => {
    const done = [
      {
        lessonId: 'voice-staff-notes',
        completedAt: new Date(NOW).toISOString(),
      },
    ];
    expect(practiceAvailable([], done, NOW, 'voice', 'soprano')).toBe(true);
    const soprano = voiceDeck('soprano');
    const remembered: CardRow[] = soprano.midis.map((midi) => ({
      cardId: cardId(soprano.clef, midi),
      due: new Date(NOW + 30 * DAY_MS).toISOString(),
      lastReviewAt: new Date(NOW).toISOString(),
      stability: 30,
      difficulty: 5,
      reps: 3,
      lapses: 0,
    }));
    // Every soprano card is remembered and none is due: nothing to deal for a soprano, though the
    // piano decks still hold unseen cards.
    expect(practiceAvailable(remembered, done, NOW, 'voice', 'soprano')).toBe(false);
    expect(practiceAvailable(remembered, done, NOW, 'piano')).toBe(true);
  });
});

describe('the new-card allowance', () => {
  const HOUR = 3_600_000;
  const row = (cardId: string, reps: number, hoursAgo: number | null): CardRow => ({
    cardId,
    due: new Date(NOW + DAY_MS).toISOString(),
    lastReviewAt: hoursAgo === null ? null : new Date(NOW - hoursAgo * HOUR).toISOString(),
    stability: reps > 0 ? 2 : 0,
    difficulty: 5,
    reps,
    lapses: 0,
  });

  it('counts the cards first met in the last 24 hours, and only those', () => {
    const rows = [
      row('treble:64', 1, 2), // met 2 h ago
      row('treble:67', 1, 23), // 23 h ago
      row('treble:71', 1, 25), // yesterday
      row('treble:72', 2, 1), // reviewed again: no longer "new"
      row('treble:74', 0, null), // never reviewed
      row('ear:interval:third', 1, 1), // not a staff card
    ];
    expect(newCardsIntroduced(rows, NOW)).toBe(2);
  });

  it('leaves what the allowance has not used, never below zero', () => {
    const rows = [row('treble:64', 1, 1), row('treble:67', 1, 2)];
    expect(newCardsLeft(rows, NOW, 10)).toBe(8);
    expect(newCardsLeft(rows, NOW, 2)).toBe(0);
    expect(newCardsLeft(rows, NOW, 1)).toBe(0);
    expect(newCardsLeft(rows, NOW, 0)).toBe(0);
    expect(newCardsLeft(rows, NOW, Number.NaN)).toBe(0);
  });

  it('caps only the new cards in a session, never the due ones', () => {
    const due = [seen('treble:64', NOW - 10 * DAY_MS), seen('treble:67', NOW - 30 * DAY_MS)];
    const capped = buildPracticeSession(due, decks, NOW, seeded(3), PRACTICE_CARDS, 3);
    expect(capped).toHaveLength(2 + 3);
    expect(capped.slice(0, 2).map((c) => c.id)).toEqual(['treble:67', 'treble:64']);
    const none = buildPracticeSession(due, decks, NOW, seeded(3), PRACTICE_CARDS, 0);
    expect(none.map((c) => c.id)).toEqual(['treble:67', 'treble:64']);
    expect(buildPracticeSession([], decks, NOW, seeded(3), PRACTICE_CARDS, 0)).toEqual([]);
  });

  it('deals as before when no allowance is given', () => {
    expect(buildPracticeSession([], decks, NOW, seeded(1))).toHaveLength(PRACTICE_CARDS);
    expect(buildPracticeSession([], decks, NOW, seeded(1), PRACTICE_CARDS, Number.POSITIVE_INFINITY)).toHaveLength(
      PRACTICE_CARDS,
    );
  });

  it('hides the Practice link for a learner with nothing due and no allowance left', () => {
    const progress = [{ lessonId: 'staff-treble-notes', completedAt: '2026-11-01T00:00:00Z' }];
    expect(practiceAvailable([], progress, NOW, 'piano', null)).toBe(true);
    expect(practiceAvailable([], progress, NOW, 'piano', null, 0)).toBe(false);
    expect(practiceAvailable([], progress, NOW, 'piano', null, 5)).toBe(true);
  });
});

describe('buildWeakSession', () => {
  const state = (stability: number, daysAgo: number, lapses = 0) => ({
    due: NOW + DAY_MS,
    stability,
    difficulty: 5,
    reps: 3,
    lapses,
    last: NOW - daysAgo * DAY_MS,
  });

  it('is the reviewed staff cards least likely to be recalled now, due or not, weakest first', () => {
    const rows = [
      { cardId: 'treble:64', state: state(30, 1) }, // strong
      { cardId: 'treble:67', state: state(2, 6) }, // weak
      { cardId: 'treble:71', state: state(10, 5) },
      { cardId: 'treble:72', state: newCard(NOW) }, // never reviewed: new, not weak
      { cardId: 'ear:interval:third', state: state(1, 9) }, // not a staff card
    ];
    expect(buildWeakSession(rows, NOW, 2).map((c) => c.id)).toEqual(['treble:67', 'treble:71']);
    expect(buildWeakSession(rows, NOW, 10).map((c) => c.id)).toEqual(['treble:67', 'treble:71', 'treble:64']);
  });

  it('breaks a tie by the card missed most', () => {
    const a = state(4, 4, 0);
    const b = state(4, 4, 3);
    expect(
      buildWeakSession(
        [
          { cardId: 'treble:64', state: a },
          { cardId: 'treble:67', state: b },
        ],
        NOW,
      ).map((c) => c.id),
    ).toEqual(['treble:67', 'treble:64']);
  });

  it('is empty for a new learner, and for a limit of 0 or nonsense', () => {
    expect(buildWeakSession([], NOW)).toEqual([]);
    expect(buildWeakSession([{ cardId: 'treble:64', state: state(5, 2) }], NOW, 0)).toEqual([]);
    expect(buildWeakSession([{ cardId: 'treble:64', state: state(5, 2) }], NOW, Number.NaN)).toEqual([]);
  });
});
