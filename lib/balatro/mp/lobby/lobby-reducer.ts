/**
 * The lobby state machine (LOB-05/06/07/11/13/17/18, A3 §2.2): pure functions
 * over the host-authoritative `LobbyState` (types.ts). Every function returns
 * a new state with `version` bumped when anything changed, or the same object
 * when nothing did, so the host broadcasts only real changes and members drop
 * anything at or below the version they hold.
 *
 * Options go through WS4's `sanitizeOptions` (field-wise: a bad value keeps
 * the old one); the ruleset's forced options are applied by `resolveRuleset`
 * at start, which is what travels in `StartedMatch.options`. The test-only
 * `seatGraceMs` is accepted only in test builds (PLAN §6.3).
 */

import { VANILLA_DECKS } from '../setup/draft';
import { resolveRuleset } from '../rulesets/resolve';
import { defaultOptionsFor, sanitizeOptions, shapeFor } from '../rulesets/options';
import { Rng } from '../rng';
import type {
  Id,
  LobbyKind,
  LobbyOptionKey,
  LobbyPlayer,
  LobbyState,
  QueueMode,
  RosterEntry,
  StartedMatch,
  Team,
} from '../types';
import { BALATRO_LIMITS } from '../../net/limits';

export const PRODUCTION_SEAT_GRACE_MS = BALATRO_LIMITS.SEAT_GRACE_MS;

export interface PlayerSeed {
  id: Id;
  name: string;
  avatarUrl: string | null;
  avatarJoker: string;
  blindCol: number;
  role: 'player' | 'spectator';
  joinedAt: number;
  conn?: LobbyPlayer['conn'];
}

function bump(s: LobbyState, patch: Partial<LobbyState>): LobbyState {
  return { ...s, ...patch, version: s.version + 1 };
}

function samePlayer(a: LobbyPlayer, b: LobbyPlayer): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createLobby(o: {
  code: string;
  kind: LobbyKind;
  queueMode: QueueMode;
  host: PlayerSeed;
}): LobbyState {
  return {
    code: o.code,
    kind: o.kind,
    queueMode: o.queueMode,
    hostId: o.host.id,
    successorId: null,
    version: 1,
    open: true,
    players: [toPlayer(o.host)],
    options: defaultOptionsFor(o.queueMode),
    deck: 'b_red',
    stake: 1,
    mpStake: null,
    challenge: null,
    started: null,
    setup: null,
    kicked: [],
    forfeited: {},
  };
}

function toPlayer(p: PlayerSeed): LobbyPlayer {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    avatarJoker: p.avatarJoker,
    blindCol: p.blindCol,
    joinedAt: p.joinedAt,
    ready: false,
    connected: true,
    away: false,
    catchingUp: false,
    role: p.role,
    conn: p.conn ?? 'direct',
  };
}

export function player(s: LobbyState, id: Id): LobbyPlayer | undefined {
  return s.players.find((p) => p.id === id);
}

/** Seated players (not spectators). */
export function seated(s: LobbyState): LobbyPlayer[] {
  return s.players.filter((p) => p.role === 'player');
}

/** Add a player, or bring a known one back (keeps its join order, ready state cleared before a match). */
export function addPlayer(s: LobbyState, seed: PlayerSeed): LobbyState {
  const known = player(s, seed.id);
  if (known) {
    return patchPlayer(s, seed.id, {
      name: seed.name,
      avatarUrl: seed.avatarUrl,
      connected: true,
      away: false,
      conn: seed.conn ?? known.conn,
      ...(s.started ? {} : { ready: false }),
    });
  }
  return bump(s, { players: [...s.players, toPlayer(seed)] });
}

export function removePlayer(s: LobbyState, id: Id): LobbyState {
  if (!player(s, id) || id === s.hostId) return s;
  return bump(s, { players: s.players.filter((p) => p.id !== id) });
}

export function patchPlayer(s: LobbyState, id: Id, patch: Partial<LobbyPlayer>): LobbyState {
  const cur = player(s, id);
  if (!cur) return s;
  const next = { ...cur, ...patch, id: cur.id };
  if (samePlayer(cur, next)) return s;
  return bump(s, { players: s.players.map((p) => (p.id === id ? next : p)) });
}

export function setReady(s: LobbyState, id: Id, ready: boolean): LobbyState {
  if (s.started || id === s.hostId) return s;
  const p = player(s, id);
  if (!p || p.role !== 'player') return s;
  return patchPlayer(s, id, { ready });
}

/** LOB-06: My Team A/B (Teams), Role Hunter/Runner (Manhunt; the Runner is exclusive). */
export function setTeam(s: LobbyState, id: Id, team: Team): LobbyState {
  if (s.started) return s;
  const p = player(s, id);
  if (!p || p.role !== 'player') return s;
  if (s.queueMode === 'pvp_teams' && team !== 'A' && team !== 'B') return s;
  if (s.queueMode === 'pvp_manhunt' && team !== 'HUNTER' && team !== 'RUNNER') return s;
  if (s.queueMode !== 'pvp_teams' && s.queueMode !== 'pvp_manhunt') return s;
  let next = s;
  if (team === 'RUNNER') {
    for (const o of s.players) if (o.id !== id && o.team === 'RUNNER') next = patchPlayer(next, o.id, { team: 'HUNTER' });
  }
  return patchPlayer(next, id, { team });
}

/** LOB-06/07: one option, host only (the caller checks). */
export function setOption(
  s: LobbyState,
  key: LobbyOptionKey,
  value: unknown,
  env: { testBuild: boolean },
): LobbyState {
  if (s.started) return s;
  if (key === 'seatGraceMs' && !env.testBuild) return s;
  if (key === 'gamemode') return s;
  const options = sanitizeOptions({ ...s.options, [key]: value }, s.options);
  if (!env.testBuild) options.seatGraceMs = PRODUCTION_SEAT_GRACE_MS;
  if (JSON.stringify(options) === JSON.stringify(s.options)) return s;
  return bump(s, { options });
}

export function setDeck(
  s: LobbyState,
  d: { deck: string; stake: number; mpStake: LobbyState['mpStake']; challenge: string | null },
): LobbyState {
  if (s.started) return s;
  if (s.deck === d.deck && s.stake === d.stake && s.mpStake === d.mpStake && s.challenge === d.challenge) return s;
  return bump(s, { deck: d.deck, stake: d.stake, mpStake: d.mpStake, challenge: d.challenge });
}

export function setOpen(s: LobbyState, open: boolean): LobbyState {
  return s.open === open ? s : bump(s, { open });
}

export function setSetup(s: LobbyState, setup: LobbyState['setup']): LobbyState {
  return JSON.stringify(s.setup) === JSON.stringify(setup) ? s : bump(s, { setup });
}

/** Kick (LOB-11): gone from the roster and refused at the hub for this lobby's lifetime. */
export function kick(s: LobbyState, id: Id): LobbyState {
  if (id === s.hostId) return s;
  const kicked = s.kicked.includes(id) ? s.kicked : [...s.kicked, id].slice(-256);
  return bump(s, { players: s.players.filter((p) => p.id !== id), kicked });
}

export function markForfeited(s: LobbyState, id: Id, runId: string): LobbyState {
  if (s.forfeited[id] === runId) return s;
  return bump(s, { forfeited: { ...s.forfeited, [id]: runId } });
}

/** Host-named successor: the earliest-joined connected seated player other than the host. */
export function successorOf(s: LobbyState): Id | null {
  const c = seated(s)
    .filter((p) => p.id !== s.hostId && p.connected && !p.away && !(s.started && s.forfeited[p.id] === s.started.runId))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return c[0]?.id ?? null;
}

export function withSuccessor(s: LobbyState): LobbyState {
  const id = successorOf(s);
  return s.successorId === id ? s : bump(s, { successorId: id });
}

export type StartBlock = 'started' | 'setup' | 'players' | 'ready' | 'disconnected';

/** LOB-05: START is enabled iff ≥2 seated players are here and every non-host one is ready. */
export function startBlock(s: LobbyState): StartBlock | null {
  if (s.started) return 'started';
  if (s.setup && s.setup.phase !== 'done') return 'setup';
  const ps = seated(s);
  if (ps.length < 2) return 'players';
  if (ps.some((p) => !p.connected || p.away)) return 'disconnected';
  if (ps.some((p) => p.id !== s.hostId && !p.ready)) return 'ready';
  return null;
}

export interface StartInputs {
  runId: string;
  /** Host CSPRNG seed (D-30), used when the options ask for a random one. */
  seed: string;
  /** Host CSPRNG state for per-player loadouts. */
  rngSeed: number;
  now: number;
  contentHash: string;
}

/** FL-01: the match every peer starts from (seed, loadout, resolved options, roster). */
export function buildMatch(s: LobbyState, inp: StartInputs): StartedMatch {
  const { resolved, options } = resolveRuleset({ options: s.options });
  const rng = Rng.fromSeed(inp.rngSeed);
  const seed = options.customSeed === 'random' ? inp.seed : options.customSeed;
  const players = seated(s).sort((a, b) => a.joinedAt - b.joinedAt);
  const roster: RosterEntry[] = players.map((p) => {
    const e: RosterEntry = { id: p.id, name: p.name, blindCol: p.blindCol, avatarJoker: p.avatarJoker };
    if (p.team) e.team = p.team;
    return e;
  });
  let perPlayer: StartedMatch['perPlayer'];
  if (options.differentSeeds || options.differentDecks || options.randomLoadout) {
    perPlayer = {};
    for (const p of players) {
      const entry: NonNullable<StartedMatch['perPlayer']>[string] = {};
      if (options.differentSeeds) {
        let ps = '';
        for (let i = 0; i < 8; i++) ps += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[rng.int(36)];
        entry.seed = ps;
      }
      if (options.differentDecks || options.randomLoadout) entry.deck = rng.pick(VANILLA_DECKS) ?? 'b_red';
      if (options.randomLoadout) entry.stake = rng.range(1, 8);
      perPlayer[p.id] = entry;
    }
  }
  const match: StartedMatch = {
    runId: inp.runId,
    seed,
    stake: s.stake,
    mpStake: s.mpStake,
    deck: s.deck,
    challenge: s.challenge,
    queueMode: s.queueMode,
    shape: shapeFor(s.queueMode),
    ruleset: options.ruleset,
    layers: resolved.layers,
    options,
    resolved,
    roster,
    startedAt: inp.now,
    hostId: s.hostId,
    contentHash: inp.contentHash,
  };
  if (perPlayer) match.perPlayer = perPlayer;
  return match;
}

/** The lobby with `match` running: closed to newcomers, ready flags cleared. */
export function startLobby(s: LobbyState, match: StartedMatch): LobbyState {
  return bump(s, {
    started: match,
    open: false,
    setup: null,
    players: s.players.map((p) => ({ ...p, ready: false })),
  });
}

/** LOB-17: back to the waiting room after a match (private only); ready reset. */
export function returnToLobby(s: LobbyState): LobbyState {
  if (!s.started) return s;
  return bump(s, {
    started: null,
    open: true,
    players: s.players.filter((p) => p.connected).map((p) => ({ ...p, ready: false, catchingUp: false })),
  });
}

/** The seed changed by a unanimous vote (REF-16): same deck/stake, new seed. */
export function reseedLobby(s: LobbyState, seed: string): LobbyState {
  if (!s.started || s.started.seed === seed) return s;
  return bump(s, { started: { ...s.started, seed } });
}
