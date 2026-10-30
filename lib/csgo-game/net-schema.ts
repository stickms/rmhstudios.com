/**
 * CS:GO's network schemas, in the CS range of the shared registry (512–575; sim/net-schema.ts). The
 * shared snapshot encoder, string table and delta coding carry them unchanged: a schema is a flat list
 * of typed fields, `private` ones go to the owning player only (its prediction state).
 *
 * Players extend the base entity fields; their private block is the owner's prediction state — the
 * shared MoveState (`mv_*`, the same as TF2's player) plus CS's own: money, stamina, the tagging slow,
 * the aim punch, flash blindness. Weapons carry what predicting a shot needs: clip, reserve, the attack
 * timers, the recoil index, the accumulated inaccuracy, the zoom.
 */

import {
  moveStateFields,
  NET_BASE_FIELDS,
  netField as f,
  registerNetSchema,
} from '../tf2-game/sim/net-schema';

export const NET_CS_PLAYER = registerNetSchema(512, 'cs_player', [
  ...NET_BASE_FIELDS,
  f('vx', 'f32'),
  f('vy', 'f32'),
  f('vz', 'f32'),
  f('eyePitch', 'angle16'),
  f('eyeYaw', 'angle16'),
  f('cls', 'u8'),
  f('lifeState', 'u8'),
  f('health', 'i16'),
  f('armor', 'u8'),
  f('helmet', 'bool'),
  f('defuser', 'bool'),
  f('hasC4', 'bool'),
  f('flags', 'u32'),
  f('ducked', 'bool'),
  f('onGround', 'bool'),
  f('activeWeapon', 'i32'),
  f('activeSlot', 'i8'),
  f('weaponName', 'str'),
  f('animEvent', 'u8'),
  f('animEventSeq', 'u8'),
  f('observerMode', 'u8'),
  f('observerTarget', 'i16'),
  f('zoomLevel', 'u8'),
  f('planting', 'bool'),
  f('defusing', 'bool'),
  f('spawnProtected', 'bool'),
  // ---- private (owner only): prediction and the HUD ----
  ...moveStateFields(),
  f('money', 'i32', true),
  f('stamina', 'f32', true),
  f('velocityModifier', 'f32', true),
  f('aimPunchX', 'f32', true),
  f('aimPunchY', 'f32', true),
  f('aimPunchVX', 'f32', true),
  f('aimPunchVY', 'f32', true),
  f('flashAt', 'f32', true),
  f('flashDuration', 'f32', true),
  f('flashAlpha', 'f32', true),
  f('inBuyZone', 'bool', true),
  f('lastSlot', 'i8', true),
  f('respawnAt', 'f32', true),
  f('immuneUntil', 'f32', true),
]);

export const NET_CS_WEAPON = registerNetSchema(513, 'cs_weapon', [
  f('defindex', 'i32'),
  f('slot', 'u8'),
  f('owner', 'i16'),
  f('clip', 'i16', true),
  f('reserve', 'i16', true),
  f('nextPrimaryAttack', 'f32', true),
  f('nextSecondaryAttack', 'f32', true),
  f('timeWeaponIdle', 'f32', true),
  f('inReload', 'bool', true),
  f('reloadMode', 'u8', true),
  f('deployedAt', 'f32', true),
  f('lastFireTime', 'f32', true),
  f('recoilIndex', 'f32', true),
  f('accuracyPenalty', 'f32', true),
  f('zoomLevel', 'u8', true),
  f('zoomChangedAt', 'f32', true),
  f('resumeZoom', 'u8', true),
  f('swing', 'u8', true),
  f('fired', 'bool', true),
  // Grenade pouch: a count per kind (CS_GRENADE_KINDS order), the kind out, the throw.
  f('cnt0', 'u8', true),
  f('cnt1', 'u8', true),
  f('cnt2', 'u8', true),
  f('cnt3', 'u8', true),
  f('cnt4', 'u8', true),
  f('cnt5', 'u8', true),
  f('selected', 'u8', true),
  f('throwState', 'u8', true),
  f('throwStrength', 'f32', true),
  f('aux0', 'f32', true),
  f('vmActivity', 'u16', true),
  f('vmActivitySeq', 'u8', true),
]);

/** The round state beside the shared rules record (cs_gamerules: always transmitted). */
export const NET_CS_RULES = registerNetSchema(514, 'cs_rules', [
  f('mode', 'str'),
  f('roundNumber', 'u8'),
  f('freezeEndsAt', 'f32'),
  f('buyEndsAt', 'f32'),
  f('roundEndsAt', 'f32'),
  f('bombPlanted', 'bool'),
  f('bombExplodesAt', 'f32'),
  f('roundWinner', 'u8'),
  f('roundWinReason', 'u8'),
  f('lossStreakT', 'u8'),
  f('lossStreakCT', 'u8'),
  f('halftimeDone', 'bool'),
  f('matchEndsAt', 'f32'),
  f('teammatesAreEnemies', 'bool'),
  f('gameOver', 'bool'),
]);

export const NET_CS_C4 = registerNetSchema(515, 'cs_planted_c4', [
  ...NET_BASE_FIELDS,
  f('plantedAt', 'f32'),
  f('explodesAt', 'f32'),
  f('defuser', 'i16'),
  f('defuseEndsAt', 'f32'),
  f('defused', 'bool'),
  f('exploded', 'bool'),
]);

export const NET_CS_GRENADE = registerNetSchema(516, 'cs_grenade', [
  ...NET_BASE_FIELDS,
  f('vx', 'f32'),
  f('vy', 'f32'),
  f('vz', 'f32'),
  f('kind', 'u8'),
  f('spawnTime', 'f32'),
]);

/** A smoke cloud or a fire. */
export const NET_CS_AREA = registerNetSchema(517, 'cs_area', [
  ...NET_BASE_FIELDS,
  f('kind', 'u8'),
  f('radius', 'f32'),
  f('startedAt', 'f32'),
  f('endsAt', 'f32'),
]);

export const NET_CS_DROPPED = registerNetSchema(518, 'cs_dropped_weapon', [
  ...NET_BASE_FIELDS,
  f('defindex', 'i32'),
  f('weaponName', 'str'),
]);
