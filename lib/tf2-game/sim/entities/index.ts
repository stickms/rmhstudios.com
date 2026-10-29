/**
 * The map-entity module: every classname the hosted maps use (see
 * docs/tf2-game.md "Map entities"), registered with the entity factory.
 * Importing this module registers the classes; `registerMapEntities()`
 * additionally re-applies the registrations that replace core ones
 * (tf_gamerules, logic_auto, func_respawnroomvisualizer, func_nobuild), so
 * call it after the core sim modules are loaded — sim/register-all.ts does.
 */

import { registerBrushOverrides } from './brushes';
import { registerLogicOverrides } from './logic';
import './objectives';
import './round-timer';
import './control-points';
import './movers';
import './train-watcher';
import './flag';
import './effects';

export * from './base';
export * from './net';
export * from './objectives';
export * from './round-timer';
export * from './control-points';
export * from './movers';
export * from './brushes';
export * from './train-watcher';
export * from './flag';
export * from './logic';
export * from './effects';

/** Registers the map-entity classes (idempotent). */
export function registerMapEntities(): void {
  registerBrushOverrides();
  registerLogicOverrides();
}
