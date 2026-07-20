/**
 * Game hubs — client-safe types + zod (§6 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 */
import { z } from 'zod';

export const reviewUpsertSchema = z.object({
  stars: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).nullable().optional(),
});

export const reviewVoteSchema = z.object({ helpful: z.boolean() });

export const guideCreateSchema = z.object({
  gameId: z.string().min(1).max(40),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(40_000),
});

export const guideUpdateSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  body: z.string().trim().min(1).max(40_000).optional(),
  note: z.string().trim().max(120).optional(),
});

export interface RatingAgg {
  average: number;
  count: number;
}

export interface ReviewView {
  id: string;
  userId: string;
  stars: number;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  helpfulCount: number;
  author: { name: string | null; handle: string | null; image: string | null };
  myVote?: boolean | null;
  isMine?: boolean;
}

export interface GuideSummary {
  id: string;
  title: string;
  published: boolean;
  updatedAt: string;
  author: { name: string | null; handle: string | null };
}
