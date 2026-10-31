/**
 * Balatro multiplayer — the referee (PLAN §3.f, REF-01…REF-24, A1 §4 and §8).
 *
 *     refStep(state, input) → { state, out, checkpoint, wakeAt, over }
 *
 * PURE and deterministic: no Date.now, no Math.random, no I/O; the input
 * state is never mutated. Time comes only from `input.at`; randomness only
 * from the seeded xorshift state carried in the checkpoint (`rngState`).
 *
 * The state is `{ match, cp, away }`: `cp` *is* the RefCheckpoint, so a
 * checkpoint holds everything the referee needs except the StartedMatch
 * (which every peer already has) and who is currently away (which the new
 * host learns from presence: `restore.present`). `refFromCheckpoint` rebuilds
 * a state from those three, and a state rebuilt that way behaves exactly
 * like the original for every later input.
 *
 * Phase is derived from `cp.lastOutcome`: the last structural message the
 * referee sent — `start_blind` (a PvP round is running), `end_pvp`, or the
 * final `win`/`player_won` (the match is over).
 *
 * Shapes (A1 §2.2): the resolution branch is chosen by the number of
 * players that *started* the match (`roster.length`) for 1v1 vs N, and by
 * the shape flags for Manhunt/Teams. Practice (`shape.practice`) is the
 * degenerate local referee of REF-24.
 *
 * Usage (WS5):
 * - New match: `refStep(null, {t:'reset', at, match, rngSeed})`.
 * - Takeover: `refStep(refCreate(match), {t:'restore', at, checkpoint, present})`;
 *   without a usable checkpoint, build one with `refRebuild(...)` first.
 * - Schedule a `{t:'tick', at: wakeAt}` whenever `wakeAt` is non-null.
 *
 * Reconstructions and deviations (also in docs/balatro-mp.md §Deviations):
 * - D-12: `start_blind` uses each player's `ready_blind.starting_hands`.
 * - D-18: `speedrun` goes to both players when one readies within 30 s of
 *   their ante nemesis (pairing partner; Teams: card target).
 * - Pending deaths count a player as having beaten the pending blind once
 *   their reported ante is past it, or when they ready for the PvP Boss of
 *   that ante (pending.ts).
 * - 2-player matches of any non-Manhunt/Teams shape get the degenerate
 *   `nemesis_pairing` (the single opponent) so D-01's Ready gate works.
 * - Votes (D-11) count present, alive, non-forfeited players; both kinds
 *   expire 60 s after the most recent vote of either kind (`votes.openedAt`
 *   is that time — the frozen checkpoint keeps one timestamp).
 * - `end_pvp.pvp_timer_lost` is true when the round was decided by the
 *   loser's PvP-timer hand loss in the same step.
 */

import { Rng, hashString, randomSeedString, rngSeed } from '../rng';
import { parseRefCheckpoint, requireRefCheckpoint } from '../wire-codec';
import type {
  Id,
  PendingDeath,
  RefCheckpoint,
  RefInput,
  RefMsg,
  RefOutput,
  RefStep,
  StartedMatch,
  Team,
} from '../types';
import { assignManhuntRoles, manhuntRound, manhuntTarget } from './manhunt';
import { computePairing } from './pairing';
import {
  blindKeyAnte,
  blindKeySlot,
  decide2pDeath,
  decideTeamPending,
  type BlindResult,
} from './pending';
import { computePlaces } from './places';
import { royaleLosers, royaleTargets, type Scored } from './royale';
import { compareScores, maxScore, parseScore, sumScores } from './score';
import { assignTeams, otherTeam, teamCardTargets, type TeamAB } from './teams';

export interface RefState {
  match: StartedMatch;
  cp: RefCheckpoint;
  /** Players currently away (not checkpointed; a restore derives it from `present`). */
  away: Id[];
}

export type RefPlayer = RefCheckpoint['players'][string];

export const REF_TIMING = {
  /** REF-14: `win` re-sent this long after the first send. */
  WIN_RESEND_MS: [3_000, 8_000] as const,
  /** D-11: a vote expires after this long with no new vote. */
  VOTE_EXPIRY_MS: 60_000,
  /** REF-16: the seed-change vote is only open this long after run start. */
  SEED_VOTE_WINDOW_MS: 300_000,
  /** D-18 */
  SPEEDRUN_WINDOW_MS: 30_000,
  /** REF-06: the Runner wins on reaching this ante. */
  RUNNER_WIN_ANTE: 9,
  DEFAULT_HANDS: 4,
  MAX_LIVES: 100,
} as const;

/* ─── Construction ───────────────────────────────────────────────────────── */

function freshPlayer(lives: number, team?: Team): RefPlayer {
  const p: RefPlayer = {
    score: '0',
    highest: '0',
    hands: REF_TIMING.DEFAULT_HANDS,
    lives,
    skips: 0,
    ante: 0,
    furthest: 0,
    played: 0,
    ready: 0,
    first: 0,
    blocker: 0,
    forfeited: 0,
    startingHands: REF_TIMING.DEFAULT_HANDS,
  };
  if (team) p.team = team;
  return p;
}

function freshCheckpoint(
  match: StartedMatch,
  at: number,
  rngState: number,
  seq: number,
): RefCheckpoint {
  const o = match.options;
  const players: RefCheckpoint['players'] = {};
  const teamLives: RefCheckpoint['teamLives'] = {};
  if (match.shape.manhunt) {
    const roles = assignManhuntRoles(match.roster);
    for (const r of match.roster) {
      const role = roles[r.id] as Team;
      players[r.id] = freshPlayer(role === 'RUNNER' ? 1 : o.manhuntHunterLives, role);
    }
  } else if (match.shape.teamBased) {
    const teams = assignTeams(match.roster);
    for (const r of match.roster) players[r.id] = freshPlayer(o.startingLives, teams[r.id]);
    teamLives.A = o.startingLives;
    teamLives.B = o.startingLives;
  } else {
    for (const r of match.roster) players[r.id] = freshPlayer(o.startingLives);
  }
  return {
    v: 1,
    runId: match.runId,
    seq,
    players,
    pairing: {},
    pairingAnte: 0,
    usedPairs: [],
    lastBye: null,
    teamLives,
    teamCardTargets: {},
    eliminated: [],
    pending: [],
    teamPending: null,
    blindResults: {},
    votes: { seed: [], draw: [] },
    lastOutcome: null,
    winSentAt: [],
    rngState: rngSeed(rngState),
    startedAt: at,
  };
}

/** An idle referee for `match` (no outputs) — the base for a takeover `restore`. */
export function refCreate(match: StartedMatch): RefState {
  return {
    match: structuredClone(match),
    cp: freshCheckpoint(match, match.startedAt, 1, 0),
    away: [],
  };
}

/** Rebuild a state from a checkpoint plus who is present (REF-19). */
export function refFromCheckpoint(
  match: StartedMatch,
  checkpoint: RefCheckpoint,
  present: readonly Id[],
): RefState {
  const here = new Set(present);
  const s: RefState = {
    match: structuredClone(match),
    cp: structuredClone(checkpoint),
    away: match.roster.map((r) => r.id).filter((id) => !here.has(id)),
  };
  normalize(s);
  return s;
}

export interface RebuildInfo {
  at: number;
  rngSeed: number;
  /** The new host's lives cache (own lives plus cached lives of the others). */
  lives: Record<Id, number>;
  teamLives?: { A?: number; B?: number };
  blindResults?: RefCheckpoint['blindResults'];
  pending?: PendingDeath[];
  teamPending?: RefCheckpoint['teamPending'];
  ante?: Record<Id, number>;
  forfeited?: Id[];
  eliminated?: Id[];
  pairing?: { pairing: RefCheckpoint['pairing']; ante: number };
}

/**
 * REF-19 "rebuild without a checkpoint": a best-effort checkpoint from what
 * the new host saw (lives cache, own blind results, pending info). Feed it to
 * a `restore`. Missing pairing is recomputed for the highest alive ante.
 */
export function refRebuild(match: StartedMatch, info: RebuildInfo): RefCheckpoint {
  const cp = freshCheckpoint(match, info.at, info.rngSeed, 0);
  const forfeited = new Set(info.forfeited ?? []);
  for (const [id, p] of Object.entries(cp.players)) {
    const lives = info.lives[id];
    if (typeof lives === 'number' && Number.isFinite(lives)) p.lives = clampLives(lives);
    const ante = info.ante?.[id];
    if (typeof ante === 'number' && ante >= 0) p.ante = Math.floor(ante);
    if (forfeited.has(id)) {
      p.forfeited = 1;
      p.hands = 0;
    }
  }
  if (info.teamLives && match.shape.teamBased) {
    if (typeof info.teamLives.A === 'number') cp.teamLives.A = clampLives(info.teamLives.A);
    if (typeof info.teamLives.B === 'number') cp.teamLives.B = clampLives(info.teamLives.B);
    for (const p of Object.values(cp.players)) {
      const t = p.team as TeamAB;
      if (cp.teamLives[t] !== undefined) p.lives = cp.teamLives[t] as number;
    }
  }
  if (info.blindResults) cp.blindResults = structuredClone(info.blindResults);
  if (info.pending)
    cp.pending = structuredClone(info.pending).filter((d) => cp.players[d.playerId]);
  if (info.teamPending) cp.teamPending = { ...info.teamPending };
  if (info.eliminated) cp.eliminated = info.eliminated.filter((id) => cp.players[id]);
  const state: RefState = { match: structuredClone(match), cp, away: [] };
  const ctx = new Ctx(state, info.at);
  if (info.pairing) {
    cp.pairing = { ...info.pairing.pairing };
    cp.pairingAnte = info.pairing.ante;
  } else {
    const ante = Math.max(1, ...ctx.aliveIds().map((id) => ctx.p(id)?.ante ?? 0));
    ctx.computeTargets(ante, false);
  }
  cp.rngState = ctx.rng.state;
  return requireRefCheckpoint(cp);
}

function clampLives(n: number): number {
  return Math.max(0, Math.min(REF_TIMING.MAX_LIVES, Math.floor(n)));
}

/* ─── The step context ───────────────────────────────────────────────────── */

class Ctx {
  readonly s: RefState;
  readonly at: number;
  readonly out: RefOutput[] = [];
  rng: Rng;
  /** The player whose PvP-timer hand loss is being processed this step. */
  timerLossBy: Id | null = null;

  constructor(s: RefState, at: number) {
    this.s = s;
    this.at = at;
    this.rng = new Rng(s.cp.rngState);
  }

  get cp(): RefCheckpoint {
    return this.s.cp;
  }
  get match(): StartedMatch {
    return this.s.match;
  }
  get order(): Id[] {
    return this.match.roster.map((r) => r.id).filter((id) => this.cp.players[id] !== undefined);
  }
  get practice(): boolean {
    return this.match.shape.practice === true;
  }
  get manhunt(): boolean {
    return !this.practice && this.match.shape.manhunt;
  }
  get teams(): boolean {
    return !this.practice && !this.manhunt && this.match.shape.teamBased;
  }
  /** Exactly two starters, plain 1v1 resolution (A1 §2.2). */
  get twoP(): boolean {
    return !this.practice && !this.manhunt && !this.teams && this.order.length === 2;
  }
  /** N>2 (Nemesis/Royale/Small World) resolution. */
  get nShape(): boolean {
    return !this.practice && !this.manhunt && !this.teams && this.order.length > 2;
  }
  get pairingShape(): boolean {
    return (
      !this.practice &&
      !this.manhunt &&
      !this.teams &&
      (this.match.shape.nemesisPairing || this.twoP)
    );
  }
  get royaleShape(): boolean {
    return this.nShape && !this.match.shape.nemesisPairing;
  }
  get over(): boolean {
    const t = this.cp.lastOutcome?.t;
    return t === 'win' || t === 'player_won';
  }
  get inPvp(): boolean {
    return this.cp.lastOutcome?.t === 'start_blind';
  }

  p(id: Id): RefPlayer | undefined {
    return Object.prototype.hasOwnProperty.call(this.cp.players, id)
      ? this.cp.players[id]
      : undefined;
  }
  emit(msg: RefMsg, to: '*' | Id = '*'): void {
    this.out.push({ to, msg });
  }
  alive(id: Id): boolean {
    const p = this.p(id);
    return !!p && p.lives > 0 && p.forfeited === 0;
  }
  aliveIds(): Id[] {
    return this.order.filter((id) => this.alive(id));
  }
  scored(ids: readonly Id[]): Scored[] {
    return ids.map((id) => ({ id, score: parseScore(this.p(id)?.score) }));
  }
  runnerId(): Id | null {
    return this.order.find((id) => this.p(id)?.team === 'RUNNER') ?? null;
  }
  hunters(): Id[] {
    return this.order.filter((id) => this.p(id)?.team === 'HUNTER');
  }
  members(team: Team): Id[] {
    return this.order.filter((id) => this.p(id)?.team === team);
  }

  /** A player's result for a blind, with the progress-past reconstruction. */
  resultOf(id: Id, key: string): BlindResult | undefined {
    const r = this.cp.blindResults[key]?.[id];
    if (r) return r;
    const p = this.p(id);
    if (p && p.ante > blindKeyAnte(key)) return 'B';
    return undefined;
  }
  record(id: Id, key: string, r: BlindResult): void {
    const slot = (this.cp.blindResults[key] ??= {});
    if (slot[id] === 'F') return; // a failure is final
    slot[id] = r;
  }
  pendingKeys(): string[] {
    const keys = this.cp.pending.map((d) => d.blindKey);
    if (this.cp.teamPending) keys.push(this.cp.teamPending.blindKey);
    return keys;
  }

  /* ─── Outcomes ─── */

  finish(msg: RefMsg): void {
    if (this.over) return;
    this.cp.lastOutcome = msg;
    this.cp.winSentAt = [this.at];
    this.cp.votes = { seed: [], draw: [] };
    for (const p of Object.values(this.cp.players)) {
      p.ready = 0;
      delete p.readyAt;
    }
    this.emit(msg);
  }

  /** A life (REF-09: at most one per player per round; Teams: the shared pool). */
  loseLife(id: Id): boolean {
    const p = this.p(id);
    if (!p || p.blocker === 1) return false;
    if (this.teams) {
      const t = p.team as TeamAB;
      const pool = this.cp.teamLives[t] ?? 0;
      if (pool <= 0) return false;
      p.blocker = 1;
      this.setTeamPool(t, pool - 1, true);
      return true;
    }
    if (p.lives <= 0) return false;
    p.lives -= 1;
    p.blocker = 1;
    if (!this.practice) this.emit({ t: 'player_lives', player_id: id, lives: p.lives, lost: 1 });
    return true;
  }

  setTeamPool(t: TeamAB, lives: number, lost: boolean): void {
    this.cp.teamLives[t] = Math.max(0, lives);
    for (const id of this.members(t)) {
      const m = this.p(id) as RefPlayer;
      m.lives = this.cp.teamLives[t] as number;
      const msg: RefMsg = { t: 'player_lives', player_id: id, lives: m.lives };
      if (lost) msg.lost = 1;
      this.emit(msg);
    }
    this.emit({ t: 'team_lives', team_id: t, lives: this.cp.teamLives[t] as number });
  }

  /** Recompute pairing / card targets for an ante (REF-02, REF-07). */
  computeTargets(ante: number, broadcast: boolean): void {
    if (this.pairingShape) {
      const res = computePairing(
        {
          alive: this.aliveIds(),
          usedPairs: this.cp.usedPairs,
          lastBye: this.cp.lastBye,
          salt: hashString(this.match.runId),
        },
        this.rng,
      );
      this.cp.pairing = res.pairing;
      this.cp.lastBye = res.lastBye;
      this.cp.usedPairs = this.twoP ? [] : res.usedPairs;
      this.cp.pairingAnte = ante;
      if (broadcast) this.emit({ t: 'nemesis_pairing', pairing: { ...res.pairing }, ante });
    } else if (this.teams) {
      this.cp.teamCardTargets = teamCardTargets(
        this.order,
        (id) => this.p(id)?.team as TeamAB | undefined,
        (id) => this.alive(id),
        ante,
      );
      this.cp.pairingAnte = ante;
      if (broadcast) this.emit({ t: 'team_card_target', pairing: { ...this.cp.teamCardTargets } });
    }
  }

  /** REF-01 broadcasts after a reset. */
  broadcastReset(): void {
    if (this.practice) return;
    if (this.manhunt) {
      for (const id of this.order)
        this.emit({ t: 'player_lives', player_id: id, lives: (this.p(id) as RefPlayer).lives });
    } else {
      this.emit({ t: 'player_lives', player_id: '*all*', lives: this.match.options.startingLives });
      if (this.teams) {
        this.emit({ t: 'team_lives', team_id: 'A', lives: this.cp.teamLives.A ?? 0 });
        this.emit({ t: 'team_lives', team_id: 'B', lives: this.cp.teamLives.B ?? 0 });
      }
    }
    if (this.manhunt || this.teams) this.emit({ t: 'team_roster', roster: this.roster() });
    this.computeTargets(1, true);
  }

  roster(): Record<Id, Team> {
    const r: Record<Id, Team> = {};
    for (const id of this.order) r[id] = (this.p(id) as RefPlayer).team as Team;
    return r;
  }

  /** REF-20 / takeover: everything a (re)joining client needs, to `to`. */
  resync(to: '*' | Id): void {
    if (this.practice) return;
    if (this.pairingShape && this.cp.pairingAnte > 0)
      this.emit(
        { t: 'nemesis_pairing', pairing: { ...this.cp.pairing }, ante: this.cp.pairingAnte },
        to,
      );
    if (this.teams && this.cp.pairingAnte > 0)
      this.emit({ t: 'team_card_target', pairing: { ...this.cp.teamCardTargets } }, to);
    if (this.manhunt || this.teams) this.emit({ t: 'team_roster', roster: this.roster() }, to);
    for (const id of this.order)
      this.emit({ t: 'player_lives', player_id: id, lives: (this.p(id) as RefPlayer).lives }, to);
    if (this.teams) {
      this.emit({ t: 'team_lives', team_id: 'A', lives: this.cp.teamLives.A ?? 0 }, to);
      this.emit({ t: 'team_lives', team_id: 'B', lives: this.cp.teamLives.B ?? 0 }, to);
    }
    for (const d of this.cp.pending) {
      const msg: RefMsg = { t: 'death_pending', player_id: d.playerId, blind_key: d.blindKey };
      if (d.opponentId) msg.opponent_id = d.opponentId;
      this.emit(msg, to);
    }
    if (this.cp.teamPending)
      this.emit(
        {
          t: 'death_pending',
          team_id: this.cp.teamPending.team,
          blind_key: this.cp.teamPending.blindKey,
        },
        to,
      );
    this.liveTargets(to);
    if (this.over && this.cp.lastOutcome) this.emit(this.cp.lastOutcome, to);
  }

  /** REF-08 live targets (only while a PvP round runs). */
  liveTargets(to: '*' | Id = '*'): void {
    if (!this.inPvp) return;
    if (this.royaleShape) {
      this.emit({ t: 'royale_target', targets: royaleTargets(this.scored(this.aliveIds())) }, to);
    } else if (this.manhunt) {
      const hunters = this.hunters().filter((id) => this.alive(id));
      this.emit({ t: 'manhunt_target', target_id: manhuntTarget(this.scored(hunters)) }, to);
    } else if (this.teams) {
      this.emit({ t: 'team_score_board', team_scores: this.teamScores() }, to);
    }
  }

  teamScores(): { A: string; B: string } {
    const sum = (t: TeamAB) =>
      sumScores(
        this.members(t)
          .filter((id) => this.alive(id))
          .map((id) => (this.p(id) as RefPlayer).score),
      );
    return { A: sum('A'), B: sum('B') };
  }

  /* ─── Round flow ─── */

  maybeStartBlind(): void {
    if (this.over || this.inPvp) return;
    const alive = this.aliveIds();
    if (alive.length === 0) return;
    if (!alive.every((id) => (this.p(id) as RefPlayer).ready === 1)) return;
    if (this.twoP && alive.length < 2) return;
    let first: Id | '' = '';
    if (this.twoP || this.practice)
      first = alive.find((id) => (this.p(id) as RefPlayer).first === 1) ?? '';
    const starting: Record<Id, number> = {};
    for (const id of alive) {
      const p = this.p(id) as RefPlayer;
      p.ready = 0;
      p.score = '0';
      p.hands = p.startingHands;
      p.played = 0;
      starting[id] = p.startingHands;
    }
    const msg: RefMsg = { t: 'start_blind', first_player: first, starting_hands: starting };
    this.cp.lastOutcome = msg;
    this.emit(msg);
    this.liveTargets();
  }

  endPvp(loser: Id | ''): void {
    const msg: RefMsg = {
      t: 'end_pvp',
      loser_id: loser,
      pvp_timer_lost: loser !== '' && this.timerLossBy === loser,
    };
    this.cp.lastOutcome = msg;
    for (const p of Object.values(this.cp.players)) {
      p.ready = 0;
      p.first = 0;
      delete p.readyAt;
    }
    this.emit(msg);
  }

  tryResolve(): void {
    if (!this.inPvp || this.over) return;
    if (this.practice) {
      const id = this.order[0];
      if (id !== undefined && (this.p(id) as RefPlayer).hands < 1) this.endPvp('');
      return;
    }
    if (this.twoP) {
      this.resolve2p();
      return;
    }
    const alive = this.aliveIds();
    if (alive.some((id) => (this.p(id) as RefPlayer).hands >= 1)) return;
    if (this.manhunt) this.resolveManhunt();
    else if (this.teams) this.resolveTeams();
    else if (this.match.shape.nemesisPairing) this.resolveNemesis(alive);
    else for (const id of royaleLosers(this.scored(alive))) this.loseLife(id);
    this.checkEnd();
    if (!this.over) this.endPvp('');
  }

  resolve2p(): void {
    const [a, b] = this.order as [Id, Id];
    const pa = this.p(a) as RefPlayer;
    const pb = this.p(b) as RefPlayer;
    if (!this.alive(a) || !this.alive(b)) return;
    const c = compareScores(pa.score, pb.score);
    const trigger =
      (pa.hands < 1 && c < 0) || (pb.hands < 1 && c > 0) || (pa.hands < 1 && pb.hands < 1);
    if (!trigger) return;
    const loser: Id | '' = c === 0 ? '' : c < 0 ? a : b;
    if (loser !== '') this.loseLife(loser);
    if (pa.lives <= 0 || pb.lives <= 0) {
      this.finish({ t: 'win', winner_id: pa.lives > pb.lives ? a : b });
      return;
    }
    this.endPvp(loser);
  }

  resolveNemesis(alive: readonly Id[]): void {
    const done = new Set<Id>();
    const losers: Id[] = [];
    for (const id of alive) {
      const partner = this.cp.pairing[id];
      if (!partner || done.has(id) || !this.alive(partner)) continue;
      done.add(id);
      done.add(partner);
      const c = compareScores(
        (this.p(id) as RefPlayer).score,
        (this.p(partner) as RefPlayer).score,
      );
      if (c < 0) losers.push(id);
      else if (c > 0) losers.push(partner);
    }
    for (const id of this.order) if (losers.includes(id)) this.loseLife(id);
  }

  resolveManhunt(): void {
    const runner = this.runnerId();
    if (runner === null || !this.alive(runner)) return;
    const hunters = this.hunters().filter((id) => this.alive(id));
    const r = manhuntRound(this.scored([runner])[0] as Scored, this.scored(hunters));
    for (const id of r.hunterLosers) this.loseLife(id);
    if (r.runnerCaught) this.loseLife(runner);
  }

  resolveTeams(): void {
    const scores = this.teamScores();
    this.emit({ t: 'team_score_board', team_scores: scores });
    const c = compareScores(scores.A, scores.B);
    if (c === 0) return;
    const loser: TeamAB = c < 0 ? 'A' : 'B';
    const pool = this.cp.teamLives[loser] ?? 0;
    if (pool <= 0) return;
    for (const id of this.members(loser)) (this.p(id) as RefPlayer).blocker = 1;
    this.setTeamPool(loser, pool - 1, true);
  }

  /** The end-of-match check for every shape but 1v1 (A1 §4.3 check_alive_win, §4.5). */
  checkEnd(): void {
    if (this.over || this.twoP || this.practice) return;
    if (this.manhunt) {
      if (this.cp.teamPending) return;
      const runner = this.runnerId();
      if (runner === null || !this.alive(runner)) {
        this.finish({ t: 'win', winner_team_id: 'HUNTER' });
        return;
      }
      if (!this.hunters().some((id) => this.alive(id))) {
        this.finish({ t: 'win', winner_team_id: 'RUNNER' });
        return;
      }
      this.announceEliminations();
      return;
    }
    if (this.teams) {
      if (this.cp.teamPending) return;
      for (const t of ['A', 'B'] as const) {
        const out =
          (this.cp.teamLives[t] ?? 0) <= 0 ||
          this.members(t).every((id) => this.p(id)?.forfeited === 1);
        if (out) {
          this.finish({ t: 'win', winner_team_id: otherTeam(t) });
          return;
        }
      }
      return;
    }
    const alive = this.aliveIds();
    if (this.cp.pending.length > 0) {
      if (alive.length <= 1 && this.pendingComplete(alive)) {
        this.finishWithPlaces();
        return;
      }
      this.announceEliminations();
      return;
    }
    if (alive.length === 1) {
      this.finish({ t: 'win', winner_id: alive[0] as Id });
      return;
    }
    if (alive.length === 0) {
      this.finish({ t: 'win', draw: true });
      return;
    }
    this.announceEliminations();
  }

  /** REF-11 completion: every pending death has heard from every other alive player. */
  pendingComplete(alive: readonly Id[]): boolean {
    return this.cp.pending.every((d) =>
      alive.every((id) => id === d.playerId || this.resultOf(id, d.blindKey) !== undefined),
    );
  }

  finishWithPlaces(): void {
    const ids = this.order;
    const places = computePlaces(ids, this.cp.pending, {
      aliveAndPresent: (id) => this.alive(id),
      left: (id) => this.p(id)?.forfeited === 1,
      result: (id, key) => this.resultOf(id, key),
    });
    const firsts = ids.filter((id) => places[id] === 1);
    // Keys in schema order so a deserialised checkpoint re-sends byte-identical messages.
    const msg: RefMsg =
      firsts.length === 1
        ? { t: 'win', winner_id: firsts[0] as Id, places }
        : { t: 'win', draw: true, places };
    this.finish(msg);
  }

  /** REF-13: `eliminated` exactly once for each player who is out and not pending. */
  announceEliminations(): void {
    if (this.over || this.twoP || this.teams || this.practice) return;
    const pendingIds = new Set(this.cp.pending.map((d) => d.playerId));
    for (const id of this.order) {
      if (this.alive(id) || pendingIds.has(id) || this.cp.eliminated.includes(id)) continue;
      if (this.manhunt && this.p(id)?.team === 'RUNNER') continue;
      this.cp.eliminated.push(id);
      this.emit({ t: 'eliminated', player_id: id });
    }
  }

  /** A life lost to a normal blind or the ante timer took this player to 0 (A1 §4.6). */
  onBlindDeath(id: Id): void {
    const p = this.p(id) as RefPlayer;
    const key = p.failedBlind ?? `${p.ante}:Small`;
    if (this.twoP) {
      // The opponent of an existing pending death just died too: settle that one (a draw).
      if (this.cp.pending.length > 0) {
        this.reevaluatePending();
        return;
      }
      const opp = this.order.find((o) => o !== id) as Id;
      const d = this.decide2p(id, opp, key);
      if (d) return;
      this.cp.pending.push({ playerId: id, blindKey: key, outBefore: [], opponentId: opp });
      this.emit({ t: 'death_pending', player_id: id, opponent_id: opp, blind_key: key });
      return;
    }
    if (this.manhunt) {
      if (p.team === 'RUNNER') this.startTeamPending('RUNNER', key);
      else if (!this.hunters().some((h) => this.alive(h))) this.startTeamPending('HUNTER', key);
      else this.checkEnd();
      return;
    }
    if (this.teams) {
      const t = p.team as TeamAB;
      if ((this.cp.teamLives[t] ?? 0) <= 0) this.startTeamPending(t, key);
      return;
    }
    const outBefore = this.order.filter((o) => o !== id && !this.alive(o));
    this.cp.pending.push({ playerId: id, blindKey: key, outBefore });
    this.emit({ t: 'death_pending', player_id: id, blind_key: key });
    this.checkEnd();
  }

  /** Apply the 2-player table; true if the match ended. */
  decide2p(dead: Id, opp: Id, key: string): boolean {
    const o = this.p(opp) as RefPlayer;
    const d = decide2pDeath({
      dead,
      opponent: opp,
      opponentResult: this.resultOf(opp, key),
      opponentLives: o.lives,
      opponentPresent: o.forfeited === 0,
    });
    if (d.kind === 'win') this.finish({ t: 'win', winner_id: d.winner });
    else if (d.kind === 'draw') this.finish({ t: 'win', draw: true });
    return d.kind !== 'pending';
  }

  startTeamPending(side: Team, key: string): void {
    if (this.cp.teamPending) {
      this.reevaluatePending();
      return;
    }
    this.cp.teamPending = { team: side, blindKey: key };
    if (this.decideTeam()) return;
    this.emit({ t: 'death_pending', team_id: side, blind_key: key });
  }

  otherSide(side: Team): Id[] {
    if (side === 'RUNNER') return this.hunters();
    if (side === 'HUNTER') {
      const r = this.runnerId();
      return r === null ? [] : [r];
    }
    return this.members(otherTeam(side as TeamAB));
  }

  /** Team pending (REF-12); true if the match ended. */
  decideTeam(): boolean {
    const tp = this.cp.teamPending;
    if (!tp) return false;
    const other = this.otherSide(tp.team);
    const d = decideTeamPending(
      other.map((id) => {
        const p = this.p(id) as RefPlayer;
        return { result: this.resultOf(id, tp.blindKey), lives: p.lives, left: p.forfeited === 1 };
      }),
    );
    if (d === 'pending') return false;
    if (d === 'draw') this.finish({ t: 'win', draw: true });
    else {
      const winner: Team =
        tp.team === 'RUNNER'
          ? 'HUNTER'
          : tp.team === 'HUNTER'
            ? 'RUNNER'
            : otherTeam(tp.team as TeamAB);
      this.finish({ t: 'win', winner_team_id: winner });
    }
    return true;
  }

  reevaluatePending(): void {
    if (this.over) return;
    if (this.twoP) {
      const d = this.cp.pending[0];
      if (d && d.opponentId) this.decide2p(d.playerId, d.opponentId, d.blindKey);
      return;
    }
    if (this.manhunt || this.teams) {
      if (this.cp.teamPending) this.decideTeam();
      else this.checkEnd();
      return;
    }
    this.checkEnd();
  }

  /* ─── Votes (REF-16, REF-17, D-11) ─── */

  voters(): Id[] {
    const away = new Set(this.s.away);
    return this.aliveIds().filter((id) => !away.has(id));
  }

  vote(kind: 'seed' | 'draw', from: Id): void {
    if (kind === 'draw' && this.practice) return;
    if (kind === 'seed' && this.at - this.cp.startedAt > REF_TIMING.SEED_VOTE_WINDOW_MS) return;
    if (!this.voters().includes(from)) return;
    const list = this.cp.votes[kind];
    if (list.includes(from)) return;
    list.push(from);
    this.cp.votes.openedAt = this.at;
    this.checkVotes(true);
  }

  checkVotes(progress: boolean): void {
    if (this.over) return;
    for (const kind of ['draw', 'seed'] as const) {
      const list = this.cp.votes[kind];
      if (list.length === 0) continue;
      const voters = this.voters();
      const k = list.filter((id) => voters.includes(id)).length;
      const n = voters.length;
      if (progress) this.emit({ t: 'vote_progress', kind, k, n });
      if (n > 0 && k >= n) {
        if (kind === 'draw') this.finish({ t: 'win', draw: true });
        else this.reseed();
        return;
      }
    }
  }

  reseed(): void {
    const seed = randomSeedString(this.rng);
    this.emit({ t: 'reseed', seed });
    this.match.seed = seed;
    const seq = this.cp.seq;
    this.s.cp = freshCheckpoint(this.match, this.at, this.rng.state, seq);
    this.rng = new Rng(this.s.cp.rngState);
    this.broadcastReset();
  }

  /* ─── Forfeit / leave (REF-15) ─── */

  forfeit(id: Id): void {
    const p = this.p(id);
    if (!p || p.forfeited === 1 || this.over) return;
    // A player covered by their own pending death leaving is not a forfeit.
    if (this.cp.pending.some((d) => d.playerId === id)) {
      p.forfeited = 1;
      this.reevaluatePending();
      return;
    }
    if (this.practice) {
      p.forfeited = 1;
      return;
    }
    if (this.twoP) {
      p.forfeited = 1;
      p.hands = 0;
      if (this.cp.pending.length > 0) {
        this.reevaluatePending();
        return;
      }
      const other = this.order.find((o) => o !== id) as Id;
      this.finish({ t: 'player_won', player_id: other });
      return;
    }
    if (this.cp.teamPending) {
      // Leaves while a side is pending are not forfeits; the other side's count toward the draw.
      p.forfeited = 1;
      p.hands = 0;
      this.reevaluatePending();
      return;
    }
    p.forfeited = 1;
    p.hands = 0;
    p.ready = 0;
    if (!this.teams && p.lives > 0) {
      p.lives = 0;
      this.emit({ t: 'player_lives', player_id: id, lives: 0 });
    }
    this.tryResolve();
    this.checkEnd();
    this.maybeStartBlind();
  }
}

/* ─── The step ───────────────────────────────────────────────────────────── */

function cpBody(cp: RefCheckpoint): string {
  return JSON.stringify({ ...cp, seq: 0 });
}

function wakeAtOf(s: RefState): number | null {
  const cp = s.cp;
  let wake: number | null = null;
  const t = cp.lastOutcome?.t;
  if ((t === 'win' || t === 'player_won') && cp.winSentAt.length >= 1 && cp.winSentAt.length <= 2) {
    wake =
      (cp.winSentAt[0] as number) + (REF_TIMING.WIN_RESEND_MS[cp.winSentAt.length - 1] as number);
  }
  if ((cp.votes.seed.length > 0 || cp.votes.draw.length > 0) && cp.votes.openedAt !== undefined) {
    const v = cp.votes.openedAt + REF_TIMING.VOTE_EXPIRY_MS;
    wake = wake === null ? v : Math.min(wake, v);
  }
  return wake;
}

/** Player records in the frozen schema's key order (optional keys come and go). */
const PLAYER_KEYS = [
  'score',
  'highest',
  'hands',
  'lives',
  'skips',
  'ante',
  'furthest',
  'played',
  'ready',
  'first',
  'blocker',
  'team',
  'failedBlind',
  'forfeited',
  'readyAt',
  'startingHands',
] as const satisfies readonly (keyof RefPlayer)[];

function normalizePlayer(p: RefPlayer): RefPlayer {
  const ordered: Record<string, unknown> = {};
  for (const k of PLAYER_KEYS) if (p[k] !== undefined) ordered[k] = p[k];
  return ordered as RefPlayer;
}

/**
 * Canonical form after every step: player records in schema order and the
 * away list limited to unforfeited players in roster order — so a state
 * rebuilt from a (deserialised) checkpoint is byte-identical to the original.
 */
function normalize(s: RefState): void {
  for (const id of Object.keys(s.cp.players))
    s.cp.players[id] = normalizePlayer(s.cp.players[id] as RefPlayer);
  const away = new Set(s.away);
  s.away = s.match.roster
    .map((r) => r.id)
    .filter(
      (id) => away.has(id) && s.cp.players[id] !== undefined && s.cp.players[id].forfeited === 0,
    );
}

function stepResult(
  ctx: Ctx,
  before: string | null,
  prevSeq: number,
  force: boolean,
): RefStep<RefState> {
  ctx.cp.rngState = ctx.rng.state;
  normalize(ctx.s);
  const changed = force || before === null || cpBody(ctx.cp) !== before;
  if (changed) ctx.cp.seq = prevSeq + 1;
  return {
    state: ctx.s,
    out: ctx.out,
    checkpoint: changed ? structuredClone(ctx.cp) : null,
    wakeAt: wakeAtOf(ctx.s),
    over: ctx.over ? ctx.cp.lastOutcome : null,
  };
}

function handleEvent(ctx: Ctx, from: Id, e: Extract<RefInput, { t: 'event' }>['e']): void {
  const p = ctx.p(from);
  if (!p) return;
  if (ctx.over) {
    if (e.t === 'result_request' && ctx.cp.lastOutcome) ctx.emit(ctx.cp.lastOutcome, from);
    return;
  }
  if (p.forfeited === 1) return;
  const alive = ctx.alive(from);
  switch (e.t) {
    case 'set_ante': {
      p.ante = e.ante;
      if (!alive) return;
      if (e.ante > ctx.cp.pairingAnte && (ctx.pairingShape || ctx.teams))
        ctx.computeTargets(e.ante, true);
      if (ctx.manhunt && p.team === 'RUNNER' && e.ante >= REF_TIMING.RUNNER_WIN_ANTE) {
        ctx.finish({ t: 'win', winner_team_id: 'RUNNER' });
        return;
      }
      if (ctx.pendingKeys().length > 0) ctx.reevaluatePending();
      return;
    }
    case 'new_round':
      p.blocker = 0;
      return;
    case 'ready_blind': {
      if (!alive || ctx.inPvp) return;
      p.ready = 1;
      p.startingHands = e.starting_hands;
      if ((ctx.twoP || ctx.practice) && !ctx.order.some((id) => ctx.p(id)?.first === 1))
        p.first = 1;
      if (p.readyAt === undefined) {
        p.readyAt = ctx.at;
        speedrun(ctx, from);
      }
      const keys = ctx.pendingKeys();
      if (keys.length > 0) {
        for (const key of keys) {
          if (
            blindKeySlot(key) === 'Boss' &&
            blindKeyAnte(key) === p.ante &&
            ctx.resultOf(from, key) === undefined
          )
            ctx.record(from, key, 'B');
        }
        ctx.reevaluatePending();
      }
      ctx.maybeStartBlind();
      return;
    }
    case 'unready_blind':
      if (!ctx.inPvp) p.ready = 0;
      return;
    case 'play_hand': {
      if (!alive) return;
      p.score = e.score;
      p.hands = e.hands_left;
      p.skips = e.skips;
      p.highest = maxScore(p.highest, e.score);
      if (ctx.inPvp) {
        if (e.hands_left < p.startingHands) p.played = 1;
        ctx.liveTargets();
        ctx.tryResolve();
      }
      return;
    }
    case 'skip':
      p.skips = e.skips;
      return;
    case 'blind_result': {
      const key = `${e.ante}:${e.blind}`;
      ctx.record(from, key, e.beaten ? 'B' : 'F');
      if (!e.beaten) p.failedBlind = key;
      else if (ctx.pendingKeys().includes(key)) ctx.reevaluatePending();
      return;
    }
    case 'fail_round':
    case 'fail_timer': {
      if (ctx.practice || !alive) return;
      const before = p.lives;
      const lost =
        (e.t === 'fail_timer' || ctx.match.options.deathOnRoundLoss) && ctx.loseLife(from);
      if (lost && before > 0 && p.lives <= 0) {
        ctx.onBlindDeath(from);
        if (ctx.over) return;
      } else if (!ctx.twoP && p.lives > 0) {
        // REF-23: a fail with lives remaining forces 0 hands so the PvP batch cannot stall.
        p.hands = 0;
        ctx.tryResolve();
      }
      ctx.reevaluatePending();
      return;
    }
    case 'fail_pvp_timer': {
      if (!alive || !ctx.inPvp || p.hands < 1) return;
      p.hands -= 1;
      ctx.emit({ t: 'timer_hand_lost', player_id: from });
      ctx.timerLossBy = from;
      ctx.tryResolve();
      return;
    }
    case 'furthest_blind':
      p.furthest = e.value;
      return;
    case 'redeem_ante_voucher': {
      if (!ctx.manhunt || p.team !== 'RUNNER' || !alive) return;
      for (const id of ctx.hunters()) {
        if (!ctx.alive(id)) continue;
        const h = ctx.p(id) as RefPlayer;
        h.lives = Math.min(REF_TIMING.MAX_LIVES, h.lives + 1);
        ctx.emit({ t: 'player_lives', player_id: id, lives: h.lives });
      }
      return;
    }
    case 'forfeit':
      ctx.forfeit(from);
      ctx.checkVotes(false);
      return;
    case 'seed_vote':
      ctx.vote('seed', from);
      return;
    case 'draw_vote':
      ctx.vote('draw', from);
      return;
    case 'result_request':
      return;
  }
}

/** D-18: both players qualify when one readies within 30 s of their ante nemesis. */
function speedrun(ctx: Ctx, from: Id): void {
  const nem = ctx.pairingShape
    ? ctx.cp.pairing[from]
    : ctx.teams
      ? ctx.cp.teamCardTargets[from]
      : undefined;
  if (!nem || nem === from) return;
  const other = ctx.p(nem);
  if (!other || other.readyAt === undefined) return;
  if (Math.abs(ctx.at - other.readyAt) > REF_TIMING.SPEEDRUN_WINDOW_MS) return;
  ctx.emit({ t: 'speedrun', player_id: from }, from);
  ctx.emit({ t: 'speedrun', player_id: nem }, nem);
}

export function refStep(state: RefState | null, input: RefInput): RefStep<RefState> {
  if (input.t === 'reset') {
    const match = structuredClone(input.match);
    const prevSeq = state?.cp.seq ?? 0;
    const s: RefState = {
      match,
      cp: freshCheckpoint(match, input.at, input.rngSeed, prevSeq),
      away: [],
    };
    const ctx = new Ctx(s, input.at);
    ctx.broadcastReset();
    return stepResult(ctx, null, prevSeq, true);
  }
  if (!state)
    throw new Error(
      `refStep: '${input.t}' needs a state (reset first, or refCreate(match) for a restore)`,
    );

  if (input.t === 'restore') {
    if (input.checkpoint.runId !== state.match.runId) {
      // Never adopt a previous match's checkpoint (REF-19).
      const ctx = new Ctx(structuredClone(state), input.at);
      return stepResult(ctx, cpBody(ctx.cp), ctx.cp.seq, false);
    }
    const s = refFromCheckpoint(state.match, input.checkpoint, input.present);
    const prevSeq = Math.max(s.cp.seq, state.cp.seq);
    const ctx = new Ctx(s, input.at);
    ctx.resync('*');
    if (!ctx.over) {
      ctx.reevaluatePending();
      ctx.maybeStartBlind();
      ctx.tryResolve();
      ctx.checkEnd();
    }
    return stepResult(ctx, null, prevSeq, true);
  }

  const s = structuredClone(state);
  const ctx = new Ctx(s, input.at);
  const before = cpBody(s.cp);
  const prevSeq = s.cp.seq;

  switch (input.t) {
    case 'event':
      handleEvent(ctx, input.from, input.e);
      break;
    case 'presence': {
      const p = ctx.p(input.id);
      if (!p) break;
      const away = new Set(s.away);
      switch (input.status) {
        case 'away':
          away.add(input.id);
          break;
        case 'back':
          away.delete(input.id);
          break;
        case 'rejoined':
          away.delete(input.id);
          if (p.forfeited === 0 && !ctx.inPvp && !ctx.over) p.ready = 0;
          break;
        default:
          away.delete(input.id);
      }
      s.away = ctx.order.filter((id) => away.has(id));
      if (input.status === 'rejoined' && p.forfeited === 0) ctx.resync(input.id);
      if (
        input.status === 'left' ||
        input.status === 'grace_expired' ||
        input.status === 'catchup_expired'
      )
        ctx.forfeit(input.id);
      ctx.checkVotes(false);
      break;
    }
    case 'tick': {
      const cp = s.cp;
      if (ctx.over && cp.lastOutcome) {
        while (cp.winSentAt.length >= 1 && cp.winSentAt.length <= 2) {
          const due =
            (cp.winSentAt[0] as number) +
            (REF_TIMING.WIN_RESEND_MS[cp.winSentAt.length - 1] as number);
          if (input.at < due) break;
          cp.winSentAt.push(input.at);
          ctx.emit(cp.lastOutcome);
        }
      }
      if (
        (cp.votes.seed.length > 0 || cp.votes.draw.length > 0) &&
        cp.votes.openedAt !== undefined &&
        input.at >= cp.votes.openedAt + REF_TIMING.VOTE_EXPIRY_MS
      ) {
        const n = ctx.voters().length;
        for (const kind of ['seed', 'draw'] as const) {
          if (cp.votes[kind].length > 0) ctx.emit({ t: 'vote_progress', kind, k: 0, n });
        }
        cp.votes = { seed: [], draw: [] };
      }
      break;
    }
  }
  return stepResult(ctx, before, prevSeq, false);
}

/** Validate an untrusted checkpoint (e.g. from a peer before a takeover). */
export function parseCheckpoint(raw: unknown): RefCheckpoint | null {
  return parseRefCheckpoint(raw);
}
