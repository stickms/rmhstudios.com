/**
 * Gabriel's Horn — the deck.
 *
 * Pure, dependency-free, and shared with the socket handler (which is why it is
 * its own file rather than part of the client store): 52 cards, four colours ×
 * thirteen ranks, no jokers. Ranks exist so a seven can exist; nothing else
 * reads them.
 *
 * The shuffle takes its randomness as an argument rather than reaching for
 * `Math.random` itself, so a test can hand it a deterministic source.
 */

import { COLORS, RANKS, type Card } from './constants';

/** A fresh, ordered deck. Ids are positional and stable for the life of a game. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let n = 0;
  for (const color of COLORS) {
    for (const rank of RANKS) {
      deck.push({ id: `c${n++}`, color, rank });
    }
  }
  return deck;
}

/**
 * Fisher-Yates, in place, returning the same array for convenience.
 *
 * `random` must return `[0, 1)` — `Math.random` on the server, a seeded source
 * in tests.
 */
export function shuffle(cards: Card[], random: () => number = Math.random): Card[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/**
 * Sort a hand the way a player would hold it: by colour, then rank, with the
 * sevens pulled to the front of their colour because they are the only rank
 * anyone is looking for.
 */
export function sortHand(cards: readonly Card[]): Card[] {
  const colorIndex = (card: Card): number => COLORS.indexOf(card.color);
  return [...cards].sort((a, b) => {
    if (a.color !== b.color) return colorIndex(a) - colorIndex(b);
    return a.rank - b.rank;
  });
}
