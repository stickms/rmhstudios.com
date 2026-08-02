/**
 * Gabriel's Horn — the rulebook, as constants.
 *
 * Imported by **both** the browser and
 * `server/socket-server/handlers/gabriels-horn.ts`, so every number the rules
 * depend on has exactly one home. Deliberately free of browser and Node
 * imports: the esbuild server bundle pulls this file in verbatim.
 *
 * ── The game in one paragraph ───────────────────────────────────────────────
 * Three dice are rolled at the start of your turn and **you are the one person
 * who cannot see them**. Everyone else can, and everyone else tells you a total
 * — truthfully or not. You pick one of them and call it: truth, or lie. Get it
 * right and they draw; get it wrong and you do. Cards are the currency of
 * failure, and the winner is whoever ends holding the fewest of them, so every
 * card you gain hurts and every card you play costs you one more than it
 * removes. When you think you are lowest you sound the horn and call the End —
 * but everyone else gets one last turn to fix their hand, or to swap it
 * with yours.
 */

export const GAME_ID = 'gabriels-horn';

/** The mirrored name the game wears in-world. "Gabriel's Horn" read backwards. */
export const MIRROR_NAME = 'Nrohsleirbal';

// ─── Table ──────────────────────────────────────────────────────────────────

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

/** Dice rolled at the start of a turn, hidden from the roller alone. */
export const DICE_COUNT = 3;
export const DIE_FACES = 6;
export const MIN_TOTAL = DICE_COUNT;
export const MAX_TOTAL = DICE_COUNT * DIE_FACES;

// ─── Cards ──────────────────────────────────────────────────────────────────

export const STARTING_HAND = 4;

/**
 * A punishment draw. "Draw a card" is never one card: the card you drew brings
 * two more with it, so being caught costs three.
 */
export const PENALTY_DRAW = 3;

/**
 * Playing a card is a discard, and a discard draws two. Net **+1 card** every
 * time you use one — which is the whole tension, because the winner is whoever
 * holds the fewest.
 */
export const PLAY_DRAW = 2;

/**
 * Nobody's hand grows past this. Not a rule anyone plays around — a stop on a
 * pathological table (six players Accusing one person for twenty rounds) so a
 * hand can never grow unbounded in memory or on screen.
 */
export const HAND_LIMIT = 40;

/** Colours carry the effect. Rank carries nothing — except {@link SWAP_RANK}. */
export const COLORS = ['azure', 'crimson', 'verdant', 'amber'] as const;
export type CardColor = (typeof COLORS)[number];

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type CardRank = (typeof RANKS)[number];

/**
 * The one rank that means anything: a seven swaps your whole hand with
 * somebody else's, whatever colour it is.
 */
export const SWAP_RANK = 7;

export interface Card {
  /** Stable within a game; the client references cards by this alone. */
  id: string;
  color: CardColor;
  rank: CardRank;
}

/** What a colour does when the card is played. */
export type CardEffect = 'glimpse' | 'accuse' | 'ward' | 'scry' | 'swap';

export const COLOR_EFFECT: Record<CardColor, Exclude<CardEffect, 'swap'>> = {
  /** Azure — see your own dice this turn. The blindness, bought off for a card. */
  azure: 'glimpse',
  /** Crimson — a player of your choice draws. */
  crimson: 'accuse',
  /** Verdant — nothing can make you draw until your next turn. */
  verdant: 'ward',
  /** Amber — look at a player's hand. Mostly: find out who is holding a seven. */
  amber: 'scry',
};

/** Effects that need somebody pointed at. */
export const TARGETED_EFFECTS: readonly CardEffect[] = ['accuse', 'scry', 'swap'];

export function effectOf(card: Card): CardEffect {
  return card.rank === SWAP_RANK ? 'swap' : COLOR_EFFECT[card.color];
}

export function needsTarget(card: Card): boolean {
  return TARGETED_EFFECTS.includes(effectOf(card));
}

// ─── Clock ──────────────────────────────────────────────────────────────────

/**
 * Every phase is on a timer, because a turn-based game over the internet stalls
 * on one person walking away. Each timeout has a defined, non-punishing outcome
 * (see the handler): claims default to the TRUTH, a call that never comes costs
 * the roller a draw, a final turn that never comes is a pass.
 */
export const PHASE_MS = {
  /** Play cards, then roll or sound the horn. */
  action: 45_000,
  /** Everyone but the roller says a number. */
  claim: 40_000,
  /** The roller picks somebody and calls it. */
  call: 40_000,
  /** Dice face up, claims scored, nothing to do but read it. */
  reveal: 7_000,
  /** One last turn, after the End is called. */
  final: 30_000,
} as const;

export type Phase = keyof typeof PHASE_MS | 'over';

export const COUNTDOWN_SECONDS = 3;

/**
 * How long a seat is held for a player whose socket dropped.
 *
 * A turn here lasts under a minute, so losing the seat on a disconnect would
 * mean a locked phone screen, a tab the OS slept, or four seconds of bad
 * signal costs you the hand you were winning with. The seat, the cards and the
 * place in turn order all survive that window; rejoining reclaims them.
 *
 * The table does NOT wait, which is the other half of the rule: an absent
 * player's turn is skipped immediately rather than burning two minutes of
 * phase timers on somebody who is not there.
 */
export const RECONNECT_GRACE_MS = 90_000;

/**
 * The End cannot be sounded until every player has had a turn. Without it the
 * first player could call it on move one, which is not a bluff — it is just a
 * shorter game (everybody holds four cards, so the caller is never strictly
 * lowest and always loses).
 */
export const MIN_TURNS_BEFORE_END = MIN_PLAYERS;

// ─── Chat ───────────────────────────────────────────────────────────────────

/** Lying out loud is the game; the table needs somewhere to do it. */
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY = 60;

/** How much of the round-by-round record a joining client is handed. */
export const LOG_HISTORY = 40;
