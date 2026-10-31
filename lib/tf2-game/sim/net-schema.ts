/**
 * Network schemas: what each kind of entity puts on the wire. The SDK
 * declares this per class with SendTables (IMPLEMENT_SERVERCLASS_ST /
 * SendPropFloat …); here each net type is a flat, ordered list of typed
 * fields, and an entity fills a reusable record with `writeNet(out)`. The
 * net module (lib/tf2-game/net/) delta-encodes those records per client and
 * quantizes each field by its kind.
 *
 * Schema ids are explicit and stable — server and client bundles may load
 * modules in different orders, so ids never come from registration order.
 * Ids 1–63 are the core's; other modules register theirs with
 * `registerNetSchema` in the ranges noted below.
 *
 * Fields marked `private` go only to the entity's owning client (the SDK's
 * SendProxy_SendLocalDataTable: ammo, clips, next attack times, MoveState
 * for prediction).
 */

export type NetFieldKind =
  | 'f32'
  | 'i8'
  | 'u8'
  | 'i16'
  | 'u16'
  | 'i32'
  | 'u32'
  /** Angle in degrees, 8-bit quantized (360/256). */
  | 'angle8'
  /** Angle in degrees, 16-bit quantized. */
  | 'angle16'
  /** World coordinate (SDK bitcoord: ±16384, 1/32 unit precision). */
  | 'coord'
  | 'str'
  | 'bool';

export interface NetFieldDef {
  readonly name: string;
  readonly kind: NetFieldKind;
  /** Only sent to the owning player. */
  readonly private?: boolean;
}

export interface NetSchema {
  readonly id: number;
  readonly type: string;
  readonly fields: readonly NetFieldDef[];
}

/** A flat net record; entities write into one the net module owns and reuses. */
export type NetValue = number | string | boolean;
export type NetRecord = Record<string, NetValue>;

const byId = new Map<number, NetSchema>();
const byType = new Map<string, NetSchema>();

/**
 * Registers a net type. Id ranges: 1–63 core (this file), 64–127 weapons,
 * 128–191 buildings, 192–255 map entities / modes, 256–511 anything else,
 * 512–575 Counter-Strike: Global Offensive (lib/csgo-game/net-schema.ts).
 */
/**
 * The schema types that are players (the client's scoreboard, spectating, prediction and the HUD read
 * them as players): TF2's `player`, and another game's player schema once it registers it (CS:GO's
 * `cs_player`).
 */
const PLAYER_TYPES = new Set(['player']);
export function markPlayerSchema(type: string): void {
  PLAYER_TYPES.add(type);
}
export const isPlayerType = (type: string): boolean => PLAYER_TYPES.has(type);

export function registerNetSchema(id: number, type: string, fields: readonly NetFieldDef[]): NetSchema {
  const existing = byId.get(id);
  if (existing) {
    if (existing.type === type) return existing;
    throw new Error(`net schema id ${id} already used by "${existing.type}"`);
  }
  if (byType.has(type)) throw new Error(`net schema type "${type}" already registered`);
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.name)) throw new Error(`net schema "${type}": duplicate field "${f.name}"`);
    seen.add(f.name);
  }
  const schema: NetSchema = { id, type, fields };
  byId.set(id, schema);
  byType.set(type, schema);
  return schema;
}

export const netSchemaById = (id: number): NetSchema | undefined => byId.get(id);
export const netSchemaByType = (type: string): NetSchema | undefined => byType.get(type);
export const allNetSchemas = (): NetSchema[] => [...byId.values()].sort((a, b) => a.id - b.id);

/** A record with every field of `schema` at its zero value. */
export function createNetRecord(schema: NetSchema): NetRecord {
  const r: NetRecord = {};
  for (const f of schema.fields) r[f.name] = f.kind === 'str' ? '' : f.kind === 'bool' ? false : 0;
  return r;
}

/** A field definition (`priv`: sent to the owning player only). */
export const netField = (name: string, kind: NetFieldKind, priv = false): NetFieldDef =>
  priv ? { name, kind, private: true } : { name, kind };

const f = (name: string, kind: NetFieldKind, priv = false): NetFieldDef =>
  priv ? { name, kind, private: true } : { name, kind };

/** Every MoveState field (except attrs) flattened into the player record's private `mv_*` fields. */
export const MOVE_STATE_NET_FIELDS: ReadonlyArray<readonly [string, 'f32' | 'i32' | 'bool' | 'str' | 'vec']> = [
  ['moveType', 'i32'],
  ['observerMode', 'i32'],
  ['dead', 'bool'],
  ['baseVelocity', 'vec'],
  ['viewOffsetZ', 'f32'],
  ['punchAngle', 'vec'],
  ['punchAngleVel', 'vec'],
  ['flags', 'i32'],
  ['groundEntity', 'i32'],
  ['fallVelocity', 'f32'],
  ['gravity', 'f32'],
  ['surfaceFriction', 'f32'],
  ['surfaceName', 'str'],
  ['maxSpeed', 'f32'],
  ['oldButtons', 'i32'],
  ['oldForwardMove', 'f32'],
  ['ducked', 'bool'],
  ['ducking', 'bool'],
  ['duckTime', 'f32'],
  ['duckTimer', 'f32'],
  ['airDucked', 'i32'],
  ['airDash', 'i32'],
  ['jumping', 'bool'],
  ['scoutHype', 'f32'],
  ['waterLevel', 'i32'],
  ['waterType', 'i32'],
  ['waterJumpTime', 'f32'],
  ['waterJumpVel', 'vec'],
  ['swimSoundTime', 'f32'],
  ['stepSoundTime', 'f32'],
  ['stepSkip', 'i32'],
  ['stuckLast', 'i32'],
  ['passingThroughEnemies', 'bool'],
  ['conds', 'i32'],
  ['stunAmount', 'f32'],
  ['stunForwardOnly', 'bool'],
  ['stunLerpTarget', 'f32'],
  ['lastMovementStunChange', 'f32'],
  ['stunNeedsFadeOut', 'bool'],
];


/** The private `mv_*` fields for MOVE_STATE_NET_FIELDS (another game's player record carries them too). */
export function moveStateFields(): NetFieldDef[] {
  const out: NetFieldDef[] = [];
  for (const [name, kind] of MOVE_STATE_NET_FIELDS) {
    if (kind === 'vec') {
      out.push(f(`mv_${name}_x`, 'f32', true), f(`mv_${name}_y`, 'f32', true), f(`mv_${name}_z`, 'f32', true));
    } else out.push(f(`mv_${name}`, kind, true));
  }
  return out;
}

// ─── Core schemas ──────────────────────────────────────────────────────────

/** Fields every networked entity carries (CBaseEntity's DT_BaseEntity subset). */
const BASE_FIELDS: readonly NetFieldDef[] = [
  f('ox', 'coord'),
  f('oy', 'coord'),
  f('oz', 'coord'),
  f('pitch', 'angle16'),
  f('yaw', 'angle16'),
  f('roll', 'angle16'),
  f('model', 'str'),
  f('bspModel', 'i16'),
  f('skin', 'u8'),
  f('body', 'u16'),
  f('effects', 'u16'),
  f('team', 'u8'),
  f('renderMode', 'u8'),
  f('renderAlpha', 'u8'),
  f('renderColor', 'u32'),
  f('parent', 'i16'),
  f('owner', 'i16'),
];

/** The base entity fields, for another game's schemas (its players and entities extend them). */
export const NET_BASE_FIELDS: readonly NetFieldDef[] = BASE_FIELDS;

/** A generic visible entity (props, pickups, trigger-less point entities with models). */
export const NET_ENTITY = registerNetSchema(1, 'entity', BASE_FIELDS);

/** Brush entities whose transform or visibility changes (doors, trains, visualizers). */
export const NET_BRUSH = registerNetSchema(2, 'brush', [...BASE_FIELDS, f('solid', 'bool')]);

/** Projectiles: interpolated from velocity between snapshots. */
export const NET_PROJECTILE = registerNetSchema(3, 'projectile', [
  ...BASE_FIELDS,
  f('vx', 'f32'),
  f('vy', 'f32'),
  f('vz', 'f32'),
  f('critical', 'u8'),
  f('kind', 'u8'),
  f('spawnTime', 'f32'),
]);

/** Item pickups (health kits, ammo packs, dropped tf_ammo_pack). */
export const NET_PICKUP = registerNetSchema(4, 'pickup', [...BASE_FIELDS, f('hidden', 'bool')]);

/**
 * Players. Public fields drive other clients' rendering and animation; the
 * private block is the owning client's prediction state (MoveState, ammo,
 * meters) — DT_TFLocalPlayerExclusive in the SDK.
 */
export const NET_PLAYER = registerNetSchema(5, 'player', [
  ...BASE_FIELDS,
  f('vx', 'f32'),
  f('vy', 'f32'),
  f('vz', 'f32'),
  f('eyePitch', 'angle16'),
  f('eyeYaw', 'angle16'),
  f('cls', 'u8'),
  f('lifeState', 'u8'),
  f('health', 'i16'),
  f('maxHealth', 'i16'),
  f('flags', 'u32'),
  f('ducked', 'bool'),
  f('onGround', 'bool'),
  /** TF_COND_* bits, five 32-bit words (ETFCond < 160). */
  f('cond0', 'u32'),
  f('cond1', 'u32'),
  f('cond2', 'u32'),
  f('cond3', 'u32'),
  f('cond4', 'u32'),
  f('activeWeapon', 'i32'),
  f('activeSlot', 'i8'),
  /** Locomotion/gesture activity ids for the animation state (PlayerAnimEvent_t). */
  f('animEvent', 'u8'),
  f('animEventSeq', 'u8'),
  f('disguiseTeam', 'u8'),
  f('disguiseClass', 'u8'),
  f('disguiseTarget', 'u8'),
  f('cloak', 'f32'),
  f('carriedFlag', 'i16'),
  f('observerMode', 'u8'),
  f('observerTarget', 'i16'),
  /** What the player has equipped, public (sim/items/loadout.ts encodeItems): every client renders it. */
  f('items', 'str'),
  /** The active weapon's looping sound (Weapon.loopSound: the minigun's spin, the flamethrower's fire), '' for none. */
  f('weaponLoop', 'str'),
  // ---- private (owner only) ----
  ...moveStateFields(),
  f('ammo1', 'i16', true),
  f('ammo2', 'i16', true),
  f('ammo3', 'i16', true),
  f('ammo4', 'i16', true),
  f('ammo5', 'i16', true),
  f('ammo6', 'i16', true),
  f('lastSlot', 'i8', true),
  f('respawnAt', 'f32', true),
  f('nextRegenAt', 'f32', true),
  f('meter0', 'f32', true),
  f('meter1', 'f32', true),
  f('meter2', 'f32', true),
  f('meter3', 'f32', true),
  f('blastJump', 'u8', true),
  /** Unlock item state (sim/items/effects.ts packUnlockNet: heads, revenge crits, the charge's melee crit …). */
  f('unlockState', 'u32', true),
  /** A loadout chosen for the current class waits for the next respawn or resupply. */
  f('loadoutPending', 'bool', true),
  /** In one of the team's own respawn rooms (a new loadout applies at once there). */
  f('inSpawnRoom', 'bool', true),
]);

/**
 * A player's weapon (one per filled slot), private to its owner except for
 * the defindex the player record already shows. `aux0..3` belong to the
 * weapon implementation (minigun spin, rifle charge, sticky charge, medigun
 * charge…) so prediction round-trips them without a schema per weapon.
 */
export const NET_WEAPON = registerNetSchema(6, 'weapon', [
  f('defindex', 'i32'),
  f('slot', 'u8'),
  f('owner', 'i16'),
  f('clip', 'i16', true),
  f('nextPrimaryAttack', 'f32', true),
  f('nextSecondaryAttack', 'f32', true),
  f('timeWeaponIdle', 'f32', true),
  f('reloadState', 'u8', true),
  f('inReload', 'bool', true),
  f('deployedAt', 'f32', true),
  f('critShots', 'u8', true),
  f('lastFireTime', 'f32', true),
  f('aux0', 'f32', true),
  f('aux1', 'f32', true),
  f('aux2', 'f32', true),
  f('aux3', 'f32', true),
  // Added by the weapons module (sim/weapons): the view-model activity the
  // renderer plays (index into VM_ACTIVITY_NAMES + a change counter), the
  // owner's m_flNextAttack, the random-crit state CalcIsAttackCritical rolls
  // against (token bucket, check counts, rapid-fire window, the owner's crit
  // multiplier byte) and four more weapon-specific slots.
  f('vmActivity', 'u16', true),
  f('vmActivitySeq', 'u8', true),
  f('nextAttack', 'f32', true),
  f('reloadPriorNextFire', 'f32', true),
  f('critBucket', 'f32', true),
  f('critChecks', 'u16', true),
  f('critRequests', 'u16', true),
  f('critTime', 'f32', true),
  f('lastCritCheck', 'f32', true),
  f('critMult', 'u8', true),
  f('aux4', 'f32', true),
  f('aux5', 'f32', true),
  f('aux6', 'f32', true),
  f('aux7', 'f32', true),
  /** m_flEffectBarRegenTime (jars, drinks, lunchboxes, the cleaver: sim/weapons/tf-weapon.ts). */
  f('effectBarRegenTime', 'f32', true),
]);

/** Buildings (CBaseObject's DT_BaseObject). Subtypes extend with their own ids 128+. */
export const NET_OBJECT_FIELDS: readonly NetFieldDef[] = [
  ...BASE_FIELDS,
  f('objectType', 'u8'),
  f('objectMode', 'u8'),
  f('level', 'u8'),
  f('health', 'i16'),
  f('maxHealth', 'i16'),
  f('buildProgress', 'f32'),
  f('building', 'bool'),
  f('placing', 'bool'),
  f('carried', 'bool'),
  f('sapped', 'bool'),
  f('disabled', 'bool'),
  f('upgradeMetal', 'i16'),
];
export const NET_OBJECT = registerNetSchema(7, 'object', NET_OBJECT_FIELDS);

/** Game rules / round state (CTFGameRulesProxy). One instance, entity id 0 slot in snapshots. */
export const NET_RULES = registerNetSchema(8, 'rules', [
  f('state', 'u8'),
  f('stateEnteredAt', 'f32'),
  f('stateEndsAt', 'f32'),
  f('winningTeam', 'u8'),
  f('winReason', 'u8'),
  f('redScore', 'i16'),
  f('blueScore', 'i16'),
  f('redRoundsWon', 'i16'),
  f('blueRoundsWon', 'i16'),
  f('nextRespawnRed', 'f32'),
  f('nextRespawnBlue', 'f32'),
  f('roundStartedAt', 'f32'),
  f('inSetup', 'bool'),
  f('inOvertime', 'bool'),
  f('mode', 'str'),
]);
