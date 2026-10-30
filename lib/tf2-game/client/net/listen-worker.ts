/**
 * The listen-server worker entry: `new Worker(new URL('./listen-worker.ts',
 * import.meta.url), { type: 'module' })`, then `connectListenServer(worker, …)`
 * (./listen-server.ts). It hosts one match — offline against bots, or a
 * peer-to-peer host's match with remote players (./p2p-host.ts) — reading the
 * map package from the site's asset API. A CS:GO match (`MatchOptions.game`)
 * loads lib/csgo-game on demand, which registers its host with the engine,
 * and reads its map and weapon data from CS:GO's asset tree. A peer-to-peer host's worker also
 * writes the migration checkpoints (sim/checkpoint) and keeps the room's
 * clock; a promoted successor's worker starts the match from one.
 *
 * Everything but the message plumbing lives in `ListenServer`.
 */

import { gameAssetApi } from '../../assets/urls';
import {
  createTf2MatchHost,
  levelLoader,
  loadMapPackage,
  Tf2MatchHost,
  type BotBrainFactory,
  type PackagedMap,
} from '../../server/tf2-match-host';
import { registerAllSimModules } from '../../sim/register-all';
import { httpObjectLoader, ListenServer, type FromListenServer, type ToListenServer } from './listen-server';

interface WorkerScope {
  postMessage(message: FromListenServer, transfer: ArrayBuffer[]): void;
  onmessage: ((event: { data: ToListenServer }) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
const loaders = { tf2: httpObjectLoader(gameAssetApi('tf2')), csgo: httpObjectLoader(gameAssetApi('csgo')) };

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

/**
 * The worker's checkpoint catalog (every simulation module, by path), built on the first checkpoint:
 * TF2's, or CS:GO's (which knows its classes too). A worker hosts one game.
 */
let catalogPromise: Promise<import('../../sim/checkpoint/catalog').ModuleCatalog> | null = null;
const catalog = (game: 'tf2' | 'csgo') =>
  (catalogPromise ??=
    game === 'csgo'
      ? import('../../../csgo-game/checkpoint-catalog').then((m) => m.csCheckpointCatalog())
      : import('./checkpoint-catalog').then((m) => m.checkpointCatalog()));
let workerGame: 'tf2' | 'csgo' = 'tf2';

const server = new ListenServer(
  async (opts, host, controls) => {
    const game = opts.game === 'csgo' ? 'csgo' : 'tf2';
    workerGame = game;
    const loader = loaders[game];
    // CS:GO: its module registers the 'csgo' host (and its entities, schemas and bots) with the engine.
    if (game === 'csgo') {
      const cs = await import('../../../csgo-game');
      // Installed before anything builds a CS player (a migrated match's restore included).
      if (!cs.hasCsWeaponData()) cs.setCsWeaponData(await cs.loadCsWeaponData(loader));
    }
    const deps = {
      // CS:GO's host always plays its own bots.
      botBrain: game === 'csgo' ? undefined : await findBotBrain(),
      // CS:GO's weapon data (ui/index.json → its items document).
      loader,
      // Offline: straight into the game (the team and class menus still work);
      // a peer-to-peer host plays TF2's join menus like a hub room.
      autoTeam: host.autoTeam ?? true,
      // Peer-to-peer: every snapshot fits one DataChannel datagram.
      snapshotMaxBytes: host.snapshotMaxBytes,
      // The page's player hosts this match: they administer the developer console (sv_cheats, bots).
      console: { kind: 'listen' as const, ownerId: controls.localPlayerId },
      // host_timescale paces this runner.
      setTimescale: controls.setTimescale,
    };
    const loadMap = (map: string) => loadMapPackage(loader, map);
    if (host.restore) {
      // Host migration: the match from the previous host's checkpoint, on the same map.
      const [{ unpackCheckpoint }, cat] = await Promise.all([import('../../sim/checkpoint/pack'), catalog(game)]);
      const cp = await unpackCheckpoint(new Uint8Array(host.restore));
      registerAllSimModules();
      const map = await loadMap(opts.map);
      return Tf2MatchHost.restore(opts, { ...deps, map, nav: (map as PackagedMap).navMesh ?? null, loadLevel: levelLoader({ loadMap }) }, cp, cat);
    }
    return createTf2MatchHost(opts, { ...deps, loadMap });
  },
  (message, transfer) => scope.postMessage(message, transfer),
  {
    // Peer-to-peer hosting: the match written down for the successor, packed here (off the page).
    checkpointer: async (host) => {
      if (!(host instanceof Tf2MatchHost)) return null;
      const [{ packCheckpoint }, cat] = await Promise.all([import('../../sim/checkpoint/pack'), catalog(workerGame)]);
      const cp = host.checkpoint(cat);
      const packed = await packCheckpoint(cp);
      const data = packed.buffer.byteLength === packed.byteLength ? (packed.buffer as ArrayBuffer) : (packed.slice().buffer as ArrayBuffer);
      return { data, tick: cp.tick };
    },
  },
);

scope.onmessage = (event) => server.handle(event.data);
