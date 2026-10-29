/**
 * Game commands beyond team/class/chat/voice — the SDK's ClientCommand
 * console verbs (`build 2 0`, `destroy 1`, `taunt`, `dropitem`, …) — routed
 * generically: a module registers a handler by name, the match host
 * dispatches `MatchCommand { kind: 'extra' }` to it on the simulation thread,
 * between ticks. Arguments are console-style scalars, validated by
 * `zExtraCommand` (lobby-schema.ts) before they reach the worker.
 *
 * Environment-agnostic.
 */

import type { GameWorld } from '../sim/world';
import type { Player } from '../sim/player';

/** Console-style arguments: at most 8 scalars. */
export type ExtraCommandArgs = ReadonlyArray<number | string | boolean>;

export interface ExtraCommandContext {
  world: GameWorld;
  player: Player;
}

export type ExtraCommandHandler = (ctx: ExtraCommandContext, args: ExtraCommandArgs) => void;

/** `build`, `destroy`, `taunt`… — lower-case, at most 32 characters. */
export const EXTRA_COMMAND_NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;
export const EXTRA_COMMAND_MAX_ARGS = 8;

const handlers = new Map<string, ExtraCommandHandler>();

/** Registers (or replaces) the handler for a command name. */
export function registerExtraCommand(name: string, handler: ExtraCommandHandler): void {
  if (!EXTRA_COMMAND_NAME_RE.test(name)) throw new Error(`bad extra command name "${name}"`);
  handlers.set(name, handler);
}

export function hasExtraCommand(name: string): boolean {
  return handlers.has(name);
}

/** Runs a command; false when nothing handles it. Handler errors propagate (the runner closes the match). */
export function dispatchExtraCommand(
  name: string,
  ctx: ExtraCommandContext,
  args: ExtraCommandArgs,
): boolean {
  const h = handlers.get(name);
  if (!h) return false;
  h(ctx, args.slice(0, EXTRA_COMMAND_MAX_ARGS));
  return true;
}
