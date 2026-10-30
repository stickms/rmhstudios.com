/**
 * The games a match host can play, by `MatchOptions.game`. TF2 is built in (Tf2MatchHost); another
 * game on the engine registers its factory when its module loads (lib/csgo-game/server registers
 * 'csgo'), so the engine never imports a game. Its host extends Tf2MatchHost, so the runner, the
 * listen server, the peer-to-peer host session, checkpoints and the console host it unchanged.
 *
 * Environment-agnostic.
 */

import type { GraphCatalog } from '../sim/checkpoint/catalog';
import type { WorldCheckpoint } from '../sim/checkpoint/world-state';
import type { MatchGame, MatchOptions } from './match-host';
import type { Tf2MatchDeps, Tf2MatchHost, Tf2MatchHostOptions } from './tf2-match-host';

export interface GameMatchFactory {
  /** Builds a match (loads the map through `deps` unless given a world or map). */
  create(opts: MatchOptions, deps: Tf2MatchDeps): Promise<Tf2MatchHost>;
  /** A match from a checkpoint (host migration), on `deps.map`. */
  restore(
    opts: MatchOptions,
    deps: Tf2MatchHostOptions,
    cp: WorldCheckpoint,
    catalog: GraphCatalog & { fingerprint?: string; strict?: boolean },
  ): Tf2MatchHost;
}

const factories = new Map<MatchGame, GameMatchFactory>();

/** Registers a game's match factory (idempotent per game). */
export function registerMatchGame(
  game: Exclude<MatchGame, 'tf2'>,
  factory: GameMatchFactory,
): void {
  factories.set(game, factory);
}

/** The registered factory of a game other than TF2; throws when its module was never loaded. */
export function matchGameFactory(game: MatchGame): GameMatchFactory {
  const f = factories.get(game);
  if (!f)
    throw new Error(
      `no match host is registered for "${game}" (import its module first, e.g. lib/csgo-game)`,
    );
  return f;
}

/** True when the options name a game other than TF2. */
export const isOtherGame = (opts: Pick<MatchOptions, 'game'>): boolean =>
  opts.game !== undefined && opts.game !== 'tf2';
