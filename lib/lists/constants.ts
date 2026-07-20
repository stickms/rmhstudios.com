/**
 * Lists & custom feeds — client-safe constants + zod (§3 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 */
import { z } from 'zod';

export const MAX_LISTS = 20;
export const MAX_MEMBERS = 500;
export const MAX_PINNED = 5;

export const LIST_VISIBILITIES = ['PRIVATE', 'UNLISTED'] as const; // PUBLIC gated (phase 2)
export type ListVisibilityValue = (typeof LIST_VISIBILITIES)[number];

export const listCreateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  bio: z.string().trim().max(200).optional(),
  visibility: z.enum(LIST_VISIBILITIES).optional(),
});

export const listUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(200).nullable().optional(),
  visibility: z.enum(LIST_VISIBILITIES).optional(),
  pinned: z.boolean().optional(),
});

export const listMemberSchema = z.object({ userId: z.string().min(1).max(64) });

export interface ListView {
  id: string;
  name: string;
  bio: string | null;
  visibility: string;
  pinned: boolean;
  memberCount: number;
  isOwner: boolean;
}
