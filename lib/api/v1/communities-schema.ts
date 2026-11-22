/**
 * Zod schemas for `/api/v1/communities*`, `/api/v1/me/communities` and the community fields of
 * `POST /api/v1/posts`. Pure (no server imports) so the limits are testable on their own.
 */
import { z } from 'zod';

export const COMMUNITY_PAGE_MAX = 50;
export const COMMUNITY_PAGE_DEFAULT = 20;
const ID_MAX = 64;

export const communityPath = z.object({
  slug: z
    .string()
    .min(1, 'A community slug is required.')
    .max(80)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Not a community slug.'),
});

/** An empty parameter reads as absent, as the other v1 list routes treat `?cursor=`. */
const optionalText = (max: number) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().max(max).optional());

const pageLimit = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().min(1).max(COMMUNITY_PAGE_MAX).default(COMMUNITY_PAGE_DEFAULT),
);

export const communityPostsQuery = z.object({
  limit: pageLimit,
  cursor: optionalText(ID_MAX),
  flair: optionalText(ID_MAX),
});

export const myCommunitiesQuery = z.object({
  limit: pageLimit,
  cursor: optionalText(ID_MAX),
});

/** The two optional fields `POST /api/v1/posts` gains. */
export const communityPostFields = {
  communityId: z.string().min(1).max(ID_MAX).optional(),
  flairId: z.string().min(1).max(ID_MAX).optional(),
  media_alts: z.array(z.string().max(1000)).max(4).optional(),
};
