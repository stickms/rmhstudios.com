/**
 * Classname → entity class (the SDK's LINK_ENTITY_TO_CLASS / CEntityFactory
 * dictionary). Modules register their classes at import time; the world
 * builds map entities through `createEntity`, and anything unknown becomes an
 * inert PointEntity so I/O aimed at it still resolves.
 */

import { Entity, PointEntity } from './entity';

export type EntityConstructor = new (classname: string) => Entity;

const registry = new Map<string, EntityConstructor>();

/**
 * Registers a class. The constructor receives the classname so one class can
 * serve several names (item_healthkit_small/medium/full).
 */
export function registerEntityClass(classname: string, ctor: EntityConstructor | (new () => Entity)): void {
  registry.set(classname.toLowerCase(), ctor as EntityConstructor);
}

export function isEntityClassRegistered(classname: string): boolean {
  return registry.has(classname.toLowerCase());
}

/** Instantiates by classname; unknown classnames get a PointEntity. */
export function createEntity(classname: string): Entity {
  const lc = classname.toLowerCase();
  const ctor = registry.get(lc);
  return ctor ? new ctor(lc) : new PointEntity(lc);
}

/** Every registered classname (diagnostics: which map entities are unimplemented). */
export function registeredClassnames(): string[] {
  return [...registry.keys()].sort();
}
