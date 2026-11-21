import { z } from 'zod';
import {
  FOLLOW_FILTERS,
  FOLLOW_SORTS,
  FOLLOW_TABS,
  MAX_BULK_IDS,
  MAX_QUERY_LENGTH,
} from '@/lib/social/follow-filters';

const idList = z.string().min(1).max(64);

export const listFollowsQuery = z.object({
  tab: z.enum(FOLLOW_TABS).default('following'),
  filter: z.enum(FOLLOW_FILTERS).default('all'),
  q: z.string().max(MAX_QUERY_LENGTH).default(''),
  sort: z.enum(FOLLOW_SORTS).default('recent'),
  cursor: z.string().max(400).optional(),
});

export const removeFollowersBody = z.object({
  followerIds: z.array(idList).min(1).max(MAX_BULK_IDS),
});

export const bulkUnfollowBody = z.object({
  followingIds: z.array(idList).min(1).max(MAX_BULK_IDS),
});

export const undoUnfollowBody = z.object({
  followingId: idList,
});
