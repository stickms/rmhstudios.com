/**
 * Net schemas of the map entities and game modes (ids 192–255, see
 * net-schema.ts). These are what the HUD and the renderer read: control
 * point state (the SDK's CBaseTeamObjectiveResource arrays, carried here by
 * each point), round timers (DT_TeamRoundTimer), flags (DT_CaptureFlag),
 * the payload watcher (DT_TeamTrainWatcher), the objective resource's
 * global fields, prop animation state, ambient sounds, point effects,
 * area portals and observer points.
 */

import { NET_ENTITY, registerNetSchema, type NetFieldDef, type NetFieldKind } from '../net-schema';

const f = (name: string, kind: NetFieldKind): NetFieldDef => ({ name, kind });
const BASE = NET_ENTITY.fields;

/**
 * team_control_point. `capPercent` is the SDK's m_flCapPercentages: the
 * fraction of the capture still to go (1 at the start of a capture, 0 when
 * done); the client draws the capping team's progress as 1 − capPercent.
 */
export const NET_CONTROL_POINT = registerNetSchema(192, 'control_point', [
  ...BASE,
  f('pointIndex', 'i8'),
  /** The owning team (the base `team` field mirrors it; `owner` is the entity-owner field). */
  f('ownerTeam', 'u8'),
  f('defaultOwner', 'u8'),
  f('cappingTeam', 'u8'),
  f('capPercent', 'f32'),
  f('teamInZone', 'u8'),
  f('blocked', 'bool'),
  f('locked', 'bool'),
  f('unlockTime', 'f32'),
  f('numRed', 'u8'),
  f('numBlue', 'u8'),
  f('requiredRed', 'u8'),
  f('requiredBlue', 'u8'),
  f('capTimeRed', 'f32'),
  f('capTimeBlue', 'f32'),
  f('canCapRed', 'bool'),
  f('canCapBlue', 'bool'),
  f('inMiniRound', 'bool'),
  f('visible', 'bool'),
  f('printName', 'str'),
  f('group', 'u8'),
  f('warnOnCap', 'u8'),
  /** Payload: the point's place along the track, 0…1 (SetTrainPathDistance), −1 when not on a track. */
  f('trackDistance', 'f32'),
]);

/** team_round_timer (DT_TeamRoundTimer). Remaining = paused ? timeRemaining : endTime − curtime. */
export const NET_ROUND_TIMER = registerNetSchema(193, 'round_timer', [
  f('paused', 'bool'),
  f('timeRemaining', 'f32'),
  f('endTime', 'f32'),
  f('maxLength', 'i16'),
  f('disabled', 'bool'),
  f('showInHud', 'bool'),
  f('timerLength', 'i16'),
  f('initialLength', 'i16'),
  f('autoCountdown', 'bool'),
  f('setupLength', 'i16'),
  /** RT_STATE_SETUP (0) / RT_STATE_NORMAL (1). */
  f('state', 'u8'),
  f('startPaused', 'bool'),
  f('showTimeRemaining', 'bool'),
  /** TF_TEAM_* for a KOTH team timer, 0 otherwise. */
  f('kothTeam', 'u8'),
  f('active', 'bool'),
]);

/** item_teamflag (DT_CaptureFlag). status: TF_FLAGINFO_HOME 0 / STOLEN 1 / DROPPED 2. */
export const NET_FLAG = registerNetSchema(194, 'flag', [
  ...BASE,
  f('status', 'u8'),
  f('flagType', 'u8'),
  f('disabled', 'bool'),
  f('resetTime', 'f32'),
  f('maxResetTime', 'f32'),
  f('carrier', 'i16'),
  f('hudIcon', 'str'),
  f('paperEffect', 'str'),
  f('trailEffect', 'str'),
  f('useTrailEffect', 'u8'),
]);

/** team_train_watcher (DT_TeamTrainWatcher) plus what the payload HUD reads from the objective resource. */
export const NET_TRAIN_WATCHER = registerNetSchema(195, 'train_watcher', [
  f('team', 'u8'),
  f('disabled', 'bool'),
  f('progress', 'f32'),
  f('speedLevel', 'i8'),
  f('recedeTime', 'f32'),
  f('numCappers', 'i8'),
  f('train', 'i16'),
  f('alarm', 'bool'),
  f('trainDistance', 'f32'),
  f('totalDistance', 'f32'),
]);

/** tf_objective_resource's mode-wide fields. */
export const NET_OBJECTIVE = registerNetSchema(196, 'objective_resource', [
  f('gameType', 'str'),
  f('numPoints', 'u8'),
  f('playingMiniRounds', 'bool'),
  f('timerInHud', 'i16'),
  f('redKothTimer', 'i16'),
  f('blueKothTimer', 'i16'),
  f('redFlagCaps', 'u8'),
  f('blueFlagCaps', 'u8'),
  f('flagCapLimit', 'u8'),
  f('redBasePoint', 'i8'),
  f('blueBasePoint', 'i8'),
  f('capLayout', 'str'),
  f('redGoal', 'str'),
  f('blueGoal', 'str'),
  f('redRole', 'u8'),
  f('blueRole', 'u8'),
  f('arenaCapEnableAt', 'f32'),
  f('requiredObserverTarget', 'i16'),
]);

/** prop_dynamic / prop_physics: the model plus its animation state (the client plays `sequence` from `animStart`). */
export const NET_PROP = registerNetSchema(197, 'prop', [
  ...BASE,
  f('sequence', 'str'),
  f('animStart', 'f32'),
  f('playbackRate', 'f32'),
  f('solid', 'bool'),
  f('modelScale', 'f32'),
]);

/** ambient_generic: what a client joining late needs to start a looping sound. */
export const NET_AMBIENT = registerNetSchema(198, 'ambient', [
  f('ox', 'coord'),
  f('oy', 'coord'),
  f('oz', 'coord'),
  f('sound', 'str'),
  f('playing', 'bool'),
  f('looped', 'bool'),
  f('everywhere', 'bool'),
  f('volume', 'f32'),
  f('pitch', 'f32'),
  f('radius', 'f32'),
  f('source', 'i16'),
  f('startedAt', 'f32'),
]);

/**
 * Point effects: info_particle_system, env_sprite, env_lightglow,
 * point_spotlight, env_spark, env_smokestack… `kind` names the class; `name`
 * the particle system / sprite material; p0…p3 class-specific numbers
 * (sprite scale, spotlight length/width, glow sizes).
 */
export const NET_FX = registerNetSchema(199, 'fx', [
  ...BASE,
  f('kind', 'str'),
  f('name', 'str'),
  f('active', 'bool'),
  f('startedAt', 'f32'),
  f('p0', 'f32'),
  f('p1', 'f32'),
  f('p2', 'f32'),
  f('p3', 'f32'),
]);

/** func_areaportal(window): which portals are open (visibility). */
export const NET_AREAPORTAL = registerNetSchema(200, 'areaportal', [
  f('portalNumber', 'u16'),
  f('open', 'bool'),
]);

/** info_observer_point. */
export const NET_OBSERVER_POINT = registerNetSchema(201, 'observer_point', [
  ...BASE,
  f('disabled', 'bool'),
  f('fov', 'f32'),
  f('defaultWelcome', 'bool'),
  f('matchSummary', 'bool'),
]);

/** env_fog_controller (per-player fog is chosen by the client from these). */
export const NET_FOG = registerNetSchema(202, 'fog_controller', [
  f('name', 'str'),
  f('enabled', 'bool'),
  f('start', 'f32'),
  f('end', 'f32'),
  f('maxDensity', 'f32'),
  f('color', 'u32'),
  f('color2', 'u32'),
  f('farZ', 'f32'),
]);
