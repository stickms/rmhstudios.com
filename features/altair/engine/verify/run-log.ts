// =============================================================================
// ALTAIR VERIFY -- Run log (the replayable record of a co-op run)
// =============================================================================
// A co-op run is a pure function of (seed, roster, doubleTime, and the calls made
// to the sim BETWEEN steps): player inputs, level-up picks, drop-ins and leaves. The
// host's HostSim records exactly those calls here, and the server replays them
// through the same engine to compute the authoritative result. Nothing in a log is a
// RESULT; results are recomputed, never trusted.
//
// Client-safe (no node: imports) so the browser can record and compress it.
//
// Compact form: one flat integer array, ticks delta-encoded.
//   [dt, 0, player, dx, dy]   input change; dx/dy are integers in -100..100 (hundredths)
//   [dt, 1, player, choice]   level-up pick (index into the offered choices)
//   [dt, 2, join]             drop-in: index into `joins`
//   [dt, 3, player]           the player left for good
// `dt` is the number of sim steps since the previous event. `player` is an index into
// roster ++ joins (join order), never reused.
// =============================================================================

import { SIM_VERSION } from '../sim-version';

export const RUN_LOG_VERSION = 1;

/** Sim steps are 60 Hz. */
export const STEPS_PER_SECOND = 60;
/** A run is capped at 30 real minutes of sim (a legitimate victory is ~20 game minutes). */
export const MAX_RUN_STEPS = 30 * 60 * STEPS_PER_SECOND;
/** Flat-array cap: ~240k events, far above a busy 4-player 20 minute run. */
export const MAX_LOG_NUMBERS = 1_200_000;
export const MAX_LOG_PLAYERS = 4;
export const MAX_JOINS = 16;

export const EV_INPUT = 0;
export const EV_PICK = 1;
export const EV_JOIN = 2;
export const EV_LEAVE = 3;

export interface LogPlayer {
  id: string;
  classId: string;
  slot: number;
}

export interface RunLog {
  v: number;
  /** The sim version the run was played on (features/altair/engine/sim-version.ts). Absent on older logs = 1. */
  sim?: number;
  seed: number;
  doubleTime: boolean;
  roster: LogPlayer[];
  joins: LogPlayer[];
  /** Total sim steps the run took. */
  steps: number;
  ev: number[];
}

/** Quantise a movement intent component to the integer the log stores (and the sim uses). */
export function quantiseIntent(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v * 100)));
}

/** Records the between-step calls made to a HostSim. */
export class RunRecorder {
  readonly roster: LogPlayer[];
  readonly joins: LogPlayer[] = [];
  readonly ev: number[] = [];
  /** True once the log outgrew its cap: it is no longer replayable and must not be submitted. */
  overflow = false;
  private readonly index = new Map<string, number>();
  private nextIndex: number;
  private lastTick = 0;
  private readonly lastInput = new Map<number, number>();

  constructor(roster: LogPlayer[]) {
    this.roster = roster.map((p) => ({ id: p.id, classId: p.classId, slot: p.slot }));
    this.roster.forEach((p, i) => this.index.set(p.id, i));
    this.nextIndex = this.roster.length;
  }

  private push(tick: number, ...rest: number[]): void {
    if (this.overflow) return;
    if (this.ev.length + rest.length + 1 > MAX_LOG_NUMBERS) {
      this.overflow = true;
      return;
    }
    this.ev.push(tick - this.lastTick, ...rest);
    this.lastTick = tick;
  }

  /** An accepted movement intent (already quantised). Repeats of the same value are not logged. */
  input(tick: number, playerId: string, qx: number, qy: number): void {
    const p = this.index.get(playerId);
    if (p === undefined) return;
    const packed = qx * 1000 + qy; // both in -100..100, so this is collision free
    if (this.lastInput.get(p) === packed) return;
    // A fresh player's implicit input is (0, 0).
    if (!this.lastInput.has(p) && qx === 0 && qy === 0) return;
    this.lastInput.set(p, packed);
    this.push(tick, EV_INPUT, p, qx, qy);
  }

  pick(tick: number, playerId: string, choice: number): void {
    const p = this.index.get(playerId);
    if (p === undefined) return;
    this.push(tick, EV_PICK, p, choice);
  }

  join(tick: number, init: LogPlayer): void {
    if (this.joins.length >= MAX_JOINS) {
      this.overflow = true;
      return;
    }
    const joinIdx = this.joins.length;
    this.joins.push({ id: init.id, classId: init.classId, slot: init.slot });
    this.index.set(init.id, this.nextIndex++);
    this.push(tick, EV_JOIN, joinIdx);
  }

  leave(tick: number, playerId: string): void {
    const p = this.index.get(playerId);
    if (p === undefined) return;
    this.index.delete(playerId);
    this.lastInput.delete(p);
    this.push(tick, EV_LEAVE, p);
  }

  toLog(steps: number, seed: number, doubleTime: boolean): RunLog {
    return {
      v: RUN_LOG_VERSION,
      sim: SIM_VERSION,
      seed,
      doubleTime,
      roster: this.roster,
      joins: this.joins,
      steps,
      ev: this.ev.slice(),
    };
  }
}

// ---- Decoding / validation (server side, and tests) ----------------------------

export type DecodedEvent =
  | { tick: number; type: typeof EV_INPUT; player: number; dx: number; dy: number }
  | { tick: number; type: typeof EV_PICK; player: number; choice: number }
  | { tick: number; type: typeof EV_JOIN; join: number }
  | { tick: number; type: typeof EV_LEAVE; player: number };

export type LogCheck = { ok: true; events: DecodedEvent[] } | { ok: false; reason: string };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function checkPlayer(p: unknown): p is LogPlayer {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    o.id.length <= 64 &&
    typeof o.classId === 'string' &&
    o.classId.length > 0 &&
    o.classId.length <= 64 &&
    isInt(o.slot) &&
    o.slot >= 0 &&
    o.slot <= 3
  );
}

/**
 * Structural validation of an UNTRUSTED log: shape, bounds, monotonic ticks, indices that exist
 * at the moment they are used. Returns the decoded events. Never throws.
 */
export function checkRunLog(raw: unknown): LogCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'log is not an object' };
  const log = raw as Record<string, unknown>;
  if (log.v !== RUN_LOG_VERSION) return { ok: false, reason: 'unsupported log version' };
  if (log.sim !== undefined && (!isInt(log.sim) || log.sim < 1 || log.sim > 1_000_000)) return { ok: false, reason: 'bad sim version' };
  if (!isInt(log.seed) || log.seed < 0 || log.seed >= 2 ** 32) return { ok: false, reason: 'bad seed' };
  if (typeof log.doubleTime !== 'boolean') return { ok: false, reason: 'bad doubleTime' };
  if (!isInt(log.steps) || log.steps < 1 || log.steps > MAX_RUN_STEPS) {
    return { ok: false, reason: 'run length out of bounds' };
  }
  const roster = log.roster;
  const joins = log.joins;
  if (!Array.isArray(roster) || roster.length < 1 || roster.length > MAX_LOG_PLAYERS || !roster.every(checkPlayer)) {
    return { ok: false, reason: 'bad roster' };
  }
  if (!Array.isArray(joins) || joins.length > MAX_JOINS || !joins.every(checkPlayer)) {
    return { ok: false, reason: 'bad joins' };
  }
  const ev = log.ev;
  if (!Array.isArray(ev) || ev.length > MAX_LOG_NUMBERS) return { ok: false, reason: 'event log too long' };

  const total = roster.length + joins.length;
  const joined = new Set<number>(); // join indices already announced
  const present = new Set<number>(); // player indices currently in the match
  for (let i = 0; i < roster.length; i++) present.add(i);
  const events: DecodedEvent[] = [];
  let tick = 0;
  let i = 0;
  while (i < ev.length) {
    const dt = ev[i];
    const type = ev[i + 1];
    if (!isInt(dt) || dt < 0 || !isInt(type)) return { ok: false, reason: 'malformed event' };
    tick += dt;
    if (tick > log.steps) return { ok: false, reason: 'event after the end of the run' };
    switch (type) {
      case EV_INPUT: {
        const [p, dx, dy] = [ev[i + 2], ev[i + 3], ev[i + 4]];
        if (!isInt(p) || !isInt(dx) || !isInt(dy) || p < 0 || p >= total) return { ok: false, reason: 'bad input event' };
        if (Math.abs(dx) > 100 || Math.abs(dy) > 100 || dx * dx + dy * dy > 10_200) {
          return { ok: false, reason: 'input outside the unit circle' };
        }
        events.push({ tick, type, player: p, dx, dy });
        i += 5;
        break;
      }
      case EV_PICK: {
        const [p, choice] = [ev[i + 2], ev[i + 3]];
        if (!isInt(p) || !isInt(choice) || p < 0 || p >= total || choice < 0 || choice > 7) {
          return { ok: false, reason: 'bad pick event' };
        }
        events.push({ tick, type, player: p, choice });
        i += 4;
        break;
      }
      case EV_JOIN: {
        const j = ev[i + 2];
        if (!isInt(j) || j < 0 || j >= joins.length || joined.has(j)) return { ok: false, reason: 'bad join event' };
        if (present.size >= MAX_LOG_PLAYERS) return { ok: false, reason: 'too many players' };
        joined.add(j);
        present.add(roster.length + j);
        events.push({ tick, type, join: j });
        i += 3;
        break;
      }
      case EV_LEAVE: {
        const p = ev[i + 2];
        if (!isInt(p) || !present.has(p)) return { ok: false, reason: 'bad leave event' };
        present.delete(p);
        events.push({ tick, type, player: p });
        i += 3;
        break;
      }
      default:
        return { ok: false, reason: 'unknown event type' };
    }
  }
  if (i !== ev.length) return { ok: false, reason: 'truncated event' };
  if (joined.size !== joins.length) return { ok: false, reason: 'announced join missing' };
  return { ok: true, events };
}
