/**
 * RMH Rideshare — ride class catalogue.
 *
 * Shared between client and server (no server-only imports). The enum values
 * mirror the Prisma `RideClass` enum.
 */

export type RideClassId =
  | 'RMH_X'
  | 'RMH_XL'
  | 'RMH_COMFORT'
  | 'RMH_GREEN'
  | 'RMH_BLACK'
  | 'RMH_BIKE'
  | 'RMH_HELI';

export interface RideClassInfo {
  id: RideClassId;
  /** Display name, e.g. "RMH-X". */
  name: string;
  tagline: string;
  description: string;
  /** Max passengers. */
  seats: number;
  /** Lucide icon name used for the catalogue (resolved on the client). */
  icon: 'Car' | 'Users' | 'Sparkles' | 'Leaf' | 'Crown' | 'Bike' | 'Helicopter';
  /** Per-km fare multiplier used to show an indicative (currently waived) fare. */
  fareMultiplier: number;
  /** Estimated time-of-arrival range in minutes, for landing-page flavour. */
  etaMinutes: [number, number];
}

export const RIDE_CLASSES: RideClassInfo[] = [
  {
    id: 'RMH_X',
    name: 'RMH-X',
    tagline: 'Everyday rides',
    description: 'Affordable, reliable rides for up to 4 people.',
    seats: 4,
    icon: 'Car',
    fareMultiplier: 1,
    etaMinutes: [3, 7],
  },
  {
    id: 'RMH_BIKE',
    name: 'RMH-Bike',
    tagline: 'Beat the traffic',
    description: 'A nippy bike or e-scooter for quick solo trips.',
    seats: 1,
    icon: 'Bike',
    fareMultiplier: 0.55,
    etaMinutes: [2, 6],
  },
  {
    id: 'RMH_XL',
    name: 'RMH-XL',
    tagline: 'Room for the crew',
    description: 'Spacious SUVs and vans seating up to 6 passengers.',
    seats: 6,
    icon: 'Users',
    fareMultiplier: 1.6,
    etaMinutes: [4, 9],
  },
  {
    id: 'RMH_COMFORT',
    name: 'RMH-Comfort',
    tagline: 'Extra legroom',
    description: 'Newer cars, top-rated drivers, and a little more space.',
    seats: 4,
    icon: 'Sparkles',
    fareMultiplier: 1.3,
    etaMinutes: [4, 8],
  },
  {
    id: 'RMH_GREEN',
    name: 'RMH-Green',
    tagline: 'Ride electric',
    description: 'Hybrid and fully-electric vehicles for a lighter footprint.',
    seats: 4,
    icon: 'Leaf',
    fareMultiplier: 1.15,
    etaMinutes: [5, 10],
  },
  {
    id: 'RMH_BLACK',
    name: 'RMH-Black',
    tagline: 'Premium luxury',
    description: 'High-end vehicles with professional, vetted drivers.',
    seats: 4,
    icon: 'Crown',
    fareMultiplier: 2.4,
    etaMinutes: [6, 12],
  },
  {
    id: 'RMH_HELI',
    name: 'RMH-Heli',
    tagline: 'Skip the ground',
    description: 'A premium helicopter transfer for the ultimate trip.',
    seats: 4,
    icon: 'Helicopter',
    fareMultiplier: 12,
    etaMinutes: [8, 20],
  },
];

const RIDE_CLASS_MAP = new Map<RideClassId, RideClassInfo>(
  RIDE_CLASSES.map((c) => [c.id, c]),
);

export function getRideClass(id: string): RideClassInfo | undefined {
  return RIDE_CLASS_MAP.get(id as RideClassId);
}

export function isRideClassId(value: unknown): value is RideClassId {
  return typeof value === 'string' && RIDE_CLASS_MAP.has(value as RideClassId);
}

/** Human label for a ride class id, falling back to the raw id. */
export function rideClassName(id: string): string {
  return getRideClass(id)?.name ?? id;
}
