/**
 * Practice: a flashcard session dealt from the learner's remembered cards instead of one lesson's
 * deck — pure.
 *
 * A remembered card is a row of `music_learn_card` (`CardRow`, as the cards API sends it), written
 * only by a Practice review. A session takes the cards that are due, most overdue first
 * (`dueCards`), and tops up to PRACTICE_CARDS with cards the learner has never been asked in
 * Practice, from the decks of the flashcard lessons that have shipped. A card already remembered
 * but not yet due is never dealt early, and no card is dealt twice in one session, so once every
 * card has been seen a session holds only what is due, and may be empty.
 */
import { PATH } from './path';
import { DECKS, cardId, parseCardId, shuffle, type Card, type Deck } from './decks';
import { dueCards, type CardState } from '../srs/schedule';

/** Cards in one Practice session, at most. */
export const PRACTICE_CARDS = 10;

/** One remembered card as the API sends it: its schedule, with times as ISO strings. */
export interface CardRow {
  cardId: string;
  due: string;
  lastReviewAt: string | null;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
}

/**
 * The scheduler's state for a row. An unparseable `due` becomes NaN and an unparseable
 * `lastReviewAt` null; the scheduler repairs both (a reviewed card with no `last` is shown, not
 * hidden), so a bad row is asked again rather than lost.
 */
export function stateFromRow(row: CardRow): CardState {
  const last = row.lastReviewAt === null ? Number.NaN : Date.parse(row.lastReviewAt);
  return {
    due: Date.parse(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    last: Number.isFinite(last) ? last : null,
  };
}

/** The decks of the flashcard lessons that have shipped: where new Practice cards come from. */
export function practiceDecks(): Deck[] {
  const ids = new Set<string>();
  for (const unit of PATH) {
    for (const lesson of unit.lessons) {
      if (lesson.available && lesson.mode === 'staff-flashcards' && lesson.deck) {
        ids.add(lesson.deck);
      }
    }
  }
  return [...ids].flatMap((id) => (DECKS[id] ? [DECKS[id]] : []));
}

/**
 * Deal a Practice session at `now`: the due remembered cards first (most overdue first), then new
 * cards from `decks` in an order shuffled with `rand`, `limit` in all at most. A remembered id no
 * deck knows is skipped; a due card from a deck not in `decks` is still practised (it is a card
 * the learner has met).
 */
export function buildPracticeSession(
  rows: readonly { cardId: string; state: CardState }[],
  decks: readonly Deck[],
  now: number,
  rand: () => number,
  limit: number = PRACTICE_CARDS,
): Card[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const known = rows.filter((r) => parseCardId(r.cardId) !== null);
  const out: Card[] = [];
  const taken = new Set<string>();
  for (const row of dueCards(known, now, max)) {
    if (taken.has(row.cardId)) continue;
    taken.add(row.cardId);
    out.push(parseCardId(row.cardId)!);
  }

  const remembered = new Set(known.map((r) => r.cardId));
  const fresh: Card[] = [];
  for (const deck of decks) {
    for (const midi of deck.midis) {
      const id = cardId(deck.clef, midi);
      if (remembered.has(id) || taken.has(id)) continue;
      taken.add(id);
      fresh.push({ id, clef: deck.clef, midi });
    }
  }
  for (const card of shuffle(fresh, rand)) {
    if (out.length >= max) break;
    out.push(card);
  }
  return out;
}
