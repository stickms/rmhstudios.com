/**
 * Where a game's console lives: one `GameConsole` per HUD store (the play
 * page makes one store per run of a game), found by whoever needs it — the
 * game client (`attachConsoleHost`, in its `start`) and the React panel
 * (`gameConsoleFor`). Neither has to create the other's half.
 *
 *   // the client, once:
 *   this.console = attachConsoleHost(this.store, 'tf2', host);
 *   // its frame, after rendering:
 *   this.console.frame();
 *   // a console / cvar event from the authority:
 *   if (this.console.serverEvent(ev)) return;
 *   // an input packet sent:
 *   this.console.netOut(packet.byteLength);
 *   // dispose:
 *   this.console.detach();
 *
 * Environment-agnostic.
 */

import type { HudGame } from '../client/hud-state';
import type { HudStore } from '../client/hud-store';
import { GameConsole, type ConsoleHost, type GameConsoleOptions } from './game-console';

const consoles = new WeakMap<HudStore, GameConsole>();

/** The console of a store's game (created on first use). */
export function gameConsoleFor(store: HudStore, game: HudGame, opts?: GameConsoleOptions): GameConsole {
  let c = consoles.get(store);
  if (!c) {
    c = new GameConsole(store, game, opts);
    consoles.set(store, c);
  }
  return c;
}

/** The console of a store, if one was made. */
export function peekGameConsole(store: HudStore): GameConsole | null {
  return consoles.get(store) ?? null;
}

/** The client's handle on its console. */
export interface ConsoleLink {
  readonly console: GameConsole;
  /** After each rendered frame: runs `wait`ed commands, takes a pending screenshot. */
  frame(): void;
  /** True when `ev` was the console's (a reply or a replicated cvar): the client drops it. */
  serverEvent(ev: { type: string }): boolean;
  /** An input packet went out (net_graph). */
  netOut(bytes: number): void;
  detach(): void;
}

/** The game client mounts its side of the console. */
export function attachConsoleHost(store: HudStore, game: HudGame, host: ConsoleHost): ConsoleLink {
  const con = gameConsoleFor(store, game);
  con.setHost(host);
  return {
    console: con,
    frame: () => con.frame(),
    serverEvent: (ev) => (ev.type === 'console' || ev.type === 'cvar' ? con.serverEvent(ev as { type: string } & Record<string, unknown>) : false),
    netOut: (bytes) => con.net.recordOut(bytes),
    detach: () => con.setHost(null),
  };
}
