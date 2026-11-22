/**
 * The one create and update path for drafts and scheduled posts (server-only).
 *
 * The site's `/api/scheduled` routes and the developer API's `/api/v1/me/scheduled*` both call
 * `createScheduledPost` and `updateScheduledPost`, so the rules cannot drift. The drafts cap is a
 * check-then-insert: it runs in a transaction that first takes the member's advisory lock, so two
 * requests at the cap cannot both pass the count. Every refusal is a plain value (`{ ok: false }`)
 * that the caller turns into its own error shape; nothing here throws for a refusal.
 */
import { Prisma, type ScheduledPost } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import {
  ALT_REQUIRED_CODE,
  ALT_REQUIRED_MESSAGE,
  communityAltMissing,
  communityGifAltMissing,
} from '@/lib/communities/alt-required';
import { altTextViolation } from '@/lib/feed/alt-text.server';
import { activeSanction } from '@/lib/communities/bans.server';
import { denyCode, denyText } from '@/lib/communities/bans';
import { capsuleDateError } from '@/lib/posts-plus/constants';
import { normalizeGifAlt } from '@/lib/feed/gif-alt';
import { normalizeContentWarning } from '@/lib/feed/content-warning';
import type { createScheduledSchema } from '@/lib/scheduled/scheduled-schema';

/** Drafts and scheduled posts a member may keep at once (published rows do not count). */
export const MAX_PENDING = 50;

export type CreateScheduledInput = z.infer<typeof createScheduledSchema>;

/** What an update may change. Absent = unchanged; `null` clears where the column allows it. */
export interface UpdateScheduledInput {
  content?: string;
  audience?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  replyControl?: 'EVERYONE' | 'FOLLOWING' | 'MENTIONED';
  unlockPrice?: number | null;
  /** The reason for the warning; `null` removes it. */
  contentWarning?: string | null;
  isSensitive?: boolean;
  communityId?: string | null;
  poll?: CreateScheduledInput['poll'] | null;
  imageUrls?: string[];
  imageAlts?: string[];
  scheduledAt?: string | null;
}

export type ScheduledFailureReason =
  | 'empty'
  | 'invalid_image'
  | 'alt_text'
  | 'past'
  | 'capsule_date'
  | 'cap'
  | 'sanction'
  | 'alt_required'
  | 'not_found'
  | 'published'
  | 'capsule_sealed'
  | 'held'
  | 'community_refused';

export interface ScheduledFailure {
  ok: false;
  status: number;
  reason: ScheduledFailureReason;
  /** The JSON body the site sends as is: `{ error, code?, … }`. */
  body: { error: string; code?: string; [k: string]: unknown };
}

/** The fields a write is about to store, offered to a caller's `precheck` (the API's community gate). */
export interface ScheduledState {
  content: string;
  communityId: string | null;
  imageUrls: string[];
  imageAlts: string[];
  gifUrl: string | null;
  gifAlt: string | null;
  hasPoll: boolean;
}

export interface ScheduledWriteOptions {
  /** The image URLs were already resolved to the member's own uploads (the API's `media_ids`). */
  trustedImages?: boolean;
  /** Runs after the cheap validation and before anything is stored; a failure refuses the write. */
  precheck?: (state: ScheduledState) => Promise<ScheduledFailure | null>;
}

const fail = (
  status: number,
  reason: ScheduledFailureReason,
  error: string,
  extra: Record<string, unknown> = {},
): ScheduledFailure => ({ ok: false, status, reason, body: { error, ...extra } });

/** Community-level refusals at write time: the member's sanction, then the image-description rule. */
async function communityRefusal(
  userId: string,
  s: Pick<ScheduledState, 'communityId' | 'imageUrls' | 'imageAlts' | 'gifUrl' | 'gifAlt'>,
): Promise<ScheduledFailure | null> {
  if (!s.communityId) return null;
  // s06-01: no scheduling into a community the member is banned or timed out of.
  const sanction = await activeSanction(s.communityId, userId);
  if (sanction) {
    return fail(403, 'sanction', denyText(sanction.kind, sanction.endsAt), {
      code: denyCode(sanction.kind),
      endsAt: sanction.endsAt ? sanction.endsAt.toISOString() : null,
    });
  }
  // s07-16: a requiring community refuses an undescribed image at scheduling time too.
  if (s.imageUrls.length > 0 || s.gifUrl) {
    const community = await getCommunitySettings(s.communityId);
    const on = community?.requireImageAlt === true;
    const missing = communityAltMissing(on, s.imageUrls, s.imageAlts);
    const missingGif = communityGifAltMissing(on, s.gifUrl, s.gifAlt);
    if (missing.length > 0 || missingGif) {
      return fail(400, 'alt_required', ALT_REQUIRED_MESSAGE, {
        code: ALT_REQUIRED_CODE,
        missing,
        ...(missingGif ? { missingGif } : {}),
      });
    }
  }
  return null;
}

/** Create a draft (no `scheduledAt`), a scheduled post or a time capsule for `userId`. */
export async function createScheduledPost(
  userId: string,
  d: CreateScheduledInput,
  options: ScheduledWriteOptions = {},
): Promise<{ ok: true; post: ScheduledPost } | ScheduledFailure> {
  const hasContent = d.content.trim().length > 0 || !!d.poll || !!d.gifUrl || (d.imageUrls?.length ?? 0) > 0;
  if (!hasContent) return fail(400, 'empty', 'Draft cannot be empty');

  if (!options.trustedImages && d.imageUrls?.length && !d.imageUrls.every((u) => ownsFeedImageUrl(u, userId))) {
    return fail(400, 'invalid_image', 'Invalid image reference');
  }

  const altError = await altTextViolation(userId, d.imageUrls, d.imageAlts, {
    url: d.gifUrl,
    alt: d.gifAlt,
  });
  if (altError) return fail(400, 'alt_text', altError);

  let scheduledAt: Date | null = null;
  if (d.scheduledAt) {
    scheduledAt = new Date(d.scheduledAt);
    if (scheduledAt.getTime() <= Date.now()) {
      return fail(400, 'past', 'Scheduled time must be in the future', { code: 'past' });
    }
  }

  if (d.capsule) {
    if (!scheduledAt) return fail(400, 'capsule_date', 'Pick a date to seal the capsule until');
    const capsuleError = capsuleDateError(scheduledAt);
    if (capsuleError) return fail(400, 'capsule_date', capsuleError);
  }

  const imageUrls = d.imageUrls ?? [];
  const imageAlts = (d.imageAlts ?? []).slice(0, imageUrls.length).map((a) => a.trim());
  const state: ScheduledState = {
    content: d.content.trim(),
    communityId: d.communityId ?? null,
    imageUrls,
    imageAlts,
    gifUrl: d.gifUrl ?? null,
    gifAlt: normalizeGifAlt(d.gifUrl, d.gifAlt),
    hasPoll: !!d.poll,
  };

  const refused = await communityRefusal(userId, state);
  if (refused) return refused;
  if (options.precheck) {
    const gated = await options.precheck(state);
    if (gated) return gated;
  }

  // The cap is a check-then-insert: take the member's lock first so two creates at the cap
  // cannot both pass the count.
  const created = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `scheduled:${userId}`);
    const pending = await tx.scheduledPost.count({ where: { userId, publishedId: null } });
    if (pending >= MAX_PENDING) return null;
    return tx.scheduledPost.create({
      data: {
        userId,
        content: state.content,
        gifUrl: state.gifUrl,
        gifAlt: state.gifAlt,
        imageUrls,
        imageAlts,
        audience: d.audience ?? 'PUBLIC',
        ...normalizeContentWarning({ isSensitive: d.isSensitive, contentWarning: d.contentWarning }),
        replyControl: d.replyControl ?? 'EVERYONE',
        unlockPrice: d.unlockPrice && d.unlockPrice > 0 ? d.unlockPrice : null,
        communityId: state.communityId,
        poll: d.poll ?? undefined,
        scheduledAt,
        isCapsule: d.capsule === true,
      },
    });
  });
  if (!created) return fail(400, 'cap', `You can keep at most ${MAX_PENDING} drafts`);
  return { ok: true, post: created };
}

/** Change a member's own draft or scheduled post. A published row or a sealed capsule is refused. */
export async function updateScheduledPost(
  userId: string,
  id: string,
  d: UpdateScheduledInput,
  options: ScheduledWriteOptions = {},
): Promise<{ ok: true; post: ScheduledPost } | ScheduledFailure> {
  const existing = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) return fail(404, 'not_found', 'Not found');
  if (existing.publishedId) return fail(409, 'published', 'Already published', { code: 'published' });
  // Z7: a sealed time capsule is cancelled (DELETE), never edited.
  if (existing.isCapsule) return fail(409, 'capsule_sealed', 'A time capsule is sealed', { code: 'capsule_sealed' });

  let scheduledAt: Date | null | undefined;
  if (d.scheduledAt !== undefined) {
    if (d.scheduledAt === null) {
      scheduledAt = null;
    } else {
      scheduledAt = new Date(d.scheduledAt);
      if (scheduledAt.getTime() <= Date.now()) {
        return fail(400, 'past', 'Scheduled time must be in the future', { code: 'past' });
      }
    }
  }

  if (d.imageUrls !== undefined && !options.trustedImages && !d.imageUrls.every((u) => ownsFeedImageUrl(u, userId))) {
    return fail(400, 'invalid_image', 'Invalid image reference');
  }

  const content = d.content !== undefined ? d.content.trim() : existing.content;
  const imageUrls = d.imageUrls ?? existing.imageUrls;
  const imageAlts = (d.imageAlts ?? (d.imageUrls ? [] : existing.imageAlts))
    .slice(0, imageUrls.length)
    .map((a) => a.trim());
  const communityId = d.communityId !== undefined ? d.communityId : existing.communityId;
  const poll = d.poll !== undefined ? d.poll : (existing.poll as CreateScheduledInput['poll'] | null);
  const state: ScheduledState = {
    content,
    communityId,
    imageUrls,
    imageAlts,
    gifUrl: existing.gifUrl,
    gifAlt: existing.gifAlt,
    hasPoll: !!poll,
  };

  // Only a change to where the post goes, or what a community would judge, is re-gated.
  const touchesCommunity =
    d.communityId !== undefined ||
    d.content !== undefined ||
    d.imageUrls !== undefined ||
    d.imageAlts !== undefined ||
    d.poll !== undefined;
  if (touchesCommunity) {
    const refused = await communityRefusal(userId, state);
    if (refused) return refused;
  }
  if (options.precheck) {
    const gated = await options.precheck(state);
    if (gated) return gated;
  }

  const cw =
    d.contentWarning !== undefined || d.isSensitive !== undefined
      ? normalizeContentWarning({
          isSensitive: d.isSensitive ?? (d.contentWarning ? true : existing.isSensitive),
          contentWarning: d.contentWarning === undefined ? existing.contentWarning : d.contentWarning,
        })
      : null;

  // Compare-and-set on the row still being an unpublished draft: a publish racing this edit wins.
  const result = await prisma.scheduledPost.updateMany({
    where: { id, userId, publishedId: null, isCapsule: false },
    data: {
      ...(d.content !== undefined ? { content } : {}),
      ...(d.audience !== undefined ? { audience: d.audience } : {}),
      ...(d.replyControl !== undefined ? { replyControl: d.replyControl } : {}),
      ...(d.unlockPrice !== undefined
        ? { unlockPrice: d.unlockPrice && d.unlockPrice > 0 ? d.unlockPrice : null }
        : {}),
      ...(cw ?? {}),
      ...(d.communityId !== undefined ? { communityId: d.communityId } : {}),
      ...(d.poll !== undefined ? { poll: d.poll ?? Prisma.JsonNull } : {}),
      ...(d.imageUrls !== undefined || d.imageAlts !== undefined ? { imageUrls, imageAlts } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt } : {}),
    },
  });
  if (result.count === 0) return fail(409, 'published', 'Already published', { code: 'published' });
  const updated = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!updated) return fail(404, 'not_found', 'Not found');
  return { ok: true, post: updated };
}
