/** The data of the crime route: heat, guns, police. Plain and serialisable like the rest of the world. */

import type { ItemId, OfficerKind, WeaponId } from '../content';
import type { Mover } from '../nav/mover';

export interface GunState {
  /** Rounds in the magazine. */
  mag: number;
  /** Spare rounds. */
  reserve: number;
}

/** A player's armoury and combat clocks (all ticks are absolute world ticks). */
export interface Arms {
  equipped: WeaponId | null;
  guns: Partial<Record<WeaponId, GunState>>;
  /** The first tick another shot may be fired. */
  readyAt: number;
  /** The tick a reload in progress finishes, or 0 when not reloading. */
  reloadDoneAt: number;
  /** The tick of the last shot fired, or -1 for never. Firing back is what keeps the police from arresting you. */
  lastShotTick: number;
  /** The tick of the last wound taken (health regrows a while after it), or -1. */
  lastHitTick: number;
  /** While in the future the player is downed: out of action until they are carried back to the meadow. 0 = up. */
  downedUntil: number;
}

export interface Officer {
  id: number;
  kind: OfficerKind;
  hp: number;
  weapon: WeaponId;
  /** Where they are and the route they are walking (nav/mover.ts). */
  mover: Mover;
  /** The player being hunted. */
  target: string | null;
  mode: 'hunt' | 'leave';
  /** The gate they came in by, and walk back to. */
  gateX: number;
  gateZ: number;
  mag: number;
  readyAt: number;
  reloadDoneAt: number;
  /** The earliest tick they may search for a new route (route searches are budgeted, not every tick). */
  nextPlanTick: number;
  planFails: number;
  /** The tick the cuffs go on, or 0. */
  arrestAt: number;
  /** The tick they started leaving (they vanish after a while even if the gate is unreachable). */
  leaveSince: number;
  /** The tick of the last shot (the renderer's muzzle flash), or -1. */
  firedTick: number;
  /** Direction faced. Cosmetic: nothing in the simulation reads it. */
  aim: number;
}

export type CrimeCommand =
  | { type: 'hustle'; playerId: string; item: ItemId; qty: number }
  | { type: 'buyWeapon'; playerId: string; weapon: WeaponId }
  | { type: 'equip'; playerId: string; weapon: WeaponId | null }
  | { type: 'shoot'; playerId: string; x: number; z: number }
  | { type: 'reload'; playerId: string };

export type ShotSource = { kind: 'player'; id: string } | { kind: 'officer'; id: number };

export type CrimeEvent =
  | { type: 'hustled'; playerId: string; item: ItemId; qty: number; earned: number; heat: number }
  | { type: 'weaponBought'; playerId: string; weapon: WeaponId; price: number; restock: boolean }
  | { type: 'equipped'; playerId: string; weapon: WeaponId | null }
  | { type: 'reloading'; playerId: string; weapon: WeaponId }
  | { type: 'reloaded'; playerId: string; weapon: WeaponId }
  /** A shot fired: from (fx, fz) to where it ended (tx, tz); `hit` says whether it struck anyone. */
  | { type: 'shot'; by: ShotSource; fx: number; fz: number; tx: number; tz: number; hit: boolean }
  | { type: 'officerSpawned'; officer: Officer }
  | { type: 'officerHit'; officerId: number; by: string; damage: number; hp: number }
  | { type: 'officerDown'; officerId: number; by: string; drop: number }
  | { type: 'officerLeft'; officerId: number }
  | { type: 'playerHit'; playerId: string; officerId: number; damage: number; hp: number }
  | { type: 'downed'; playerId: string }
  | {
      type: 'respawned';
      playerId: string;
      x: number;
      z: number;
      fine: number;
      confiscated: Partial<Record<ItemId, number>>;
    }
  | {
      type: 'arrested';
      playerId: string;
      officerId: number;
      fine: number;
      confiscated: Partial<Record<ItemId, number>>;
    };

export type CrimeReject =
  'contraband' | 'unknown-weapon' | 'no-weapon' | 'no-ammo' | 'bad-aim' | 'downed';
