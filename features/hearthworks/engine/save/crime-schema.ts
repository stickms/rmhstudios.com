import { z } from 'zod';
import { OFFICER_KINDS, WEAPON_IDS } from '../content';
import type { Arms } from '../world/crime-types';

/** The crime route's part of a save: players' guns and heat, and the police on the island. */
const int = z.number().int();
const num = z.number().finite();

export const armsSchema = z.object({
  equipped: z.enum(WEAPON_IDS).nullable(),
  guns: z.partialRecord(
    z.enum(WEAPON_IDS),
    z.object({ mag: int.nonnegative(), reserve: int.nonnegative() }),
  ),
  readyAt: int,
  reloadDoneAt: int,
  lastShotTick: int,
  lastHitTick: int,
  downedUntil: int,
});

export const DEFAULT_ARMS: Arms = {
  equipped: null,
  guns: {},
  readyAt: 0,
  reloadDoneAt: 0,
  lastShotTick: -1,
  lastHitTick: -1,
  downedUntil: 0,
};

/** Fields every player carries; saves from before the crime route have none of them. */
export const playerCrimeFields = {
  hp: int.min(0).max(1000).default(100),
  heat: int.min(0).max(100).default(0),
  arms: armsSchema.default(() => ({ ...DEFAULT_ARMS, guns: {} })),
};

const moverSchema = z.object({
  x: num,
  z: num,
  fromX: int,
  fromZ: int,
  path: z.array(z.object({ x: int, z: int, kind: z.enum(['walk', 'jump', 'fall']) })).max(1024),
  leg: int.nonnegative(),
  goalX: int.nullable(),
  goalZ: int.nullable(),
  stopWithin: int.nonnegative(),
  yaw: num,
});

export const officerSchema = z.object({
  id: int,
  kind: z.enum(OFFICER_KINDS),
  hp: int,
  weapon: z.enum(WEAPON_IDS),
  mover: moverSchema,
  target: z.string().min(1).max(64).nullable(),
  mode: z.enum(['hunt', 'leave']),
  gateX: int,
  gateZ: int,
  mag: int.nonnegative(),
  readyAt: int,
  reloadDoneAt: int,
  nextPlanTick: int,
  planFails: int.nonnegative(),
  arrestAt: int,
  leaveSince: int,
  firedTick: int,
  aim: num,
});
