/**
 * The listen-server worker entry for CS:GO (the profile's `createListenWorker`): the shared body
 * (lib/tf2-game/client/net/listen-worker-host.ts) with CS:GO's setup and checkpoint catalog. Importing
 * ../index registers CS:GO's host, entities, schemas and bots with the engine.
 */

import { startListenWorker } from '@/lib/tf2-game/client/net/listen-worker-host';
import { csCheckpointCatalog } from '../checkpoint-catalog';
import { hasCsWeaponData, loadCsWeaponData, setCsWeaponData } from '../index';

startListenWorker({
  csgo: {
    prepare: async (loader) => {
      // Installed before anything builds a CS player (a migrated match's restore included).
      if (!hasCsWeaponData()) setCsWeaponData(await loadCsWeaponData(loader));
    },
    checkpointCatalog: async () => csCheckpointCatalog(),
  },
});
