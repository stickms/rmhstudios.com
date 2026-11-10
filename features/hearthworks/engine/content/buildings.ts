import { z } from 'zod';

export const BUILDING_IDS = ['road', 'plot', 'cottage', 'stall', 'kitchen', 'park', 'harvester'] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

export const buildingSchema = z.object({
  name: z.string().min(1),
  cost: z.number().int().nonnegative(),
});
export type BuildingDef = z.infer<typeof buildingSchema>;

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  road: { name: 'Road', cost: 5 },
  plot: { name: 'Farm plot', cost: 20 },
  cottage: { name: 'Cottage', cost: 120 },
  stall: { name: 'Market stall', cost: 80 },
  kitchen: { name: 'Kitchen', cost: 150 },
  park: { name: 'Pocket park', cost: 60 },
  harvester: { name: 'Auto-harvester', cost: 300 },
};

export const isBuildingId = (v: unknown): v is BuildingId =>
  typeof v === 'string' && (BUILDING_IDS as readonly string[]).includes(v);
