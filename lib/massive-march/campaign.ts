/**
 * Massive March — campaign state and progression.
 *
 * A campaign is the save: one island, one group's history on it, one clock. It
 * belongs to the host (§6.1), which is why the host has to be present for it to
 * be continued — the state lives in their row and is loaded into the hub when
 * they open a session.
 *
 * Progression is deliberately dumb and deliberately physical. A finished puzzle
 * produces red rounds *as objects*; the objects have to be carried to a tower;
 * the tower counts them and, at its threshold, hands over a key. There is no
 * currency, no experience, and nothing that accrues while you are not there.
 * What actually improves over a campaign is the group's knowledge of the island
 * (§13.4), and that is not something a save file can hold.
 *
 * Pure module: no clock of its own, no I/O, no sockets. The hub owns time and
 * passes it in, which is also what makes the whole thing testable.
 */

import { DAY_LENGTH_MS, isNight, type WorldVariant } from './constants';
import type { ItemDescriptor, TowerStatus, WorldEvent, WorldSnapshot } from './net/events';
import {
  createAllRuntimes,
  restoreRuntimes,
  statusOf,
  type PuzzleContext,
  type PuzzleRuntime,
} from './puzzles';
import { PUZZLE_BY_ID, PUZZLE_SITES, TOWERS, type KeyId, type UnlockId } from './world/sites';

export interface CampaignState {
  /** Fixed at creation; every puzzle's shuffle derives from it. */
  seed: number;
  variant: WorldVariant;
  name: string;
  /** Host preference: may the group skip an inaccessible challenge (§17). */
  allowSkip: boolean;
  runtimes: Record<string, PuzzleRuntime>;
  /** Red rounds handed to each tower. */
  deposits: Record<string, number>;
  keys: KeyId[];
  unlocks: UnlockId[];
  /** Rounds produced by solved puzzles, whether or not they are banked yet. */
  produced: number;
  finished: boolean;
  /** Elapsed in-game milliseconds; the day/night cycle reads this. */
  clockMs: number;
}

/**
 * A campaign opens mid-morning.
 *
 * Not at dawn: the first hour of a new campaign is people learning to walk and
 * throw things at each other, and doing that in the dark is a worse first
 * impression than any amount of atmosphere is worth.
 */
const CLOCK_OFFSET = 0.34;

export function createCampaign(options: {
  seed?: number;
  variant: WorldVariant;
  name: string;
  allowSkip?: boolean;
}): CampaignState {
  const seed = options.seed ?? (Math.floor(Math.random() * 0xffffffff) >>> 0);
  return {
    seed,
    variant: options.variant,
    name: options.name,
    allowSkip: options.allowSkip ?? false,
    runtimes: createAllRuntimes(seed, options.variant),
    deposits: Object.fromEntries(TOWERS.map((t) => [t.id, 0])),
    keys: [],
    unlocks: [],
    produced: 0,
    finished: false,
    clockMs: 0,
  };
}

// ─── Clock ──────────────────────────────────────────────────────────────────

export function dayFraction(state: CampaignState): number {
  return ((state.clockMs / DAY_LENGTH_MS + CLOCK_OFFSET) % 1 + 1) % 1;
}

export function campaignIsNight(state: CampaignState): boolean {
  return isNight(dayFraction(state));
}

/** Advance the world clock. Only ever called while at least one player is on. */
export function advanceClock(state: CampaignState, deltaMs: number): void {
  state.clockMs += Math.max(0, Math.min(deltaMs, 60_000));
}

// ─── Progression ────────────────────────────────────────────────────────────

/**
 * Give a tower some red rounds.
 *
 * Over-depositing is allowed and is not wasted in any way that matters — the
 * tower simply stops caring past its threshold — because a group that carried
 * four rounds up a hill should not be told that the fourth one was a mistake.
 */
export function deposit(state: CampaignState, towerId: string, count: number): WorldEvent[] {
  const tower = TOWERS.find((t) => t.id === towerId);
  if (!tower || count <= 0) return [];

  const before = state.deposits[towerId] ?? 0;
  const after = before + count;
  state.deposits[towerId] = after;

  const events: WorldEvent[] = [
    { kind: 'deposit', tower: towerId, deposited: after, threshold: tower.threshold },
  ];

  if (before >= tower.threshold || after < tower.threshold) return events;

  // Threshold crossed on this deposit.
  if (tower.key && !state.keys.includes(tower.key)) {
    state.keys.push(tower.key);
    events.push({ kind: 'key', key: tower.key, tower: towerId });
  }
  for (const unlock of tower.unlocks) {
    if (state.unlocks.includes(unlock)) continue;
    // The gate is the exception: it opens only when everything else has.
    if (unlock === 'gate' && !gateReady(state)) continue;
    state.unlocks.push(unlock);
    events.push({ kind: 'unlock', unlock });
  }

  return events;
}

/**
 * Whether the White Gate will open.
 *
 * Rounds alone are not enough: the gate wants the three keys and the Final
 * March, so the campaign cannot be finished by grinding the easy sites and
 * walking past the synthesis it was building toward (§12.11).
 */
export function gateReady(state: CampaignState): boolean {
  const gate = TOWERS.find((t) => t.id === 'gate');
  if (!gate) return false;
  if ((state.deposits.gate ?? 0) < gate.threshold) return false;
  if (!(['yellow', 'blue', 'red'] as KeyId[]).every((k) => state.keys.includes(k))) return false;
  const final = state.runtimes['final-march'];
  return Boolean(final && (final.solved || final.skipped));
}

/** Re-derive the gate's openness after anything that could have changed it. */
export function refreshGate(state: CampaignState): WorldEvent[] {
  if (state.unlocks.includes('gate') || !gateReady(state)) return [];
  state.unlocks.push('gate');
  return [{ kind: 'unlock', unlock: 'gate' }];
}

export function finish(state: CampaignState): WorldEvent[] {
  if (state.finished) return [];
  state.finished = true;
  return [{ kind: 'finished' }];
}

/** A solved site pays out; a skipped one does not, and never will. */
export function creditSolve(state: CampaignState, siteId: string): number {
  const site = PUZZLE_BY_ID.get(siteId);
  if (!site) return 0;
  state.produced += site.reward;
  return site.reward;
}

export function skipSite(state: CampaignState, siteId: string): WorldEvent[] {
  const runtime = state.runtimes[siteId];
  const site = PUZZLE_BY_ID.get(siteId);
  if (!runtime || !site || runtime.solved || runtime.skipped) return [];
  runtime.skipped = true;
  // A skip still moves the campaign forward — that is the entire point of the
  // accessibility setting (§17) — so it produces the rounds it would have.
  state.produced += site.reward;
  return [{ kind: 'skipped', site: siteId }];
}

export function solvedCount(state: CampaignState): number {
  return PUZZLE_SITES.filter((s) => {
    const r = state.runtimes[s.id];
    return r?.solved || r?.skipped;
  }).length;
}

export function totalDeposited(state: CampaignState): number {
  return Object.values(state.deposits).reduce((sum, n) => sum + n, 0);
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

export function towerStatuses(state: CampaignState): TowerStatus[] {
  return TOWERS.map((tower) => {
    const deposited = state.deposits[tower.id] ?? 0;
    return {
      id: tower.id,
      deposited,
      threshold: tower.threshold,
      satisfied: tower.id === 'gate' ? gateReady(state) : deposited >= tower.threshold,
    };
  });
}

export function snapshot(
  state: CampaignState,
  ctx: PuzzleContext,
  carried: number,
  items: ItemDescriptor[],
): WorldSnapshot {
  return {
    serverTime: ctx.now,
    dayFraction: dayFraction(state),
    deposited: totalDeposited(state),
    carried,
    puzzles: PUZZLE_SITES.map((site) => statusOf(site, state.runtimes[site.id], ctx)),
    towers: towerStatuses(state),
    keys: [...state.keys],
    unlocks: [...state.unlocks],
    finished: state.finished,
    discovered: PUZZLE_SITES.filter((s) => state.runtimes[s.id]?.discovered).map((s) => s.id),
    items,
  };
}

// ─── Save / load ────────────────────────────────────────────────────────────

export interface CampaignSave {
  version: 1;
  seed: number;
  variant: WorldVariant;
  name: string;
  allowSkip: boolean;
  runtimes: Record<string, PuzzleRuntime>;
  deposits: Record<string, number>;
  keys: KeyId[];
  unlocks: UnlockId[];
  produced: number;
  finished: boolean;
  clockMs: number;
}

export function toSave(state: CampaignState): CampaignSave {
  return {
    version: 1,
    seed: state.seed,
    variant: state.variant,
    name: state.name,
    allowSkip: state.allowSkip,
    runtimes: state.runtimes,
    deposits: state.deposits,
    keys: state.keys,
    unlocks: state.unlocks,
    produced: state.produced,
    finished: state.finished,
    clockMs: state.clockMs,
  };
}

const KEY_IDS: readonly KeyId[] = ['yellow', 'blue', 'red'];
const UNLOCK_IDS: readonly UnlockId[] = ['cart', 'ridge-road', 'repeater', 'gate'];

/**
 * Rebuild a campaign from a stored save.
 *
 * Written defensively on purpose: this is the one place in the game that reads
 * data an older version of the code wrote, and a save that no longer parses is
 * somebody's eleven hours. Anything unrecognised is dropped; anything missing
 * falls back to a fresh value derived from the seed.
 */
export function fromSave(raw: unknown, fallbackVariant: WorldVariant = 'duo'): CampaignState {
  const save = (raw && typeof raw === 'object' ? raw : {}) as Partial<CampaignSave>;
  const variant: WorldVariant =
    save.variant === 'duo' || save.variant === 'trio' || save.variant === 'band'
      ? save.variant
      : fallbackVariant;
  const seed = typeof save.seed === 'number' ? save.seed >>> 0 : 1;

  const state: CampaignState = {
    seed,
    variant,
    name: typeof save.name === 'string' && save.name.trim() ? save.name.slice(0, 60) : 'A long walk',
    allowSkip: save.allowSkip === true,
    runtimes: restoreRuntimes(save.runtimes, seed, variant),
    deposits: Object.fromEntries(
      TOWERS.map((t) => [t.id, Math.max(0, Math.floor(Number(save.deposits?.[t.id] ?? 0)) || 0)]),
    ),
    keys: Array.isArray(save.keys) ? KEY_IDS.filter((k) => save.keys!.includes(k)) : [],
    unlocks: Array.isArray(save.unlocks) ? UNLOCK_IDS.filter((u) => save.unlocks!.includes(u)) : [],
    produced: Math.max(0, Math.floor(Number(save.produced ?? 0)) || 0),
    finished: save.finished === true,
    clockMs: Math.max(0, Number(save.clockMs ?? 0) || 0),
  };

  // Keys are re-derived rather than trusted, so a save written while a tower's
  // threshold was different still lands on the right side of it.
  for (const tower of TOWERS) {
    if (!tower.key) continue;
    if ((state.deposits[tower.id] ?? 0) >= tower.threshold && !state.keys.includes(tower.key)) {
      state.keys.push(tower.key);
    }
  }
  for (const tower of TOWERS) {
    if ((state.deposits[tower.id] ?? 0) < tower.threshold) continue;
    for (const unlock of tower.unlocks) {
      if (unlock === 'gate') continue;
      if (!state.unlocks.includes(unlock)) state.unlocks.push(unlock);
    }
  }
  if (gateReady(state) && !state.unlocks.includes('gate')) state.unlocks.push('gate');

  return state;
}
