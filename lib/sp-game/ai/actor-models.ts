/**
 * The single-player actors' classes (ai/actor.ts registers them) and the model each draws when its map
 * leaves `model` blank — read by the actors and by the map pipeline, which lists every actor's model for
 * the model channel (scripts/tf2-game/build-maps.ts `collectActorModels`).
 */

export const ACTOR_CLASSES: readonly string[] = [
  'npc_citizen',
  'npc_barney',
  'npc_breen',
  'npc_kleiner',
  'npc_vortigaunt',
  'npc_cscanner',
  'npc_strider',
  'npc_pigeon',
  'npc_metropolice',
  'npc_security_camera',
  'npc_combine_camera',
  'generic_actor',
  'cycler_actor',
  'monster_generic',
];

/** Default models for classes the map leaves blank. */
export const DEFAULT_ACTOR_MODELS: Readonly<Record<string, string>> = {
  npc_metropolice: 'models/police.mdl',
  npc_barney: 'models/barney.mdl',
  npc_breen: 'models/breen.mdl',
  npc_kleiner: 'models/kleiner.mdl',
  npc_vortigaunt: 'models/vortigaunt.mdl',
  npc_cscanner: 'models/combine_scanner.mdl',
  npc_strider: 'models/combine_strider.mdl',
  npc_pigeon: 'models/pigeon.mdl',
  npc_combine_camera: 'models/combine_camera/combine_camera.mdl',
  npc_security_camera: 'models/props/security_camera.mdl',
  npc_citizen: 'models/humans/group01/male_01.mdl',
};
