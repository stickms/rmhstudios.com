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
import { VOICE_RANGE_DECK, getLesson, pathFor } from './path';
import { DECKS, deckCards, parseCardId, shuffle, voiceDeck, type Card, type Deck } from './decks';
import type { Instrument, VoiceRange } from '../schemas';
import { isVoiceRange } from '../voice/range';
import { dueCards, recallChance, type CardState } from '../srs/schedule';

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

/** The ids of the lessons a learner has completed, from the progress rows the API sends. */
export function completedLessonIds(
  progress: readonly { lessonId: string; completedAt: string | null }[],
): ReadonlySet<string> {
  return new Set(progress.filter((p) => p.completedAt !== null).map((p) => p.lessonId));
}

/**
 * The decks of the flashcard lessons that have shipped on the learner's path: where new Practice
 * cards come from. A singer's path (`pathFor('voice')`) has one, their range's deck; with no range
 * chosen yet there is none (a range is never assumed). Piano and guitar share the main path.
 */
export function practiceDecks(
  instrument: Instrument = 'piano',
  range?: VoiceRange | null,
  /**
   * The ids of the lessons the learner has completed. A lesson marked `practiceWhenDone` (sharps, flats
   * and keys) puts its deck into Practice only once it is in this set, so a beginner who has only met
   * the lines and spaces is never dealt a key-signature card. Absent, those decks stay out.
   */
  completed: ReadonlySet<string> = new Set(),
): Deck[] {
  const ids = new Set<string>();
  for (const unit of pathFor(instrument)) {
    for (const lesson of unit.lessons) {
      if (lesson.available && lesson.mode === 'staff-flashcards' && lesson.deck) {
        if (lesson.practiceWhenDone && !completed.has(lesson.id)) continue;
        ids.add(lesson.deck);
      }
    }
  }
  return [...ids].flatMap((id) => {
    if (id === VOICE_RANGE_DECK) return isVoiceRange(range) ? [voiceDeck(range)] : [];
    const deck = DECKS[id];
    return deck ? [deck] : [];
  });
}

/**
 * Deal a Practice session at `now`: the due remembered cards first (most overdue first), then new
 * cards from `decks` in an order shuffled with `rand`, `limit` in all at most. A remembered id no
 * deck knows is skipped; a due card from a deck not in `decks` is still practised (it is a card
 * the learner has met).
 *
 * `newLimit` caps only the NEW cards (never-asked ones) the session may introduce: the learner's
 * allowance left today (`newCardsLeft`). Due cards are never capped, so a learner with a backlog
 * and an allowance of 0 still gets their reviews. Absent, new cards are limited only by `limit`.
 */
export function buildPracticeSession(
  rows: readonly {
    cardId: string;
    state: CardState;
  }[],
  decks: readonly Deck[],
  now: number,
  rand: () => number,
  limit: number = PRACTICE_CARDS,
  newLimit?: number,
): Card[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const allowance =
    newLimit === undefined || newLimit === Infinity
      ? Infinity
      : Number.isFinite(newLimit)
        ? Math.max(0, Math.floor(newLimit))
        : 0;
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
    for (const card of deckCards(deck)) {
      if (remembered.has(card.id) || taken.has(card.id)) continue;
      taken.add(card.id);
      fresh.push(card);
    }
  }
  let introduced = 0;
  for (const card of shuffle(fresh, rand)) {
    if (out.length >= max || introduced >= allowance) break;
    out.push(card);
    introduced += 1;
  }
  return out;
}

/** The window "a day" means for the new-card allowance: the last 24 hours, not the calendar day. */
export const NEW_CARD_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How many staff cards the learner met for the first time in the last 24 hours. The table has no
 * creation time, so this is read from what a first review leaves: exactly one review, made inside
 * the window. (A card that has since been reviewed again is no longer counted, so the figure can
 * only fall as the learner practises; the allowance it feeds errs toward giving a little more.)
 */
export function newCardsIntroduced(rows: readonly CardRow[], now: number): number {
  let n = 0;
  for (const r of rows) {
    if (r.reps !== 1 || r.lastReviewAt === null || parseCardId(r.cardId) === null) continue;
    const at = Date.parse(r.lastReviewAt);
    if (Number.isFinite(at) && now - at >= 0 && now - at < NEW_CARD_WINDOW_MS) n += 1;
  }
  return n;
}

/** The new cards Practice may still introduce today: the allowance less what the last 24 hours used. */
export function newCardsLeft(rows: readonly CardRow[], now: number, newPerDay: number): number {
  const perDay = Number.isFinite(newPerDay) ? Math.max(0, Math.floor(newPerDay)) : 0;
  return Math.max(0, perDay - newCardsIntroduced(rows, now));
}

/**
 * A "weak spots" session: the `limit` reviewed staff cards the learner is least likely to recall
 * right now (FSRS retrievability, lowest first; a card missed more often first among equals), due
 * or not. Never-reviewed cards are not weak spots, they are new. Reviewing them in Practice saves
 * normal reviews, so a card drilled early simply gets a fresh, longer schedule.
 */
export function buildWeakSession(
  rows: readonly {
    cardId: string;
    state: CardState;
  }[],
  now: number,
  limit: number = PRACTICE_CARDS,
): Card[] {
  const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const seen = new Set<string>();
  const ranked: { card: Card; recall: number; lapses: number; stability: number }[] = [];
  for (const row of rows) {
    const card = parseCardId(row.cardId);
    if (card === null || seen.has(row.cardId)) continue;
    const recall = recallChance(row.state, now);
    if (recall === null) continue;
    seen.add(row.cardId);
    ranked.push({ card, recall, lapses: row.state.lapses, stability: row.state.stability });
  }
  ranked.sort((a, b) => a.recall - b.recall || b.lapses - a.lapses || a.stability - b.stability);
  return ranked.slice(0, max).map((r) => r.card);
}

/**
 * Whether at least one card the learner has reviewed is due at `now` (the home's Practice link).
 * A never-reviewed row, or one no deck knows, does not count: new cards are always available, so
 * they would show the link for ever.
 */
export function hasDueReviewedCard(rows: readonly CardRow[], now: number): boolean {
  const reviewed = rows
    .filter((r) => r.reps > 0 && parseCardId(r.cardId) !== null)
    .map((r) => ({
      state: stateFromRow(r),
    }));
  return dueCards(reviewed, now, 1).length > 0;
}

/**
 * Whether the home shows its Practice link: a card the learner reviewed is due, or they have
 * finished a flashcard lesson and Practice would still deal at least one card (a new one from the
 * shipped decks, or one that is due). Rows are only written by Practice itself, so without the
 * second case the link could never appear for a learner who has not already found the page; and
 * once every card has been seen and none is due, the link goes away rather than leading to an
 * empty sheet.
 */
export function practiceAvailable(
  rows: readonly CardRow[],
  progress: readonly {
    lessonId: string;
    completedAt: string | null;
  }[],
  now: number,
  instrument: Instrument = 'piano',
  range?: VoiceRange | null,
  newPerDay?: number,
): boolean {
  if (hasDueReviewedCard(rows, now)) return true;
  const metFlashcards = progress.some(
    (p) => p.completedAt !== null && getLesson(p.lessonId)?.mode === 'staff-flashcards',
  );
  if (!metFlashcards) return false;
  const remembered = rows.map((r) => ({
    cardId: r.cardId,
    state: stateFromRow(r),
  }));
  // With an allowance (`newPerDay`), a day that has used it up leaves Practice with nothing new to deal.
  const newLimit = newPerDay === undefined ? undefined : newCardsLeft(rows, now, newPerDay);
  return (
    buildPracticeSession(
      remembered,
      practiceDecks(instrument, range, completedLessonIds(progress)),
      now,
      () => 0,
      1,
      newLimit,
    ).length > 0
  );
}
