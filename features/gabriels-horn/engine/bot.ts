/**
 * Gabriel's Horn — the computer player's mind.
 *
 * Pure and client-safe: no Node, no browser, no clock, no `Math.random`. The
 * server handler owns the timers and feeds this one seat's view in.
 *
 * ── The fairness rule ───────────────────────────────────────────────────────
 * {@link decideBotAction} takes exactly four things: the {@link GameView} of the
 * bot's OWN seat (the same `viewFor` output a person gets), the house rules, a
 * level and a random source. It cannot read `lobby.dice`, `lobby.deck` or
 * another seat's hand because none of them is an input. When the bot is rolling
 * its own dice arrive as `null`, as they do for a person, and it plays the round
 * blind. The one table-wide record it reads is the public log every player
 * already sees.
 *
 * ── The levels ──────────────────────────────────────────────────────────────
 * **Easy** claims the truth 70% of the time and otherwise a random total, calls
 * at random, and spends a card only on a Verdant ward. **Steady** claims totals
 * that are likely under the dice distribution, calls the claim least likely to
 * be true, plays Verdant when its hand is the smallest and sounds the horn when
 * it holds no more cards than anyone. **Sharp** adds the public log: it weighs
 * how often each seat has been caught lying this game and uses Azure, Amber,
 * Crimson and the seven's swap when the card counts favour it.
 */

import { COLOR_EFFECT, DIE_FACES, SWAP_RANK, type BotLevel, type Card, type CardEffect } from './constants';
import type { HouseRules } from './house-rules';
import type { GameView, TablePlayer } from './net/events';

/** One thing a bot can do. Each maps onto exactly one client event. */
export type BotAction =
  | { type: 'play'; cardId: string; targetSocketId?: string }
  | { type: 'roll' }
  | { type: 'end' }
  | { type: 'pass' }
  | { type: 'claim'; total: number }
  | { type: 'call'; targetSocketId: string; verdict: 'truth' | 'lie' };

/** A random source in [0, 1). The handler passes `Math.random`; tests pass a seeded one. */
export type Rng = () => number;

// ─── Small helpers ──────────────────────────────────────────────────────────

function pickInt(rng: Rng, count: number): number {
  return Math.min(count - 1, Math.floor(rng() * count));
}

function pickOne<T>(rng: Rng, list: readonly T[]): T {
  return list[pickInt(rng, list.length)] as T;
}

const distributions = new Map<number, number[]>();

/** P(total) for `count` fair dice, indexed by total. Index 0..count-1 are zero. */
export function totalOdds(count: number): number[] {
  const cached = distributions.get(count);
  if (cached) return cached;
  let ways: number[] = [1];
  for (let die = 0; die < count; die++) {
    const next = new Array<number>(ways.length + DIE_FACES).fill(0);
    ways.forEach((w, total) => {
      for (let face = 1; face <= DIE_FACES; face++) next[total + face] = (next[total + face] ?? 0) + w;
    });
    ways = next;
  }
  const sum = ways.reduce((a, b) => a + b, 0);
  const odds = ways.map((w) => w / sum);
  distributions.set(count, odds);
  return odds;
}

/** Draw a total from the dice distribution, never `avoid`. */
function sampleTotal(rules: HouseRules, rng: Rng, avoid: number | null): number {
  const low = rules.diceCount;
  const high = rules.diceCount * DIE_FACES;
  const odds = totalOdds(rules.diceCount);
  let mass = 0;
  for (let total = low; total <= high; total++) if (total !== avoid) mass += odds[total] ?? 0;
  let roll = rng() * mass;
  let last = low;
  for (let total = low; total <= high; total++) {
    if (total === avoid) continue;
    last = total;
    roll -= odds[total] ?? 0;
    if (roll <= 0) return total;
  }
  return last;
}

/** What a card does at THIS table, or `null` when a house rule switched it off. */
export function effectFor(card: Card, rules: HouseRules): CardEffect | null {
  if (card.rank === SWAP_RANK && rules.swapEnabled) return 'swap';
  if (!rules.effects[card.color]) return null;
  return COLOR_EFFECT[card.color];
}

function firstWith(view: GameView, rules: HouseRules, effect: CardEffect): Card | null {
  return view.hand.find((card) => effectFor(card, rules) === effect) ?? null;
}

function selfOf(view: GameView): TablePlayer | null {
  return view.players.find((p) => p.socketId === view.selfSocketId) ?? null;
}

function rivalsOf(view: GameView): TablePlayer[] {
  return view.players.filter((p) => p.socketId !== view.selfSocketId);
}

function lowestRival(view: GameView): TablePlayer | null {
  let best: TablePlayer | null = null;
  for (const rival of rivalsOf(view)) if (!best || rival.handCount < best.handCount) best = rival;
  return best;
}

/**
 * Turns the table has taken, estimated from what a seat can see: laps done, plus
 * the bot's place in this lap. The server refuses a horn that is too early and
 * the handler falls back to rolling, so a wrong guess costs nothing.
 */
function turnsTakenEstimate(view: GameView): number {
  const index = view.players.findIndex((p) => p.socketId === view.activeSocketId);
  return (view.round - 1) * view.players.length + Math.max(0, index);
}

/** Whether sounding the horn now would hold, given the rules and the counts. */
function hornWouldHold(view: GameView, rules: HouseRules): boolean {
  const me = selfOf(view);
  const lowest = lowestRival(view);
  if (!me || !lowest) return false;
  if (view.endCalledBy) return false;
  if (turnsTakenEstimate(view) < Math.max(rules.minTurnsBeforeEnd, view.players.length)) return false;
  return rules.hornMustBeStrictlyLowest ? me.handCount < lowest.handCount : me.handCount <= lowest.handCount;
}

// ─── Claim ──────────────────────────────────────────────────────────────────

function decideClaim(view: GameView, rules: HouseRules, level: BotLevel, rng: Rng): BotAction | null {
  const mine = view.claims.find((c) => c.socketId === view.selfSocketId);
  // The roller has no claim row, and a seat that already spoke has nothing to add.
  if (!mine || mine.total !== null) return null;
  if (view.activeSocketId === view.selfSocketId) return null;

  const low = rules.diceCount;
  const high = rules.diceCount * DIE_FACES;
  // A claimer sees the dice. Should the view somehow not carry them, play the
  // distribution rather than refuse: the clock would otherwise answer for us.
  const truth = view.dice.total;
  if (truth === null) return { type: 'claim', total: sampleTotal(rules, rng, null) };

  if (level === 'easy') {
    return { type: 'claim', total: rng() < 0.7 ? truth : low + pickInt(rng, high - low + 1) };
  }

  const odds = totalOdds(rules.diceCount);
  // The roller reads the claims as a believability contest. A true total that is
  // itself rare is a flag, so Sharp hides it; Steady just mixes.
  let lieChance = 0.4;
  if (level === 'sharp') lieChance = (odds[truth] ?? 0) < 0.03 ? 0.7 : 0.35;
  if (rng() >= lieChance) return { type: 'claim', total: truth };
  return { type: 'claim', total: sampleTotal(rules, rng, truth) };
}

// ─── Call ───────────────────────────────────────────────────────────────────

/** How often each seat has been caught lying, from the public `call` lines in the log. */
function lieRates(view: GameView): Map<string, number> {
  const idBySeat = new Map(view.players.map((p) => [p.seatNo, p.socketId] as const));
  const tally = new Map<string, { lies: number; seen: number }>();
  for (const entry of view.log) {
    if (entry.kind !== 'call' || entry.targetSeat === undefined) continue;
    const targetId = idBySeat.get(entry.targetSeat);
    if (targetId === undefined) continue;
    if (entry.verdict === undefined || entry.correct === undefined) continue;
    const lied = (entry.verdict === 'lie') === entry.correct;
    const row = tally.get(targetId) ?? { lies: 0, seen: 0 };
    row.seen++;
    if (lied) row.lies++;
    tally.set(targetId, row);
  }
  const rates = new Map<string, number>();
  for (const [id, row] of tally) rates.set(id, (row.lies + 1) / (row.seen + 2));
  return rates;
}

function decideCall(view: GameView, rules: HouseRules, level: BotLevel, rng: Rng): BotAction | null {
  const claims = view.claims.filter((c) => c.socketId !== view.selfSocketId && c.total !== null) as {
    socketId: string;
    total: number;
    lie: boolean | null;
  }[];
  if (claims.length === 0) return null;
  const warded = (id: string) => view.players.find((p) => p.socketId === id)?.warded === true;

  // Looking at the dice (an Azure card) makes the call certain, so every level
  // takes the sure thing: a lie to catch if there is one, else a truth to back.
  const known = view.dice.total;
  if (known !== null) {
    const live = claims.filter((c) => !warded(c.socketId));
    const pool = live.length > 0 ? live : claims;
    const lie = pool.find((c) => c.total !== known);
    if (lie) return { type: 'call', targetSocketId: lie.socketId, verdict: 'lie' };
    const truthful = pool.find((c) => c.total === known) ?? claims[0];
    return truthful ? { type: 'call', targetSocketId: truthful.socketId, verdict: 'truth' } : null;
  }

  if (level === 'easy') {
    const target = pickOne(rng, claims);
    return { type: 'call', targetSocketId: target.socketId, verdict: rng() < 0.5 ? 'lie' : 'truth' };
  }

  const odds = totalOdds(rules.diceCount);
  const live = claims.filter((c) => !warded(c.socketId));

  if (level === 'steady') {
    // The claim least likely to be true under three fair dice, called a lie.
    const pool = live.length > 0 ? live : claims;
    let target = pool[0] as (typeof claims)[number];
    for (const c of pool) if ((odds[c.total] ?? 0) < (odds[target.total] ?? 0)) target = c;
    return { type: 'call', targetSocketId: target.socketId, verdict: 'lie' };
  }

  // Sharp: the chance each total is the real one, given the prior over the dice
  // and how truthful each claimant has been. A liar never names the true total,
  // so a lie spreads evenly over the other totals.
  const low = rules.diceCount;
  const high = rules.diceCount * DIE_FACES;
  const span = high - low + 1;
  const rates = lieRates(view);
  const weight = new Array<number>(high + 1).fill(0);
  let mass = 0;
  for (let total = low; total <= high; total++) {
    let w = odds[total] ?? 0;
    for (const c of claims) {
      const lies = rates.get(c.socketId) ?? 0.5;
      w *= c.total === total ? 1 - lies : lies / Math.max(1, span - 1);
    }
    weight[total] = w;
    mass += w;
  }
  let best: { id: string; verdict: 'truth' | 'lie'; score: number } | null = null;
  for (const c of claims) {
    const pTrue = mass > 0 ? (weight[c.total] ?? 0) / mass : (odds[c.total] ?? 0);
    const draw = rules.penaltyDraw;
    for (const verdict of ['truth', 'lie'] as const) {
      const pWin = verdict === 'truth' ? pTrue : 1 - pTrue;
      // A win costs the target a draw, unless a Verdant ward soaks it up.
      const score = pWin * (warded(c.socketId) ? 0 : draw) - (1 - pWin) * draw;
      if (!best || score > best.score) best = { id: c.socketId, verdict, score };
    }
  }
  return best ? { type: 'call', targetSocketId: best.id, verdict: best.verdict } : null;
}

// ─── The roller's turn ──────────────────────────────────────────────────────

function play(card: Card, targetSocketId?: string): BotAction {
  return targetSocketId === undefined
    ? { type: 'play', cardId: card.id }
    : { type: 'play', cardId: card.id, targetSocketId };
}

function decideAction(view: GameView, rules: HouseRules, level: BotLevel, rng: Rng): BotAction {
  const me = selfOf(view);
  const lowest = lowestRival(view);
  if (!me || !lowest) return { type: 'roll' };
  const smallest = me.handCount <= lowest.handCount;
  const hornOk = hornWouldHold(view, rules);
  const verdant = firstWith(view, rules, 'ward');

  if (level === 'easy') {
    // Spends a card only on the one that saves it a draw, and then only half the time.
    if (verdant && !me.warded && rng() < 0.5) return play(verdant);
    if (hornOk && rng() < 0.5) return { type: 'end' };
    return { type: 'roll' };
  }

  if (level === 'steady') {
    if (hornOk) return { type: 'end' };
    if (verdant && smallest && !me.warded) return play(verdant);
    return { type: 'roll' };
  }

  // Sharp.
  const amber = firstWith(view, rules, 'scry');
  const seven = firstWith(view, rules, 'swap');
  const azure = firstWith(view, rules, 'glimpse');
  const crimson = firstWith(view, rules, 'accuse');

  if (hornOk) {
    // Somebody holding a seven can take this hand off a horn-caller on the last
    // turn. An Amber look at the closest rival is cheap insurance when the lead
    // is wide enough to absorb the card it costs.
    if (view.scry) {
      const holdsSeven = view.scry.cards.some((card) => card.rank === SWAP_RANK);
      if (!holdsSeven) return { type: 'end' };
    } else if (amber && me.handCount + 2 <= lowest.handCount) {
      return play(amber, lowest.socketId);
    } else {
      return { type: 'end' };
    }
  }

  // A seven trades a big hand for a small one, after paying its own card.
  if (seven && me.handCount - lowest.handCount >= 2) return play(seven, lowest.socketId);
  // Seeing the dice turns the call from a guess into a sure draw for somebody.
  if (azure && !view.dice.glimpsed && me.handCount <= lowest.handCount + 2) return play(azure);
  // Make the leader draw when they are ahead of, or level with, us.
  if (crimson && lowest.handCount <= me.handCount && !lowest.warded) return play(crimson, lowest.socketId);
  if (verdant && smallest && !me.warded) return play(verdant);
  return { type: 'roll' };
}

// ─── The last turn ──────────────────────────────────────────────────────────

function decideFinal(view: GameView, rules: HouseRules, level: BotLevel): BotAction {
  if (level !== 'sharp' || !view.endCalledBy) return { type: 'pass' };
  const me = selfOf(view);
  const caller = view.players.find((p) => p.socketId === view.endCalledBy);
  if (!me || !caller || caller.socketId === me.socketId) return { type: 'pass' };

  const others = view.players.filter((p) => p.socketId !== caller.socketId);
  const lowestOther = Math.min(...others.map((p) => p.handCount));
  const holds = rules.hornMustBeStrictlyLowest ? caller.handCount < lowestOther : caller.handCount <= lowestOther;
  // The horn is already failing, or we are not the one it would beat.
  if (!holds) return { type: 'pass' };

  const seven = firstWith(view, rules, 'swap');
  // Trade into the caller's small hand; they inherit ours and the call backfires.
  if (seven && caller.handCount < me.handCount) return play(seven, caller.socketId);

  const crimson = firstWith(view, rules, 'accuse');
  if (crimson && !caller.warded) {
    const myAfter = me.handCount + rules.playDraw - 1;
    const rest = Math.min(...others.filter((p) => p.socketId !== me.socketId).map((p) => p.handCount), myAfter);
    const callerAfter = caller.handCount + rules.penaltyDraw;
    const heldAfter = rules.hornMustBeStrictlyLowest ? callerAfter < rest : callerAfter <= rest;
    if (!heldAfter) return play(crimson, caller.socketId);
  }
  return { type: 'pass' };
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * What this seat should do now, or `null` when it has nothing to do (not its
 * turn, a phase nobody acts in, a claim already made). The result is always a
 * legal move for the phase; the server checks every rule again regardless.
 */
export function decideBotAction(view: GameView, rules: HouseRules, level: BotLevel, rng: Rng): BotAction | null {
  const mine = view.activeSocketId === view.selfSocketId;
  switch (view.phase) {
    case 'action':
      return mine ? decideAction(view, rules, level, rng) : null;
    case 'claim':
      return decideClaim(view, rules, level, rng);
    case 'call':
      return mine ? decideCall(view, rules, level, rng) : null;
    case 'final':
      return mine ? decideFinal(view, rules, level) : null;
    default:
      return null;
  }
}

/**
 * Whether `action` is one the server would accept from this seat, judged from its
 * own view. Used by tests and by the handler's fallback; the handler's own
 * checks remain the authority.
 */
export function isLegalBotAction(view: GameView, rules: HouseRules, action: BotAction): boolean {
  const mine = view.activeSocketId === view.selfSocketId;
  switch (action.type) {
    case 'roll':
    case 'end':
      return view.phase === 'action' && mine;
    case 'pass':
      return view.phase === 'final' && mine;
    case 'play': {
      if (!mine || (view.phase !== 'action' && view.phase !== 'final')) return false;
      const card = view.hand.find((c) => c.id === action.cardId);
      const effect = card ? effectFor(card, rules) : null;
      if (!card || !effect) return false;
      if (effect === 'accuse' || effect === 'scry' || effect === 'swap') {
        return view.players.some((p) => p.socketId === action.targetSocketId && p.socketId !== view.selfSocketId);
      }
      return true;
    }
    case 'claim': {
      if (view.phase !== 'claim' || mine) return false;
      const own = view.claims.find((c) => c.socketId === view.selfSocketId);
      if (!own || own.total !== null) return false;
      return (
        Number.isInteger(action.total) && action.total >= rules.diceCount && action.total <= rules.diceCount * DIE_FACES
      );
    }
    case 'call': {
      if (view.phase !== 'call' || !mine) return false;
      return view.claims.some((c) => c.socketId === action.targetSocketId && c.total !== null);
    }
  }
}
