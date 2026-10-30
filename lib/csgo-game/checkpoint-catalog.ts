/**
 * The checkpoint catalog for a CS:GO match (sim/checkpoint/catalog.ts): every shared simulation
 * module's exports and CS:GO's own, by path, so a class, a method or a data table has the same name in
 * the browser that writes a checkpoint (the peer-to-peer host) and the one that restores it (the
 * successor). The TF2 catalog (client/net/checkpoint-catalog.ts) does not know CS:GO's classes; a CS
 * match's listen worker uses this one.
 *
 * Vite (the listen-server worker) and Vitest only: `import.meta.glob`.
 */

import { ModuleCatalog } from '../tf2-game/sim/checkpoint/catalog';
import { registeredEntityClasses } from '../tf2-game/sim/entity-registry';
import { registerCsGame } from './register';

const modules = import.meta.glob(
  [
    '../tf2-game/core/**/*.ts',
    '../tf2-game/data/**/*.ts',
    '../tf2-game/sim/**/*.ts',
    '../tf2-game/bots/**/*.ts',
    '../tf2-game/world/**/*.ts',
    '../tf2-game/formats/keyvalues.ts',
    '../tf2-game/console/tf2-server.ts',
    '../tf2-game/console/server-commands.ts',
    '../tf2-game/server/tf2-match-host.ts',
    './**/*.ts',
    '!../**/*.test.ts',
    '!../**/*.test-support.ts',
    '!../**/__fixtures__/**',
    '!../**/*.server.ts',
    '!./checkpoint-catalog.ts',
  ],
  { eager: true },
) as Record<string, Record<string, unknown>>;

let catalog: ModuleCatalog | null = null;

/** A catalog of the shared and CS modules plus `extra` classes (tests name their own bot brains). */
export function buildCsCheckpointCatalog(extra: Record<string, unknown> = {}): ModuleCatalog {
  registerCsGame();
  const extraClasses: Record<string, unknown> = { ...extra };
  for (const [name, ctor] of registeredEntityClasses()) extraClasses[`entity:${name}`] = ctor;
  return new ModuleCatalog(modules, { extraClasses, strict: !import.meta.env.DEV });
}

/** The catalog (built once). */
export function csCheckpointCatalog(): ModuleCatalog {
  catalog ??= buildCsCheckpointCatalog();
  return catalog;
}
