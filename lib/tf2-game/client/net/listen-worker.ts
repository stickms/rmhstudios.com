/**
 * The listen-server worker entry for TF2: `new Worker(new URL('./listen-worker.ts', import.meta.url),
 * { type: 'module' })`, then `connectListenServer(worker, …)` (./listen-server.ts). Another game
 * has an entry of its own (CS:GO: lib/csgo-game/client/listen-worker.ts) over the same body.
 */

import { startListenWorker } from './listen-worker-host';

startListenWorker();
