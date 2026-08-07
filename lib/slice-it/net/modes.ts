/**
 * Slice It — the multiplayer modes, as pure policy.
 *
 * `N3` (co-op), `N4` (attack), `N5` (elimination), `N6` (matchmaking), `N8`
 * (queue and host rotation) and `N10` (ghost races). Every one of these is a
 * rule the SERVER has to apply, and every one of them is currently a rule
 * nowhere.
 *
 * Deliberately free of socket.io, Prisma and the lobby type: the handler is
 * 1900 lines and untestable, and a policy that lives inside it cannot be
 * exercised without standing up a hub. These are functions over values.
 */

import type { Section } from '../beatmap/sections';
import type { Slice } from '../types';

/* ─── N3 — co-op ─────────────────────────────────────────────────────────── */

export type CoopMode = 'lane' | 'section';

/**
 * The notes one seat plays in co-op.
 *
 * Lane split is the free version and ships first: a 2-lane chart is already two
 * independent streams, so it needs no new chart data at all. Section split
 * needs `C5`'s section map and is the better mode — alternating verses is
 * recognisably cooperative in a way that "you take the left hand" is not.
 *
 * With no sections, section mode degrades to lane mode rather than to one
 * player doing everything: an empty section list is an analysis that has not
 * run, not a song with one section.
 */
export function coopFilter(
  slices: readonly Slice[],
  seat: 0 | 1,
  mode: CoopMode,
  sections: readonly Section[] = [],
): Slice[] {
  if (mode === 'lane' || sections.length === 0) {
    return slices.filter((slice) => slice.lane === seat);
  }
  return slices.filter((slice) => sectionIndexAt(sections, slice.time) % 2 === seat);
}

/** Which section a time falls in. Past the end is the last section. */
export function sectionIndexAt(sections: readonly Section[], time: number): number {
  for (let i = 0; i < sections.length; i++) {
    if (time < sections[i].end) return i;
  }
  return Math.max(0, sections.length - 1);
}

/**
 * Whether a co-op split is playable for both seats.
 *
 * A chart whose notes are 95% on one lane splits into a real chart and almost
 * nothing, which is not co-op — it is one person playing while the other
 * watches. Checked before a match starts so the lobby can fall back to section
 * mode (or refuse) rather than discovering it thirty seconds in.
 */
export function coopBalance(slices: readonly Slice[], mode: CoopMode, sections?: Section[]) {
  const a = coopFilter(slices, 0, mode, sections).length;
  const b = coopFilter(slices, 1, mode, sections).length;
  const total = a + b;
  return {
    seat0: a,
    seat1: b,
    // 0 = perfectly even, 1 = one seat has everything.
    skew: total === 0 ? 0 : Math.abs(a - b) / total,
    playable: total > 0 && Math.abs(a - b) / total < 0.6,
  };
}

/* ─── N4 — attack mode ───────────────────────────────────────────────────── */

export type AttackKind = 'laneCover' | 'blackout' | 'shake';

/**
 * The attack catalogue.
 *
 * **All strictly cosmetic, all time-boxed.** An attack that changed the target's
 * chart would make their score incomparable, which defeats the leaderboard the
 * match writes to — so nothing here touches note data, timing windows or
 * anything a score is derived from. They make the playfield harder to READ for
 * a few seconds, which is a skill test, not a different chart.
 */
export const ATTACKS = {
  laneCover: { durationMs: 4000, cost: 1 },
  /** Judgement popups hidden — the feedback channel, not the notes. */
  blackout: { durationMs: 2000, cost: 2 },
  shake: { durationMs: 3000, cost: 1 },
} as const satisfies Record<AttackKind, { durationMs: number; cost: number }>;

export const ATTACK_KINDS = Object.keys(ATTACKS) as AttackKind[];

/** Combo milestones that grant a charge. */
export const ATTACK_CHARGE_AT = [50, 100, 200, 350, 500, 750, 1000];
/** Most charges one player may hold. */
export const MAX_ATTACK_CHARGES = 3;

/** Charges earned by reaching a combo, given the highest milestone already paid. */
export function chargesEarned(combo: number, lastPaidMilestone: number): number {
  let earned = 0;
  for (const milestone of ATTACK_CHARGE_AT) {
    if (milestone > lastPaidMilestone && combo >= milestone) earned++;
  }
  return earned;
}

export interface AttackResult {
  ok: boolean;
  /** The attack actually delivered — may differ from the one requested. */
  kind: AttackKind;
  chargesLeft: number;
  untilMs: number;
  reason?: 'no-charges' | 'self' | 'unknown-target';
}

/**
 * Resolve an attack server-side.
 *
 * The charge count comes from the server's own tally; a client that says it has
 * five is not asked. The signature takes it explicitly for that reason — there
 * is no path here that reads a number off the wire.
 *
 * **Accessibility overrides the mechanic.** A player with reduced-flash on
 * (`A2`) receives a lane cover instead of a blackout: the attacker still pays,
 * the target is still inconvenienced, and nobody's photosensitivity setting is
 * overridden by another player's item. An attack that can defeat an
 * accessibility setting is a hazard, not a mechanic.
 */
export function resolveAttack(input: {
  kind: AttackKind;
  charges: number;
  now: number;
  attackerId: string;
  targetId: string;
  targetReducedFlash: boolean;
}): AttackResult {
  const spec = ATTACKS[input.kind];
  if (input.attackerId === input.targetId) {
    return { ok: false, kind: input.kind, chargesLeft: input.charges, untilMs: 0, reason: 'self' };
  }
  if (input.charges < spec.cost) {
    return {
      ok: false,
      kind: input.kind,
      chargesLeft: input.charges,
      untilMs: 0,
      reason: 'no-charges',
    };
  }

  const kind: AttackKind =
    input.targetReducedFlash && input.kind === 'blackout' ? 'laneCover' : input.kind;
  return {
    ok: true,
    kind,
    chargesLeft: input.charges - spec.cost,
    // The DELIVERED attack's duration, not the requested one's — a substituted
    // lane cover lasts as long as a lane cover.
    untilMs: input.now + ATTACKS[kind].durationMs,
  };
}

/* ─── N5 — elimination ───────────────────────────────────────────────────── */

/** Fractions of the song at which the last-placed player is knocked out. */
export const ELIMINATION_CHECKPOINTS = [0.25, 0.5, 0.75];

export interface EliminationSeat {
  id: string;
  score: number;
  eliminated: boolean;
}

/**
 * Who, if anyone, is out at this moment.
 *
 * `elapsedFraction` must come from the SERVER's clock. Evaluating it on
 * client-reported progress would let a client claim to be at 74% forever and
 * never face a checkpoint.
 *
 * Never eliminates below two players: a mode that knocks out the second-to-last
 * player leaves one person playing alone against nobody, which is not the end
 * of a match, it is a bug that looks like one.
 */
export function elimination(
  seats: readonly EliminationSeat[],
  checkpointsPassed: number,
  elapsedFraction: number,
): { eliminate: string | null; checkpointsPassed: number } {
  const next = ELIMINATION_CHECKPOINTS[checkpointsPassed];
  if (next === undefined || elapsedFraction < next) {
    return { eliminate: null, checkpointsPassed };
  }

  const alive = seats.filter((seat) => !seat.eliminated);
  // The checkpoint is CONSUMED either way. Leaving it unconsumed when there are
  // too few players would re-evaluate it on every tick for the rest of the song.
  if (alive.length <= 2) return { eliminate: null, checkpointsPassed: checkpointsPassed + 1 };

  // Lowest score. Ties broken by seat order rather than randomly, so the
  // outcome is explicable — "you were behind and joined later" beats "the
  // server rolled a die".
  let worst = alive[0];
  for (const seat of alive) {
    if (seat.score < worst.score) worst = seat;
  }
  return { eliminate: worst.id, checkpointsPassed: checkpointsPassed + 1 };
}

/* ─── N6 — skill-based matchmaking ───────────────────────────────────────── */

/** Where a new player starts. Matches `lib/ranked`'s convention. */
export const DEFAULT_MATCH_RATING = 1200;

/**
 * How wide a band quickplay will accept, given how long someone has waited.
 *
 * Widens with wait time, doubling every 10 seconds. A fixed band means a very
 * strong or very weak player waits forever; an unbounded one means quickplay is
 * random. Doubling reaches "anyone" in about a minute, which is the right
 * ceiling for an eight-player game where an unbalanced match is still a match.
 */
export function ratingBand(waitedMs: number): number {
  const waited = Math.max(0, waitedMs);
  return 100 * Math.pow(2, waited / 10_000);
}

export function withinBand(a: number, b: number, waitedMs: number): boolean {
  return Math.abs(a - b) <= ratingBand(waitedMs);
}

/**
 * Rating changes for one finished match.
 *
 * An 8-player match is not seven 1v1s: Elo is applied pairwise across the final
 * standings and **scaled by 1/(n−1)**, so one match is worth one match
 * regardless of lobby size. Without the scaling, an 8-player win would move a
 * rating seven times as far as a 2-player win, and the fastest way to climb
 * would be to fill the lobby.
 *
 * Returns deltas rather than mutating, so the caller decides what to persist —
 * an unranked or attack-mode match computes them and throws them away.
 */
export function matchRatingDeltas(
  standings: readonly { userId: string; score: number }[],
  ratings: Readonly<Record<string, number>>,
  k = 32,
): Record<string, number> {
  const deltas: Record<string, number> = {};
  if (standings.length < 2) return deltas;
  const scale = 1 / (standings.length - 1);

  for (const seat of standings) deltas[seat.userId] = 0;

  for (let i = 0; i < standings.length; i++) {
    for (let j = i + 1; j < standings.length; j++) {
      const a = standings[i];
      const b = standings[j];
      const ra = ratings[a.userId] ?? DEFAULT_MATCH_RATING;
      const rb = ratings[b.userId] ?? DEFAULT_MATCH_RATING;
      const expectedA = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      // A draw is 0.5 for both. Two identical scores in a rhythm game is
      // vanishingly rare but not impossible, and treating it as a win for
      // whoever sorted first would be arbitrary.
      const actualA = a.score > b.score ? 1 : a.score < b.score ? 0 : 0.5;
      const delta = k * (actualA - expectedA) * scale;
      deltas[a.userId] += delta;
      deltas[b.userId] -= delta;
    }
  }
  return deltas;
}

/* ─── N8 — lobby queue and host rotation ─────────────────────────────────── */

/** How many tracks a lobby queue holds. */
export const MAX_QUEUE_LENGTH = 20;

/**
 * Advance the picker to the next seat.
 *
 * Rotation is by SEAT INDEX, not by socket id. A reconnect mints a new socket
 * id, so rotating on that would hand the pick to whoever last had a wifi blip —
 * and would silently skip anyone who never dropped.
 *
 * Wraps, and survives a shrinking lobby: when the picker leaves, the index that
 * was theirs now belongs to whoever moved into that slot, which is the least
 * surprising behaviour available.
 */
export function nextPicker(current: number, seatCount: number): number {
  if (seatCount <= 0) return 0;
  return (current + 1) % seatCount;
}

/** Push a chart onto a lobby queue, bounded and without duplicates. */
export function enqueueChart(queue: readonly string[], chartId: string): string[] {
  if (queue.includes(chartId)) return [...queue];
  if (queue.length >= MAX_QUEUE_LENGTH) return [...queue];
  return [...queue, chartId];
}

/** Pop the next chart. Returns the rest so the caller never mutates in place. */
export function dequeueChart(queue: readonly string[]): {
  next: string | null;
  rest: string[];
} {
  if (queue.length === 0) return { next: null, rest: [] };
  return { next: queue[0], rest: queue.slice(1) };
}

/* ─── N10 — async ghost races ────────────────────────────────────────────── */

/**
 * One second of a stored run's score curve, shaped as a live opponent.
 *
 * The point is that the sidebar **cannot distinguish a ghost from a real
 * opponent**: no second renderer, no second code path, and no drift between how
 * the two are drawn. The fields a ghost cannot know (combo, accuracy) are zero
 * rather than invented — a fabricated accuracy would be a number on screen that
 * nothing produced.
 */
export interface GhostScore {
  socketId: string;
  name: string;
  score: number;
  combo: number;
  maxCombo: number;
  accuracy: number;
  health: number;
  finished: boolean;
}

export function ghostAsLiveScore(
  curve: readonly number[],
  seconds: number,
  name: string,
): GhostScore {
  const index = curve.length === 0 ? -1 : Math.min(curve.length - 1, Math.floor(seconds));
  return {
    socketId: `ghost:${name}`,
    name,
    score: index < 0 ? 0 : curve[index],
    combo: 0,
    maxCombo: 0,
    accuracy: 0,
    health: 100,
    finished: index >= curve.length - 1 && curve.length > 0,
  };
}

/**
 * Compress a run's per-second score curve for storage.
 *
 * One value per second, monotonically non-decreasing by construction (score
 * never falls). A four-minute run is 240 integers, which rides in a JSON column
 * without anybody noticing — and a curve sampled per frame would be 14 000.
 */
export function buildScoreCurve(
  samples: readonly { seconds: number; score: number }[],
  duration: number,
): number[] {
  const length = Math.max(1, Math.ceil(duration));
  const curve = new Array<number>(length).fill(0);
  for (const sample of samples) {
    const index = Math.max(0, Math.min(length - 1, Math.floor(sample.seconds)));
    if (sample.score > curve[index]) curve[index] = sample.score;
  }
  // Forward-fill: a second with no sample holds the previous score rather than
  // dropping to zero, which would draw as the ghost losing points.
  for (let i = 1; i < curve.length; i++) {
    if (curve[i] < curve[i - 1]) curve[i] = curve[i - 1];
  }
  return curve;
}

/* ─── N12 — rejoining a match in progress ────────────────────────────────── */

/**
 * How far into a song a returning player may still take a competing seat.
 *
 * 20%. Past that, the remainder is a different chart from the one everyone else
 * played and a "partial credit" score would be a number on the same board that
 * means something else. They watch instead, which is `N1`'s spectator seat and
 * costs nothing.
 */
export const REJOIN_COMPETE_FRACTION = 0.2;

export type RejoinOutcome =
  | { kind: 'compete'; seekTo: number; fromSeconds: number }
  | { kind: 'spectate'; reason: 'too-late' }
  | { kind: 'refused'; reason: 'no-seat' | 'not-playing' };

/**
 * What a returning player gets.
 *
 * Nothing about the other seats changes, which is what keeps the room's timing
 * guarantees intact: the returning player is a NEW participant in an existing
 * match, not a rewind of it. A rejoin that paused or restarted the room would
 * punish six people for one person's wifi.
 */
export function resolveRejoin(input: {
  hadSeat: boolean;
  state: string;
  elapsedSeconds: number;
  songDuration: number;
}): RejoinOutcome {
  if (!input.hadSeat) return { kind: 'refused', reason: 'no-seat' };
  if (input.state !== 'playing') return { kind: 'refused', reason: 'not-playing' };

  const duration = input.songDuration > 0 ? input.songDuration : 1;
  const fraction = input.elapsedSeconds / duration;
  if (fraction > REJOIN_COMPETE_FRACTION) return { kind: 'spectate', reason: 'too-late' };

  return {
    kind: 'compete',
    // Seek to where everyone else is, not to zero. A player who rejoins to the
    // start of the song is playing a different song from the room.
    seekTo: Math.max(0, input.elapsedSeconds),
    fromSeconds: Math.max(0, input.elapsedSeconds),
  };
}

/**
 * Mark a partial run so a board can tell it apart.
 *
 * A partial score is comparable to nothing, so it is labelled at the source
 * rather than at each display. `fromSeconds > 0` is the whole signal.
 */
export function isPartialRun(fromSeconds: number | null | undefined): boolean {
  return typeof fromSeconds === 'number' && fromSeconds > 0;
}
