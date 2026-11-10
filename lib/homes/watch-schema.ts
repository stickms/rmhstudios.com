/**
 * Request schemas for /api/homes/watches, shared by the route and (as
 * `import type`) by `homes.contract.ts`. Client-safe.
 */
import { z } from 'zod';
import { PROPERTY_TYPES } from '@/lib/homes/types';

export const createWatchBody = z.object({
  label: z.string().trim().min(1).max(120),
  listingType: z.enum(['RENT', 'SALE']).nullish(),
  propertyTypes: z
    .array(z.enum(PROPERTY_TYPES as [string, ...string[]]))
    .max(6)
    .default([]),
  locationLabel: z.string().max(200).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  radiusKm: z.number().min(1).max(500).nullish(),
  minPrice: z.number().min(0).max(100_000_000).nullish(),
  maxPrice: z.number().min(0).max(100_000_000).nullish(),
  minBeds: z.number().int().min(0).max(50).nullish(),
  minBaths: z.number().min(0).max(50).nullish(),
  petsRequired: z.boolean().default(false),
});

export const patchWatchBody = z.object({ id: z.string().min(1).max(64), active: z.boolean() });

/** Lenient: a missing `id` is the route's own 'Missing id' 400, not a schema failure. */
export const deleteWatchQuery = z.object({ id: z.string().optional() });
