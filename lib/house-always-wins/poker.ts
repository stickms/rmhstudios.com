// ───────────────────────────────────────────────────────────────────────────
// Five-card draw poker, heads-up vs the house. Pure logic: deck, dealing,
// hand evaluation, a simple-but-sane AI, and showdown comparison. The Poker
// Hall table uses this to let the player gamble their tab down (or deeper).
// ───────────────────────────────────────────────────────────────────────────

export interface Card {
  rank: number; // 2..14 (11=J, 12=Q, 13=K, 14=A)
  suit: number; // 0..3
}

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export const SUIT_RED = [false, true, true, false];

const RANK_LABEL: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function rankLabel(r: number): string {
  return RANK_LABEL[r] ?? String(r);
}

export function cardLabel(c: Card): string {
  return rankLabel(c.rank) + SUITS[c.suit];
}

export const HAND_NAMES = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ rank: r, suit: s });
  // Fisher–Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface HandValue {
  rank: number; // 0..8 (index into HAND_NAMES)
  tiebreak: number[];
}

function ranksDesc(cards: Card[]): number[] {
  return cards.map((c) => c.rank).sort((a, b) => b - a);
}

export function evaluate(cards: Card[]): HandValue {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);

  // ranks ordered by (count desc, rank desc)
  const ordered = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map((e) => e[0]);

  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const distinct = [...counts.keys()].sort((a, b) => a - b);
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[4] - distinct[0] === 4) straightHigh = distinct[4];
    else if (
      distinct[0] === 2 &&
      distinct[1] === 3 &&
      distinct[2] === 4 &&
      distinct[3] === 5 &&
      distinct[4] === 14
    )
      straightHigh = 5; // wheel A-2-3-4-5
  }
  const isStraight = straightHigh > 0;

  const countsSorted = [...counts.values()].sort((a, b) => b - a);

  if (isStraight && isFlush) return { rank: 8, tiebreak: [straightHigh] };
  if (countsSorted[0] === 4) return { rank: 7, tiebreak: ordered };
  if (countsSorted[0] === 3 && countsSorted[1] === 2) return { rank: 6, tiebreak: ordered };
  if (isFlush) return { rank: 5, tiebreak: ranksDesc(cards) };
  if (isStraight) return { rank: 4, tiebreak: [straightHigh] };
  if (countsSorted[0] === 3) return { rank: 3, tiebreak: ordered };
  if (countsSorted[0] === 2 && countsSorted[1] === 2) return { rank: 2, tiebreak: ordered };
  if (countsSorted[0] === 2) return { rank: 1, tiebreak: ordered };
  return { rank: 0, tiebreak: ranksDesc(cards) };
}

// > 0 if a beats b, < 0 if b beats a, 0 tie.
export function compareHands(a: HandValue, b: HandValue): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Decide which cards the AI keeps (true = hold). Reasonable casual heuristic:
// keep made pairs/trips/etc, draw to a 4-flush, otherwise keep high cards.
export function aiHold(hand: Card[]): boolean[] {
  const counts = new Map<number, number>();
  for (const c of hand) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);

  const val = evaluate(hand);
  // Pat hands: keep everything.
  if (val.rank >= 4) return hand.map(() => true);

  // Pairs / trips / two pair / quads: hold the matched cards.
  if (val.rank >= 1) return hand.map((c) => (counts.get(c.rank) ?? 0) >= 2);

  // Four to a flush: hold the suited four.
  const suitCounts = [0, 0, 0, 0];
  for (const c of hand) suitCounts[c.suit]++;
  const flushSuit = suitCounts.findIndex((n) => n === 4);
  if (flushSuit >= 0) return hand.map((c) => c.suit === flushSuit);

  // Otherwise keep cards Jack-or-better; if none, keep the single highest.
  const high = Math.max(...hand.map((c) => c.rank));
  const anyHonor = hand.some((c) => c.rank >= 11);
  if (anyHonor) return hand.map((c) => c.rank >= 11);
  return hand.map((c) => c.rank === high);
}

// Draw replacements for non-held cards from the remaining deck (mutates deck).
export function drawReplacements(hand: Card[], hold: boolean[], deck: Card[]): Card[] {
  return hand.map((c, i) => (hold[i] ? c : (deck.pop() as Card)));
}

export interface Showdown {
  outcome: "win" | "lose" | "tie";
  playerValue: HandValue;
  aiValue: HandValue;
}

export function showdown(playerHand: Card[], aiHand: Card[]): Showdown {
  const pv = evaluate(playerHand);
  const av = evaluate(aiHand);
  const c = compareHands(pv, av);
  return {
    outcome: c > 0 ? "win" : c < 0 ? "lose" : "tie",
    playerValue: pv,
    aiValue: av,
  };
}
