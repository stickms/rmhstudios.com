/** Versecraft seed gallery (R13) — shared request schemas and the list row shape. */
import { z } from 'zod';

export const publishSeedSchema = z.object({
  seed: z.string().trim().min(3).max(80),
  title: z.string().trim().min(3).max(80),
});

export const rateSeedSchema = z.object({
  listingId: z.string().min(1).max(40),
  stars: z.number().int().min(1).max(5),
});

export const forkSeedSchema = z.object({ listingId: z.string().min(1).max(40) });

export const listSeedsQuerySchema = z.object({
  sort: z.enum(['top', 'new']).default('top'),
});

export interface SeedListingView {
  id: string;
  seed: string;
  title: string;
  author: string | null;
  average: number;
  ratingCount: number;
  forks: number;
  myStars: number;
  mine: boolean;
}

/** Cap on what one member can keep published, so the gallery can't be flooded. */
export const MAX_LISTINGS_PER_AUTHOR = 10;
