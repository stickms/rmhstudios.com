/**
 * Registration of everything CS:GO adds to the shared engine: its entity classes and net schemas (on
 * import) and the shared engine's own map entities (doors, props, triggers, logic), which CS reuses.
 */

import { registerAllSimModules } from '../tf2-game/sim/register-all';
import './net-schema';
import './entities';
import './weapons';

/** Registers the shared engine's map entities and CS's own. Idempotent. */
export function registerCsGame(): void {
  registerAllSimModules();
}
