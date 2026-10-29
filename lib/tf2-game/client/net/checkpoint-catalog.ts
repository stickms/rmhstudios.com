/**
 * The checkpoint catalog for this bundle (sim/checkpoint/catalog.ts): every
 * simulation module's exports, by path, so a class, a method or a data table
 * has the same name in the browser that writes a checkpoint and the one that
 * restores it (host migration, docs/tf2-game.md "Peer-to-peer play").
 *
 * Vite (the listen-server worker) and Vitest only: `import.meta.glob`.
 */

import { ModuleCatalog } from '../../sim/checkpoint/catalog';
import { registeredEntityClasses } from '../../sim/entity-registry';
import { registerAllSimModules } from '../../sim/register-all';

const modules = import.meta.glob(
  [
    '../../core/**/*.ts',
    '../../data/**/*.ts',
    '../../sim/**/*.ts',
    '../../bots/**/*.ts',
    '../../world/**/*.ts',
    '../../formats/keyvalues.ts',
    '../../console/tf2-server.ts',
    '../../console/server-commands.ts',
    '../../server/tf2-match-host.ts',
    '!../../**/*.test.ts',
    '!../../**/*.test-support.ts',
    '!../../**/__fixtures__/**',
    '!../../**/*.server.ts',
  ],
  { eager: true },
) as Record<string, Record<string, unknown>>;

let catalog: ModuleCatalog | null = null;

/** A catalog of this bundle's simulation modules plus `extra` classes (tests name their own bot brains). */
export function buildCheckpointCatalog(extra: Record<string, unknown> = {}): ModuleCatalog {
  registerAllSimModules();
  const extraClasses: Record<string, unknown> = { ...extra };
  for (const [name, ctor] of registeredEntityClasses()) extraClasses[`entity:${name}`] = ctor;
  // A dev server may hand two browsers different versions of a module someone is editing (strict: a production bundle).
  return new ModuleCatalog(modules, { extraClasses, strict: !import.meta.env.DEV });
}

/** The catalog (built once; registers the sim modules first so every entity class is known). */
export function checkpointCatalog(): ModuleCatalog {
  catalog ??= buildCheckpointCatalog();
  return catalog;
}
