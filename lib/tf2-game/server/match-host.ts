/**
 * The seam between the network tier and the simulation.
 *
 * The hub (`server/socket-server/handlers/tf2-game.ts`) owns rooms and sockets;
 * the match worker (`./match-worker.server.ts`, driven by `./match-runner.ts`)
 * owns the clock; a `MatchHost` owns everything about the game itself. The
 * runner calls a host in exactly this order of concerns and nothing else:
 *
 *   - `addPlayer` / `removePlayer` as humans arrive and leave (bots are the
 *     host's own business — `MatchOptions.botCount`);
 *   - `onInput` with each opaque input packet the player's client sent, and
 *     `onCommand` with each validated control-plane command, BETWEEN ticks;
 *   - `tick()` once per 15 ms simulation tick (catch-up ticks run back to back);
 *   - `drainOutgoing()` straight after each `tick()`.
 *
 * Everything a host does happens synchronously inside those calls, on the
 * worker's thread; it never reads wall-clock time (docs/tf2-game.md
 * §Conventions — the sim reads `curtime`, which `tick()` advances).
 *
 * Environment-agnostic: the same host can run in the hub's match worker, in a
 * browser worker as a listen server, and in Vitest.
 */

import type { Tf2Mode } from '../data/maps';
import type { BotDifficulty, ClassChoice, TeamChoice } from '../net/events';
import type { ExtraCommandArgs } from '../net/extra-commands';
import type { LoadoutSlots, TfClass } from '../../tf2-loadout/catalog-types';

/** What a match is created with. Validated by the hub before it gets here. */
export interface MatchOptions {
  /** Unique per process (the room code); used in logs and the runner's routing. */
  matchId: string;
  /** A name on `TF2_MAPS`. The host loads its package (async — object storage). */
  map: string;
  mode: Tf2Mode;
  /** Humans + bots. 2…24. */
  maxPlayers: number;
  botCount: number;
  botDifficulty: BotDifficulty;
  /** Room name, sanitised. */
  name: string;
  /** Seed for the match's random streams (`core/random.ts`). */
  seed: number;
}

/** The control-plane commands a player can send (validated by the hub). */
export type MatchCommand =
  | { kind: 'team'; team: TeamChoice }
  | { kind: 'class'; cls: ClassChoice }
  /**
   * Chat is delivered to clients by the hub (`tf2:chat`); the host is told so
   * it can log it or let bots react. It is not expected to echo it.
   */
  | { kind: 'chat'; text: string; teamOnly: boolean }
  | { kind: 'voice'; menu: 0 | 1 | 2; item: number }
  /**
   * Any other game command (`build 2 0`, `destroy 1`, …), dispatched by name
   * to a handler registered with `registerExtraCommand` (net/extra-commands.ts).
   * Validated by `zExtraCommand` (net/lobby-schema.ts).
   */
  | { kind: 'extra'; command: string; args: ExtraCommandArgs }
  /**
   * Equip a loadout for a class (the pause menu's Loadout view): checked against the item catalog
   * on the simulation thread (sim/items/command.ts), applied at the next respawn or resupply —
   * at once in the player's own respawn room. Shape-validated by `zLoadout` (net/lobby-schema.ts).
   */
  | { kind: 'loadout'; cls: TfClass; slots: LoadoutSlots };

export interface PlayerInfo {
  name: string;
  /** Present for signed-in players. */
  userId?: string;
  /** Joined as a spectator (the join request said so): straight to the spectators, no team menu. */
  spectate?: boolean;
}

/** One packet for the hub to deliver. */
export interface OutgoingPacket {
  /** A player id, or every human in the match. */
  to: number | 'all';
  /**
   * `false` → sent as `tf2:snapshot` with socket.io's volatile flag (dropped
   * rather than queued behind a slow connection). `true` → `tf2:events`, in
   * order, never dropped while the socket lives.
   */
  reliable: boolean;
  /**
   * Ownership passes to the runner: the buffer may be transferred to another
   * thread (detached), so a host must not reuse it after `drainOutgoing()`.
   */
  data: Uint8Array;
}

export interface PlayerSummary {
  id: number;
  /** The player's entity id in the match (what snapshots and scoreboards key by). */
  entity?: number;
  name: string;
  /** TEAM_* (core/constants.ts). The hub routes team chat by it. */
  team: number;
  /** TF_CLASS_* (core/constants.ts). */
  cls: number;
  score: number;
  bot: boolean;
}

/** A cheap, JSON-able digest for the server browser, scoreboard-lite and chat routing. */
export interface RoomSummary {
  map: string;
  mode: Tf2Mode;
  /** The host's tick count. */
  tick: number;
  players: PlayerSummary[];
  /** [RED, BLU] round/capture/score — whatever the mode counts. */
  teamScores: [number, number];
  /** The round for the server browser: the rules' state and the HUD timer's time left. */
  round?: { state: string; timeLeft: number | null } | null;
}

export interface MatchHost {
  addPlayer(id: number, info: PlayerInfo): void;
  removePlayer(id: number): void;
  /** One opaque packet from the player's client; at most `TF2_LIMITS.INPUT_MAX_BYTES`. */
  onInput(id: number, packet: Uint8Array): void;
  onCommand(id: number, cmd: MatchCommand): void;
  /**
   * The player's client starts over on the same seat: forget what it had
   * acknowledged (the next snapshot is full), resend server info and the
   * roster, and accept command numbers from 1 again. Optional; a host without
   * it treats a rejoin as nothing (the runner ignores the message).
   */
  resyncPlayer?(id: number): void;
  /**
   * Move the match to another map (`changelevel`; the caller checked the allowlist and who asked).
   * Humans keep their seats; resolves false when the map could not be loaded. Optional.
   */
  changeLevel?(map: string): Promise<boolean>;
  /** A dedicated room's owner (hub player id) may change the match settings — never cheats. Optional. */
  setOwner?(id: number | null): void;
  /** The host's own tick count, when it does not start at 0 (a restored match, after a level change). */
  tickCount?(): number;
  /** Advance one simulation tick (TICK_INTERVAL = 15 ms of game time). */
  tick(): void;
  /** Everything produced since the last drain. */
  drainOutgoing(): OutgoingPacket[];
  /** No humans left. The runner closes a match that stays empty (safety net). */
  isEmpty(): boolean;
  summary(): RoomSummary;
  dispose(): void;
}

/**
 * Builds a match. Async because the host fetches and parses the map package
 * before the first tick; a rejection closes the room with `map-failed`.
 */
export type MatchFactory = (opts: MatchOptions) => Promise<MatchHost>;
