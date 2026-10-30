/**
 * Messages between a page and its listen worker (client/net/listen-server.ts
 * → `./match-runner.ts`).
 *
 * Structured-clone shapes only (no classes, no functions). Binary payloads
 * travel as `ArrayBuffer`s in the transfer list, so an input packet or a
 * snapshot crosses the thread boundary without a copy.
 */

import type { MatchCommand, MatchOptions, PlayerInfo, RoomSummary } from './match-host';
import type { Catalog } from '../../tf2-loadout/catalog-types';

/** Pool → worker. */
export type ToWorker =
  | { t: 'create'; matchId: string; opts: MatchOptions }
  | { t: 'add'; matchId: string; playerId: number; info: PlayerInfo }
  | { t: 'remove'; matchId: string; playerId: number }
  /** `data` is transferred; the pool copies socket.io's pooled Buffer first. */
  | { t: 'input'; matchId: string; playerId: number; data: ArrayBuffer }
  | { t: 'command'; matchId: string; playerId: number; cmd: MatchCommand }
  /**
   * The player's client starts over on the same seat (a peer-to-peer member
   * rejoining within its grace): `MatchHost.resyncPlayer`.
   */
  | { t: 'resync'; matchId: string; playerId: number }
  /** `changelevel`: the room's owner (hub) or the listen server's host asked; the map is on the allowlist. */
  | { t: 'changelevel'; matchId: string; map: string }
  /** A dedicated room's owner changed (hub player id; null: nobody). */
  | { t: 'owner'; matchId: string; playerId: number | null }
  | { t: 'dispose'; matchId: string }
  /**
   * The item schema (the loadout builder's catalog) every match on the thread reads: items
   * beyond stock and the equip checks (sim/items). Sent on spawn and whenever the hub sees a new one.
   */
  | { t: 'items'; catalog: Catalog | null }
  | { t: 'shutdown' };

export interface WirePacket {
  to: number | 'all';
  reliable: boolean;
  data: ArrayBuffer;
}

/** One match's output for one tick. */
export interface MatchFrame {
  matchId: string;
  tick: number;
  packets: WirePacket[];
}

export type CloseReason = 'map-failed' | 'server-error' | 'empty';

/** Worker → pool. */
export type FromWorker =
  | { t: 'ready' }
  /** The factory resolved; the match ticks from here on. */
  | { t: 'created'; matchId: string; tick: number; tickInterval: number }
  /** Every match's packets for one tick, in one message. */
  | { t: 'frames'; frames: MatchFrame[] }
  | { t: 'summaries'; items: Array<{ matchId: string; summary: RoomSummary }> }
  /** The worker closed a match on its own (factory rejected, host threw, empty too long). */
  | { t: 'closed'; matchId: string; reason: CloseReason; message?: string }
  /**
   * Liveness and load, every couple of seconds while the worker hosts a match.
   * A worker that stops sending these is wedged (an infinite loop in a host)
   * and the pool terminates it.
   */
  | { t: 'heartbeat'; matches: number; droppedTicks: number; tickCostMs: number };
