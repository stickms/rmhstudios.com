/**
 * Velum2099 contract board (R12) — shared route shape and validation.
 *
 * The city is generated per chunk, so a delivery route is fully described by its
 * pickup and drop-off chunk centres (world metres). A contract is that route plus
 * the standing record for the pickup -> drop-off leg. No coins ride on it.
 */
import { z } from 'zod';

export const CHUNK_SIZE = 60;
/** Vehicle top speed (m/s); a leg cannot be driven faster than this. */
export const MAX_SPEED = 55;
/** Arrival radius slack on each end of the leg, metres. */
const ARRIVE_SLACK = 20;
const WORLD_LIMIT = 60_000;
const MAX_LEG = 900;

const chunkCoord = z
  .number()
  .int()
  .min(-WORLD_LIMIT)
  .max(WORLD_LIMIT)
  .refine((v) => v % CHUNK_SIZE === 0);

export const routeSchema = z.object({
  pickupX: chunkCoord,
  pickupZ: chunkCoord,
  dropX: chunkCoord,
  dropZ: chunkCoord,
});

export const submitContractSchema = routeSchema.extend({
  seconds: z.number().min(5).max(900),
});

export type ContractRoute = z.infer<typeof routeSchema>;

export function legLength(r: ContractRoute): number {
  return Math.hypot(r.dropX - r.pickupX, r.dropZ - r.pickupZ);
}

/** Fastest the leg could physically be driven, in seconds. */
export function minSeconds(r: ContractRoute): number {
  return Math.max(0, legLength(r) - ARRIVE_SLACK) / MAX_SPEED;
}

export function routeIsPlayable(r: ContractRoute): boolean {
  const len = legLength(r);
  return len >= CHUNK_SIZE && len <= MAX_LEG;
}

export interface ContractView extends ContractRoute {
  id: string;
  bestSeconds: number;
  runs: number;
  holder: { name: string | null; username: string | null } | null;
  mine: boolean;
  recordSetAt: string;
}
