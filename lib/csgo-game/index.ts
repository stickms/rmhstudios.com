/**
 * Counter-Strike: Global Offensive (de_dust2: bomb defusal and deathmatch) on the shared browser
 * Source engine — see docs/tf2-game.md "CS:GO (Dust II)". Importing this module registers the CS
 * entity classes, net schemas and the 'csgo' match host (server/cs-match-host.ts) with the engine.
 *
 * Environment-agnostic (a browser worker, the hub worker, Vitest).
 */

import './register';
import './server/cs-match-host';

export * from './constants';
export * from './data/weapon-data';
export * from './movement';
export * from './combat';
export * from './economy';
export * from './events';
export * from './net-schema';
export { CsWorld, type CsWorldInit } from './world';
export { CsPlayer, readCsPlayerNet, restoreCsPlayerFromRecords } from './player';
export {
  CsGameRules,
  CsDefuseMode,
  CsDeathmatchMode,
  defaultCsSettings,
  type CsSettings,
} from './rules';
export { registerCsGame } from './register';
export {
  CsMatchHost,
  createCsMatchHost,
  loadCsWeaponData,
  CSGO_MATCH_FACTORY,
  csScore,
  csModeOf,
} from './server/cs-match-host';
export { CsBotBrain, csBotBrainFactory } from './bots/cs-bot-brain';
export { CsServerConsole } from './console';
