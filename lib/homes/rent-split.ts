/**
 * Fair rent split for shared housing — pure and client-safe.
 * Feature idea F10 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Roommates on an RMHHomes listing all ask the same thing: the big room has
 * its own bathroom, so who pays what? Splitwise splits evenly; Spliddit
 * solves it properly with bids. This is the explainable middle that a group
 * can agree on in one screen:
 *
 *   rent = shared part + private part
 *   shared part  = total × sharedShare, split evenly (kitchen, living room,
 *                  the address — everyone gets the same of these)
 *   private part = the rest, split in proportion to each room's points
 *   points       = area (m² or ft² — units cancel) × Π(feature multipliers)
 *
 * Every number is shown with its derivation in the UI, so nobody has to take
 * a black box's word for their rent. Amounts are whole cents and always sum
 * to the total exactly (largest-remainder rounding), because "it's off by a
 * cent" is exactly the argument this feature exists to prevent.
 */

export interface Room {
  id: string;
  area: number;
  /** Feature names the room has; looked up in `FEATURE_WEIGHTS`. */
  features?: readonly RoomFeature[];
}

export type RoomFeature =
  'private-bath' | 'balcony' | 'walk-in-closet' | 'no-window' | 'shared-wall-noise';

/** Multipliers on a room's points. Below 1 is a drawback. */
export const FEATURE_WEIGHTS: Record<RoomFeature, number> = {
  'private-bath': 1.2,
  balcony: 1.08,
  'walk-in-closet': 1.05,
  'no-window': 0.8,
  'shared-wall-noise': 0.95,
};

export interface Share {
  roomId: string;
  points: number;
  cents: number;
}

export function roomPoints(room: Room): number {
  const area = Math.max(0, room.area);
  return (room.features ?? []).reduce((p, f) => p * (FEATURE_WEIGHTS[f] ?? 1), area);
}

/** Split integer `totalCents` by `weights`, summing exactly (largest remainder). */
export function apportion(totalCents: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  const raw = weights.map((w) => (sum > 0 ? (totalCents * w) / sum : totalCents / weights.length));
  const floors = raw.map(Math.floor);
  let left = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  return floors;
}

export function splitRent(totalCents: number, rooms: readonly Room[], sharedShare = 0.3): Share[] {
  if (rooms.length === 0 || totalCents <= 0) return [];
  const s = Math.min(1, Math.max(0, sharedShare));
  const points = rooms.map(roomPoints);
  const sharedCents = Math.round(totalCents * s);
  const shared = apportion(
    sharedCents,
    rooms.map(() => 1),
  );
  const priv = apportion(totalCents - sharedCents, points);
  return rooms.map((r, i) => ({ roomId: r.id, points: points[i]!, cents: shared[i]! + priv[i]! }));
}
