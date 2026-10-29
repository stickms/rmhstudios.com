/**
 * The simulation's outgoing events: everything a tick produces that is not
 * entity state — sounds, effects, the kill feed, damage numbers, HUD
 * messages, objective changes. The world appends them to `world.events`
 * during a tick; whoever runs the world (the match host, the listen server)
 * drains them after `step()` with `world.drainEvents()` and encodes them
 * for clients. The SDK equivalents are IGameEvent ("player_death",
 * "teamplay_round_win", …), temp entities (TE_*) and EmitSound.
 *
 * Recipients: by default an event goes to everyone. `to` restricts it to one
 * player (CSingleUserRecipientFilter — e.g. the resupply sound); `notTo`
 * skips one (a sound the owner already predicted, as the SDK's
 * IPredictionSystem::SuppressHostEvents does); `team` limits it to a team.
 */

import type { Vec3 } from '../core/vec';

export interface Recipients {
  /** Only this player id hears/sees it. */
  to?: number;
  /** Everyone except this player id (they predicted it locally). */
  notTo?: number;
  /** Only this team. */
  team?: number;
}

/** Sound channels (soundflags.h CHAN_*). */
export const CHAN_AUTO = 0;
export const CHAN_WEAPON = 1;
export const CHAN_VOICE = 2;
export const CHAN_ITEM = 3;
export const CHAN_BODY = 4;
export const CHAN_STATIC = 6;

export interface SoundEvent extends Recipients {
  type: 'sound';
  /** A game_sounds script entry ("Weapon_RocketLauncher.Single") or a raw path. */
  name: string;
  /** Entity the sound follows; 0 for none. */
  entity?: number;
  /** World position when not attached to an entity. */
  pos?: Vec3;
  volume?: number;
  pitch?: number;
  channel: number;
  /** Stop a looping sound on this entity/channel instead of starting one. */
  stop?: boolean;
}

export type EffectKind =
  | 'particle'
  | 'tracer'
  | 'explosion'
  | 'impact'
  | 'blood'
  | 'decal'
  | 'muzzleflash'
  | 'ragdoll'
  | 'gibs'
  /** Floating "CRITICAL HIT!!!" / "Mini-Crit!" text over a victim. */
  | 'crittext'
  | 'beam'
  /** env_shake: `value` amplitude, `force.x` frequency, `force.y` duration, `force.z` radius (0 = everywhere). */
  | 'shake'
  /** env_spark / env_explosion style one-shots from map entities. */
  | 'spark'
  /** env_fade: `value` duration, `normal` rgb 0…1, `angles.x` hold time. */
  | 'fade';

export interface EffectEvent extends Recipients {
  type: 'effect';
  kind: EffectKind;
  /** Particle system name (DispatchParticleEffect) when kind is 'particle'. */
  system?: string;
  pos: Vec3;
  normal?: Vec3;
  start?: Vec3;
  end?: Vec3;
  angles?: Vec3;
  /** Entity the effect follows / belongs to (PATTACH_*_FOLLOW). */
  entity?: number;
  /** Attachment name on `entity` ("muzzle", "head"). */
  attachment?: string;
  team?: number;
  /** Free-form magnitude: crit type for crittext, damage for gibs, surface for impacts. */
  value?: number;
  /** Surface/material name for impacts and decals. */
  material?: string;
  /** Ragdoll/gib launch force. */
  force?: Vec3;
}

/** "player_death" (SDK: CTFGameRules::DeathNotice). */
export interface DeathEvent {
  type: 'death';
  victim: number;
  /** Killer player id, 0 for world/suicide-by-world. */
  attacker: number;
  /** Assister player id, 0 when none. */
  assister: number;
  /** Inflictor entity (projectile, sentry), 0 when none. */
  inflictor: number;
  /** Kill-icon name (the weapon's `killIcon`, e.g. "tf_projectile_rocket"). */
  weapon: string;
  weaponDefIndex: number;
  /** 0 normal, 1 mini-crit, 2 crit. */
  crit: 0 | 1 | 2;
  /** TF_DMG_CUSTOM_* (backstab, headshot, burning…). */
  customKill: number;
  damageType: number;
  /** TF_DEATH_* bits: dominations, revenge, first blood. */
  deathFlags: number;
  victimClass: number;
  gib: boolean;
  burning: boolean;
}

/** "player_hurt" / damage numbers. */
export interface DamageEvent extends Recipients {
  type: 'damage';
  victim: number;
  attacker: number;
  amount: number;
  /** Health left after the hit. */
  health: number;
  crit: 0 | 1 | 2;
  customKill: number;
  pos: Vec3;
}

export interface HealEvent {
  type: 'healed';
  patient: number;
  healer: number;
  amount: number;
}

export interface HudEvent extends Recipients {
  type: 'hud';
  kind: 'text' | 'announce' | 'center' | 'alert' | 'training';
  /** Localisation key or literal message. */
  key: string;
  params?: readonly string[];
  /** Seconds to show it (game_text holdtime). */
  holdTime?: number;
}

export interface ChatEvent extends Recipients {
  type: 'chat';
  from: number;
  text: string;
}

export interface CaptureEvent {
  type: 'capture';
  kind: 'start' | 'progress' | 'blocked' | 'captured' | 'broken' | 'locked' | 'unlocked';
  point: number;
  pointName: string;
  team: number;
  cappers: readonly number[];
}

export interface FlagEvent {
  type: 'flag';
  kind: 'pickup' | 'captured' | 'defended' | 'dropped' | 'returned';
  player: number;
  /** Team that owns the flag. */
  team: number;
  flag: number;
}

export type RoundEventKind =
  | 'state'
  | 'start'
  | 'active'
  | 'setup_finished'
  | 'win'
  | 'stalemate'
  | 'overtime'
  | 'game_over'
  | 'timer';

export interface RoundEvent {
  type: 'round';
  kind: RoundEventKind;
  /** GR_STATE_* after the change. */
  state: number;
  team?: number;
  /** WINREASON_*. */
  reason?: number;
  fullRound?: boolean;
  /** Seconds, for timer updates. */
  time?: number;
}

export interface VoiceEvent {
  type: 'voice';
  player: number;
  /** "Medic!", "Incoming", or a response-rules concept. */
  line: string;
}

export interface SpawnEvent {
  type: 'spawn';
  player: number;
  team: number;
  cls: number;
}

export interface TeamEvent {
  type: 'team';
  player: number;
  team: number;
  oldTeam: number;
}

export interface ObjectEvent {
  type: 'object';
  kind: 'built' | 'destroyed' | 'sapped' | 'upgraded' | 'removed' | 'detonated';
  object: number;
  objectType: number;
  owner: number;
  attacker?: number;
  assister?: number;
  weapon?: string;
}

/** The player was moved by the server (teleporter, trigger_teleport, respawn): clients drop prediction errors. */
export interface TeleportEvent {
  type: 'teleport';
  player: number;
}

export interface PickupEvent {
  type: 'pickup';
  player: number;
  item: string;
}

/**
 * The answer to a player's loadout command (sim/items/command.ts), to that player only:
 * `applied` (put on now: in the respawn room, or not alive yet), `pending` (at the next respawn
 * or resupply), `refused` (failed the checks; `reason` says which).
 */
export interface LoadoutEvent extends Recipients {
  type: 'loadout';
  player: number;
  /** TF_CLASS_* the loadout is for. */
  cls: number;
  status: 'applied' | 'pending' | 'refused';
  reason?: string;
}

export type SimEvent =
  | LoadoutEvent
  | SoundEvent
  | EffectEvent
  | DeathEvent
  | DamageEvent
  | HealEvent
  | HudEvent
  | ChatEvent
  | CaptureEvent
  | FlagEvent
  | RoundEvent
  | VoiceEvent
  | SpawnEvent
  | TeamEvent
  | ObjectEvent
  | TeleportEvent
  | PickupEvent;

export type SimEventType = SimEvent['type'];

// TF_DEATH_* (tf_shareddefs.h) — bits of DeathEvent.deathFlags.
export const TF_DEATH_DOMINATION = 0x0001;
export const TF_DEATH_ASSISTER_DOMINATION = 0x0002;
export const TF_DEATH_REVENGE = 0x0004;
export const TF_DEATH_ASSISTER_REVENGE = 0x0008;
export const TF_DEATH_FIRST_BLOOD = 0x0010;
export const TF_DEATH_FEIGN_DEATH = 0x0020;
export const TF_DEATH_GIBBED = 0x0080;
