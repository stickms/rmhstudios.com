/**
 * GlobeSet's deck, as vectors over the binary finite field.
 *
 * A card is a non-empty subset of six coloured dots. Written as a bitmask that
 * is a vector in **GF(2)^6**, which is the whole game: a *GlobeSet* is a
 * non-empty set of cards whose dots each appear an even number of times, and
 * "each colour an even number of times" is exactly "the XOR of the masks is
 * zero". So the rules, the validator, the hint and the auto-solver are all one
 * linear-algebra question over GF(2) — see `solver.ts`.
 *
 * Two facts the rest of the game leans on, both of which fall out of that:
 *
 * 1. **Any seven cards contain a GlobeSet.** Seven cards have 2^7 - 1 = 127
 *    non-empty subsets but only 2^6 = 64 possible XOR values, so two subsets
 *    share a value and their symmetric difference XORs to zero. The board is
 *    therefore never stuck while it is full.
 * 2. **The deck always clears.** All 63 masks XOR to zero (each colour bit is
 *    set in 32 of them, and 32 is even), and removing a GlobeSet preserves that,
 *    so whatever is left at the end is itself a GlobeSet. A run can never strand
 *    an unsolvable remainder — see `game.ts`.
 *
 * Deliberately free of React, DOM and zod: `server/socket-server/handlers/globeset.ts`
 * imports this file verbatim into the esbuild server bundle.
 */

/** Dots per card — the dimension of the vector space. */
export const COLOR_COUNT = 6;

/** Cards in a full deck: every non-empty subset of the six dots. */
export const DECK_SIZE = (1 << COLOR_COUNT) - 1; // 63

/** Cards face-up at once. Seven is the smallest board that always holds a GlobeSet. */
export const BOARD_SIZE = 7;

/**
 * A card: a bitmask in `1..63`, bit `i` set when dot colour `i` is present.
 * Zero is not a card — a blank would be a one-card GlobeSet and end every game.
 */
export type Card = number;

/**
 * The six dots, in bit order. `token` names the CSS custom property the dot is
 * painted with (`--globeset-dot-red`, …) so the palette lives in `globals.css`
 * with the rest of the theme rather than in a component; `shape` is the
 * redundant encoding that keeps the board playable without colour vision, and
 * `emoji` is what the share card prints.
 */
export interface DotColor {
  /** Bit index, 0–5. */
  bit: number;
  /** Stable id used in class names, share strings and test fixtures. */
  id: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
  /** The `--globeset-dot-*` custom property this dot reads its fill from. */
  token: string;
  /** Shape drawn inside the dot in "distinct shapes" mode (colour-blind aid). */
  shape: 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon' | 'star';
  /** Translation key suffix for the colour's accessible name. */
  nameKey: string;
  emoji: string;
}

export const DOT_COLORS: readonly DotColor[] = [
  { bit: 0, id: 'red', token: '--globeset-dot-red', shape: 'circle', nameKey: 'red', emoji: '🔴' },
  {
    bit: 1,
    id: 'orange',
    token: '--globeset-dot-orange',
    shape: 'triangle',
    nameKey: 'orange',
    emoji: '🟠',
  },
  {
    bit: 2,
    id: 'yellow',
    token: '--globeset-dot-yellow',
    shape: 'square',
    nameKey: 'yellow',
    emoji: '🟡',
  },
  {
    bit: 3,
    id: 'green',
    token: '--globeset-dot-green',
    shape: 'diamond',
    nameKey: 'green',
    emoji: '🟢',
  },
  {
    bit: 4,
    id: 'blue',
    token: '--globeset-dot-blue',
    shape: 'hexagon',
    nameKey: 'blue',
    emoji: '🔵',
  },
  {
    bit: 5,
    id: 'purple',
    token: '--globeset-dot-purple',
    shape: 'star',
    nameKey: 'purple',
    emoji: '🟣',
  },
] as const;

/** Every card in the deck, ascending. Order is a starting point, never the deal. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (let mask = 1; mask <= DECK_SIZE; mask++) deck.push(mask);
  return deck;
}

/** True when `value` is a legal card. Used to validate anything off the wire. */
export function isCard(value: unknown): value is Card {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= DECK_SIZE;
}

/** The dots on a card, in bit order. */
export function dotsOf(card: Card): DotColor[] {
  return DOT_COLORS.filter((c) => (card & (1 << c.bit)) !== 0);
}

/** How many dots a card carries (its Hamming weight). */
export function dotCount(card: Card): number {
  let n = 0;
  for (let bit = 0; bit < COLOR_COUNT; bit++) if (card & (1 << bit)) n++;
  return n;
}

/** XOR-fold a set of cards. Zero means "every colour appears an even number of times". */
export function xorAll(cards: readonly Card[]): number {
  let acc = 0;
  for (const card of cards) acc ^= card;
  return acc;
}

/**
 * Is this selection a GlobeSet?
 *
 * Non-empty, all cards distinct, and XOR zero. Distinctness matters because a
 * client could otherwise submit the same card twice and satisfy the XOR test
 * with a pair — the server checks this on every submission.
 */
export function isGlobeSet(cards: readonly Card[]): boolean {
  if (cards.length === 0) return false;
  const seen = new Set<Card>();
  for (const card of cards) {
    if (!isCard(card) || seen.has(card)) return false;
    seen.add(card);
  }
  return xorAll(cards) === 0;
}

/**
 * The per-colour parity of a selection, for the board's live "dot ledger".
 * `true` = that colour currently appears an odd number of times, i.e. the
 * selection is not a GlobeSet yet and this is one of the reasons why.
 */
export function colorParity(cards: readonly Card[]): boolean[] {
  const acc = xorAll(cards);
  return DOT_COLORS.map((c) => (acc & (1 << c.bit)) !== 0);
}
