/**
 * Level transitions (SDK: CChangeLevel in triggers.cpp — trigger_changelevel,
 * info_landmark, trigger_transition): what a map hands to the next one. The
 * player and the entities inside the landmark's transition volume keep their
 * position relative to the landmark, their angles and velocity; env_global
 * states carry over; entities with a `globalname` take over the state of the
 * same-named entity in the next map.
 *
 * Plain data: the host keeps it while it loads the next map package and
 * passes it to `SpWorld.create`.
 */

import type { Vec3 } from '../../tf2-game/core/vec';

export interface CarriedPlayer {
  /** origin − landmark.origin in the old map. */
  offset: Vec3;
  velocity: Vec3;
  eyeAngles: Vec3;
  ducked: boolean;
  health: number;
  armor: number;
  hasSuit: boolean;
  suitPower: number;
  flashlight: boolean;
  /** Portal: weapon_portalgun held, and which portals it can fire. */
  portalgun: { canFire1: boolean; canFire2: boolean } | null;
}

export interface CarriedEntity {
  classname: string;
  targetname: string;
  globalname: string;
  model: string;
  /** origin − landmark.origin. */
  offset: Vec3;
  angles: Vec3;
  velocity: Vec3;
  angularVelocity: Vec3;
  skin: number;
  /** The original keyvalues (outputs kept), to re-create it. */
  keyvalues: Array<[string, string]>;
}

export interface TransitionData {
  fromMap: string;
  toMap: string;
  landmark: string;
  player: CarriedPlayer;
  entities: CarriedEntity[];
  globals: Record<string, number>;
}
