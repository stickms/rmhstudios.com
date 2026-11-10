/**
 * Balatro multiplayer — the deck + stake Draft (MM-05, A1 §1.6; D-32).
 *
 *     draftStep(state, input) → { state, view, wakeAt, result }
 *
 * - Pool: 9 decks drawn without replacement from every vanilla back (MP
 *   decks only on Expanded / Small World); each tile gets a random stake
 *   1…maxStake (8 unless capped).
 * - 2 players: a random first actor A; A bans 1, B bans 3, A bans 3, then B
 *   **picks** 1 of the last 2.
 * - N players: 8 single bans rotating over the seated players in seat order
 *   (`actor = players[i mod N]`); the last surviving tile is the deck.
 * - 30 s per turn (a turn = one actor's consecutive bans or the pick); on
 *   timeout the turn's remaining actions are made uniformly at random.
 * - With fewer than 9 candidates the pool is all of them and the schedule
 *   shrinks to `pool − 1` single bans.
 */

import { Rng } from '../rng';
import type { Id, SetupView } from '../types';

export const DRAFT_TIMING = { TURN_MS: 30_000, POOL_SIZE: 9, MAX_STAKE: 8 } as const;

export const VANILLA_DECKS = [
  'b_red',
  'b_blue',
  'b_yellow',
  'b_green',
  'b_black',
  'b_magic',
  'b_nebula',
  'b_ghost',
  'b_abandoned',
  'b_checkered',
  'b_zodiac',
  'b_painted',
  'b_anaglyph',
  'b_plasma',
  'b_erratic',
] as const;

export const MP_DECKS = [
  'b_mp_violet',
  'b_mp_indigo',
  'b_mp_orange',
  'b_mp_oracle',
  'b_mp_gradient',
  'b_mp_heidelberg',
  'b_mp_echodeck',
  'b_mp_cocktail',
] as const;

/** MP decks join the candidates only on Expanded or Small World. */
export function draftCandidates(ruleset: string): string[] {
  const mp = ruleset === 'ruleset_mp_expanded' || ruleset === 'ruleset_mp_smallworld';
  return mp ? [...VANILLA_DECKS, ...MP_DECKS] : [...VANILLA_DECKS];
}

export interface DraftTile {
  deck: string;
  stake: number;
  state: 'open' | 'banned' | 'picked';
}

export interface DraftTurn {
  actor: Id;
  action: 'ban' | 'pick';
  count: number;
}

export interface DraftState {
  stepId: string;
  players: Id[];
  tiles: DraftTile[];
  turns: DraftTurn[];
  turnIdx: number;
  doneInTurn: number;
  turnStartedAt: number;
  phase: 'voting' | 'done';
  result: { deck: string; stake: number } | null;
  rngState: number;
}

export type DraftInput =
  { t: 'choose'; at: number; from: Id; key: string } | { t: 'tick'; at: number };

export interface DraftStep {
  state: DraftState;
  view: SetupView;
  wakeAt: number | null;
  result: { deck: string; stake: number } | null;
}

export function draftSchedule(players: readonly Id[], poolSize: number, rng: Rng): DraftTurn[] {
  if (players.length === 0 || poolSize <= 1) return [];
  if (players.length === 2 && poolSize === DRAFT_TIMING.POOL_SIZE) {
    const flip = rng.int(2) === 1;
    const a = players[flip ? 1 : 0] as Id;
    const b = players[flip ? 0 : 1] as Id;
    return [
      { actor: a, action: 'ban', count: 1 },
      { actor: b, action: 'ban', count: 3 },
      { actor: a, action: 'ban', count: 3 },
      { actor: b, action: 'pick', count: 1 },
    ];
  }
  const turns: DraftTurn[] = [];
  for (let i = 0; i < poolSize - 1; i++)
    turns.push({ actor: players[i % players.length] as Id, action: 'ban', count: 1 });
  return turns;
}

export interface DraftOpen {
  stepId: string;
  players: readonly Id[];
  candidates: readonly string[];
  at: number;
  /** A raw seed from the host driver (mixed with `rngSeed`). */
  rngState: number;
  maxStake?: number;
}

export function openDraft(o: DraftOpen): DraftState {
  const rng = Rng.fromSeed(o.rngState);
  const maxStake = Math.max(
    1,
    Math.min(DRAFT_TIMING.MAX_STAKE, Math.floor(o.maxStake ?? DRAFT_TIMING.MAX_STAKE)),
  );
  const unique = [...new Set(o.candidates)];
  const pool = rng.shuffle(unique).slice(0, DRAFT_TIMING.POOL_SIZE);
  const tiles: DraftTile[] = pool.map((deck) => ({
    deck,
    stake: rng.range(1, maxStake),
    state: 'open',
  }));
  const turns = draftSchedule(o.players, tiles.length, rng);
  const s: DraftState = {
    stepId: o.stepId,
    players: [...o.players],
    tiles,
    turns,
    turnIdx: 0,
    doneInTurn: 0,
    turnStartedAt: o.at,
    phase: 'voting',
    result: null,
    rngState: rng.state,
  };
  settle(s);
  return s;
}

function open(s: DraftState): DraftTile[] {
  return s.tiles.filter((t) => t.state === 'open');
}

/** Finish when the schedule is exhausted (the last open tile, or the picked one). */
function settle(s: DraftState): void {
  if (s.phase === 'done') return;
  const picked = s.tiles.find((t) => t.state === 'picked');
  const rest = open(s);
  if (picked || s.turnIdx >= s.turns.length || rest.length <= 1) {
    const tile = picked ?? rest[0];
    if (tile && !picked) tile.state = 'picked';
    s.phase = 'done';
    s.result = tile ? { deck: tile.deck, stake: tile.stake } : null;
  }
}

function apply(s: DraftState, tile: DraftTile, at: number): void {
  const turn = s.turns[s.turnIdx] as DraftTurn;
  tile.state = turn.action === 'pick' ? 'picked' : 'banned';
  s.doneInTurn += 1;
  if (s.doneInTurn >= turn.count) {
    s.turnIdx += 1;
    s.doneInTurn = 0;
    s.turnStartedAt = at;
  }
  settle(s);
}

export function draftView(s: DraftState, at: number): SetupView {
  const turn = s.phase === 'voting' ? s.turns[s.turnIdx] : undefined;
  return {
    stepId: s.stepId,
    kind: 'draft',
    phase: s.phase,
    msLeft: turn ? Math.max(0, Math.round(s.turnStartedAt + DRAFT_TIMING.TURN_MS - at)) : 0,
    options: [],
    voted: 0,
    voters: s.players.length,
    result: s.result ? s.result.deck : null,
    draft: {
      tiles: s.tiles.map((t) => ({ ...t })),
      actor: turn ? turn.actor : null,
      action: turn ? turn.action : 'pick',
      remaining: turn ? turn.count - s.doneInTurn : 0,
    },
  };
}

export function draftStep(state: DraftState, input: DraftInput): DraftStep {
  const s: DraftState = {
    ...state,
    players: [...state.players],
    tiles: state.tiles.map((t) => ({ ...t })),
    turns: state.turns.map((t) => ({ ...t })),
    result: state.result ? { ...state.result } : null,
  };
  // Timeouts first: every turn whose deadline passed is completed at random.
  while (s.phase === 'voting' && input.at >= s.turnStartedAt + DRAFT_TIMING.TURN_MS) {
    const deadline = s.turnStartedAt + DRAFT_TIMING.TURN_MS;
    const idx = s.turnIdx;
    const rng = new Rng(s.rngState);
    while (s.phase === 'voting' && s.turnIdx === idx) {
      const tile = rng.pick(open(s));
      if (!tile) break;
      apply(s, tile, deadline);
    }
    s.rngState = rng.state;
  }
  if (input.t === 'choose' && s.phase === 'voting') {
    const turn = s.turns[s.turnIdx];
    const tile = s.tiles.find((t) => t.deck === input.key && t.state === 'open');
    if (turn && turn.actor === input.from && tile) apply(s, tile, input.at);
  }
  return {
    state: s,
    view: draftView(s, input.at),
    wakeAt: s.phase === 'voting' ? s.turnStartedAt + DRAFT_TIMING.TURN_MS : null,
    result: s.result,
  };
}
