/**
 * `createTf2Match` — the ONE place the match worker gets a game from.
 *
 * The worker entry (`./match-worker.server.ts`) and the pool's in-process dev
 * fallback (`./pool.server.ts`) both call this and nothing else.
 *
 * It loads the map package for `opts.map` from object storage — the
 * `tf2-game/maps/` tree the `tf2-assets-sync` workflow publishes
 * (assets/map-manifest.ts) — and returns a `Tf2MatchHost` with
 * `opts.botCount` bots (./tf2-match-host.ts). A rejection here closes the
 * room with `map-failed`; it never takes the worker (or anyone else's match)
 * down.
 *
 * `TF2_MATCH_HOST=echo` in the environment swaps in the transport test double
 * (`EchoMatchHost`) — the hub's transport tests run the real worker bundle
 * without map packages.
 *
 * Runs inside a worker thread: anything imported from here is bundled into
 * `dist-server/lib/tf2-game/server/match-worker.server.cjs`. Object storage
 * and the simulation are imported lazily, so the worker starts without them and
 * only loads them when the first real match is created.
 */

import { gameRoot } from '../assets/versions';
import { EchoMatchHost } from './echo-host';
import type { MatchFactory, MatchHost, MatchOptions } from './match-host';
import type { GameObjectLoader } from './tf2-match-host';

/** Reads `tf2-game/<path>` from object storage (S3/R2, or the local-FS fallback). */
export function storageLoader(game: 'tf2' | 'hl2' | 'portal' = 'tf2'): GameObjectLoader {
  return {
    async get(path: string): Promise<Uint8Array | null> {
      const { getObject } = await import('../../storage/s3.server');
      const object = await getObject(gameRoot(game) + path);
      if (!object) return null;
      return new Uint8Array(object.body.buffer, object.body.byteOffset, object.body.byteLength);
    },
  };
}

const env = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];

export const createTf2Match: MatchFactory = async (opts: MatchOptions): Promise<MatchHost> => {
  if (env('TF2_MATCH_HOST') === 'echo') return new EchoMatchHost(opts);
  // Loaded on first use: the worker starts (and the echo double runs) without the simulation.
  const { createTf2MatchHost, loadMapPackage } = await import('./tf2-match-host');
  const loader = storageLoader('tf2');
  return createTf2MatchHost(opts, { loadMap: (map) => loadMapPackage(loader, map) });
};
