/**
 * The listen-server worker entry: `new Worker(new URL('./listen-worker.ts',
 * import.meta.url), { type: 'module' })`, then `connectListenServer(worker, …)`
 * (./listen-server.ts). It hosts one offline match against bots, reading the
 * map package from the site's asset API.
 *
 * Everything but the message plumbing lives in `ListenServer`.
 */

import { GAME_ASSET_API } from '../../assets/urls';
import { createTf2MatchHost, loadMapPackage, type BotBrainFactory } from '../../server/tf2-match-host';
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

/**
 * The bots module's brain (TFBotBrain), when it is present: a module under
 * `lib/tf2-game/bots/` whose path names a brain and that exports either a
 * `BotBrainFactory` (`tfBotBrainFactory` / `createTfBotBrain`) or a `TFBotBrain`
 * class constructed as `new TFBotBrain(difficulty, player)`. Without one the
 * host's default brain plays (bots stand at their spawn). Loaded lazily, once.
 */
let brainPromise: Promise<BotBrainFactory | undefined> | null = null;
function findBotBrain(): Promise<BotBrainFactory | undefined> {
  brainPromise ??= (async () => {
    const modules = import.meta.glob(['../../bots/**/*brain*.ts', '../../bots/brain/**/*.ts', '!../../bots/**/*.test.ts']);
    for (const load of Object.values(modules)) {
      try {
        const m = (await load()) as Record<string, unknown>;
        const factory = m.tfBotBrainFactory ?? m.createTfBotBrain;
        if (typeof factory === 'function') return factory as BotBrainFactory;
        const Brain = m.TFBotBrain;
        if (typeof Brain === 'function') {
          const Ctor = Brain as new (...args: Parameters<BotBrainFactory>) => ReturnType<BotBrainFactory>;
          return (difficulty, player) => new Ctor(difficulty, player);
        }
      } catch {
        /* a module that fails to load is not the brain */
      }
    }
    return undefined;
  })();
  return brainPromise;
}

const server = new ListenServer(
  async (opts) =>
    createTf2MatchHost(opts, {
      loadMap: (map) => loadMapPackage(loader, map),
      botBrain: await findBotBrain(),
      // Offline: straight into the game; the team and class menus still work.
      autoTeam: true,
    }),
  (message, transfer) => scope.postMessage(message, transfer),
);

scope.onmessage = (event) => server.handle(event.data);
