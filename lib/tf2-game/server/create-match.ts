/**
 * `createTf2Match` — the ONE place the match worker gets a game from.
 *
 * The worker entry (`./match-worker.server.ts`) and the pool's in-process dev
 * fallback (`./pool.server.ts`) both call this and nothing else, so plugging
 * the simulation in is a change to this file only.
 *
 * TODO(tf2-sim): replace the echo host with the real match:
 *   1. fetch the map package for `opts.map` from object storage (the same
 *      bucket/prefix the `tf2-assets-sync` workflow writes) and parse it
 *      (`lib/tf2-game/formats/`, `lib/tf2-game/world/`);
 *   2. build the game world, rules for `opts.mode`, and `opts.botCount` bots at
 *      `opts.botDifficulty` (`lib/tf2-game/sim/`, `lib/tf2-game/bots/`),
 *      seeded from `opts.seed`;
 *   3. return a `MatchHost` that decodes input packets into `UserCmd`s and
 *      encodes snapshots/reliable events (`lib/tf2-game/net/`).
 * A rejection here closes the room with `map-failed`; it never takes the
 * worker (or anyone else's match) down.
 *
 * Runs inside a worker thread: anything imported from here is bundled into
 * `dist-server/lib/tf2-game/server/match-worker.server.cjs`.
 */

import { EchoMatchHost } from './echo-host';
import type { MatchFactory, MatchHost, MatchOptions } from './match-host';

export const createTf2Match: MatchFactory = async (opts: MatchOptions): Promise<MatchHost> => {
  return new EchoMatchHost(opts);
};
