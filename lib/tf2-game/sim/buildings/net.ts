/**
 * The buildings' net types (ids 128–191, the range net-schema.ts gives this
 * module). Each extends the core NET_OBJECT fields (DT_BaseObject) with the
 * shared upgrade/placement state and its own SendTable (DT_ObjectSentrygun,
 * DT_ObjectDispenser, DT_ObjectTeleporter, DT_ObjectSapper).
 */

import {
  NET_OBJECT_FIELDS,
  registerNetSchema,
  type NetFieldDef,
  type NetFieldKind,
} from '../net-schema';

const f = (name: string, kind: NetFieldKind): NetFieldDef => ({ name, kind });

/** Fields every TF building adds to NET_OBJECT. */
const SHARED: readonly NetFieldDef[] = [
  ...NET_OBJECT_FIELDS,
  /** m_iHighestUpgradeLevel (a redeployed building climbs back to it). */
  f('highestLevel', 'u8'),
  /** m_iUpgradeMetalRequired. */
  f('upgradeMetalRequired', 'i16'),
  /** Playing the upgrade animation, and how far along (0…1). */
  f('upgrading', 'bool'),
  f('upgradeProgress', 'f32'),
  /** The blueprint is at a valid spot (IsValidPlacement). */
  f('placementOk', 'bool'),
  /** Redeploying after being carried (m_bCarryDeploy). */
  f('carryDeploy', 'bool'),
  /** Blueprint rotation in degrees (m_flCurrentBuildRotation). */
  f('buildRotation', 'f32'),
  /** Kills credited to the building (the sentry HUD). */
  f('kills', 'u16'),
];

/**
 * obj_sentrygun. `aimYaw` / `aimPitch` are the model's aim_yaw / aim_pitch pose
 * parameter values (MoveTurret: −(turret yaw − base yaw), −turret pitch).
 * `fireSeq` / `rocketSeq` count shots (wrap at 256) so the renderer plays one
 * muzzle flash / rocket gesture per change; `muzzle` is the barrel that fired
 * last (0 muzzle / muzzle_l, 1 muzzle_r).
 */
export const NET_SENTRYGUN = registerNetSchema(128, 'sentrygun', [
  ...SHARED,
  f('sentryState', 'u8'),
  f('shells', 'i16'),
  f('maxShells', 'i16'),
  f('rockets', 'i16'),
  f('maxRockets', 'i16'),
  f('aimYaw', 'f32'),
  f('aimPitch', 'f32'),
  f('enemy', 'i16'),
  f('fireSeq', 'u8'),
  f('rocketSeq', 'u8'),
  f('muzzle', 'u8'),
  f('assists', 'u16'),
  /** The Wrangler: m_nShieldLevel (the shield bubble) and m_bPlayerControlled. */
  f('shieldLevel', 'u8'),
  f('playerControlled', 'bool'),
]);

/**
 * obj_dispenser. `healTargets` is a bitmask of the player ids it is healing
 * (bit id − 1), the state the heal beams are drawn from.
 */
export const NET_DISPENSER = registerNetSchema(129, 'dispenser', [
  ...SHARED,
  f('dispenserState', 'u8'),
  f('metal', 'i16'),
  f('healTargets', 'u32'),
]);

/**
 * obj_teleporter. `charge` is the recharge progress 0…1 (1 = ready);
 * `teleState` is TELEPORTER_STATE_*; `matchId` the other end (−1 when unlinked).
 */
export const NET_TELEPORTER = registerNetSchema(130, 'teleporter', [
  ...SHARED,
  f('teleState', 'u8'),
  f('charge', 'f32'),
  f('rechargeTime', 'f32'),
  f('rechargeDuration', 'f32'),
  f('timesUsed', 'u16'),
  f('matchId', 'i16'),
  f('teleportingPlayer', 'i16'),
]);

/** obj_attachment_sapper. `target` is the sapped building (also `parent`). */
export const NET_SAPPER = registerNetSchema(131, 'sapper', [...SHARED, f('target', 'i16')]);
