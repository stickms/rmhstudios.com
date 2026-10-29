/**
 * The listen-server worker entry: `new Worker(new URL('./listen-worker.ts',
 * import.meta.url), { type: 'module' })`, then `connectListenServer(worker, …)`
 * (./listen-server.ts). It hosts one offline match against bots, reading the
 * map package from the site's asset API.
 *
 * Everything but the message plumbing lives in `ListenServer`.
 */

import { GAME_ASSET_API } from '../../assets/urls';
import { createTf2MatchHost, loadMapPackage } from '../../server/tf2-match-host';
import {
  httpObjectLoader,
  ListenServer,
  type FromListenServer,
  type ToListenServer,
} from './listen-server';

interface WorkerScope {
  postMessage(message: FromListenServer, transfer: ArrayBuffer[]): void;
  onmessage: ((event: { data: ToListenServer }) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
const loader = httpObjectLoader(GAME_ASSET_API);

const server = new ListenServer(
  (opts) =>
    createTf2MatchHost(opts, {
      loadMap: (map) => loadMapPackage(loader, map),
      // Offline: straight into the game; the team and class menus still work.
      autoTeam: true,
    }),
  (message, transfer) => scope.postMessage(message, transfer),
);

scope.onmessage = (event) => server.handle(event.data);
