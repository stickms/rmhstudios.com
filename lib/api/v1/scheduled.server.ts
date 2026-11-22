/**
 * Adapters from `/api/v1/me/scheduled*` to the site's drafts and scheduled posts (server-only). Creating and
 * changing run `createScheduledPost` / `updateScheduledPost` (`lib/scheduled/create.server.ts`, the same path as the
 * site, with the drafts cap under the member's lock); publishing runs `publishScheduledPost`, which the due sweep
 * uses too, so every publish-time gate applies. Every function acts as the key owner and reads only their rows.
 *
 * A post into a community follows `POST /api/v1/posts`: the route needs `write:communities` as well, and the
 * community gate (`prepareCommunityPost`, AutoMod included) runs at write time. Because publishing a scheduled row
 * never holds a post for review, a post AutoMod would hold or flag is refused instead (`automod_held`).
 * Time capsules are listed but never created, changed, published or discarded through the API.
 */
import type { ScheduledPost } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { isMediaId } from '@/lib/media/id';
import { attachError, MAX_MEDIA_PER_POST } from '@/lib/media/policy';
import { prepareCommunityPost } from '@/lib/communities/post-gate.server';
import { activeSanction } from '@/lib/communities/bans.server';
import { getAutomodRules } from '@/lib/communities/automod.server';
import { derivePostKind, evaluateAutomod } from '@/lib/communities/automod';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import { communityAltMissing, communityGifAltMissing } from '@/lib/communities/alt-required';
import {
  createScheduledPost,
  updateScheduledPost,
  type ScheduledFailure,
  type ScheduledState,
  type UpdateScheduledInput,
} from '@/lib/scheduled/create.server';
import { publishDueForUser, publishScheduledPost } from '@/lib/scheduled/publish.server';
import {
  decodeScheduledCursor,
  encodeScheduledCursor,
  scheduleBoundsError,
  type HeldReason,
  type ScheduledKind,
  type createScheduledBody,
  type patchScheduledBody,
  type scheduledListQuery,
} from '@/lib/api/v1/scheduled-schema';
import type { ApiContext } from '@/lib/api/with-developer-api.server';

export const HELD_MESSAGE = 'This post would be held for review; post it directly so moderators can review it';

export interface ApiScheduled {
  id: string;
  kind: ScheduledKind;
  content: string;
  /**
   * A key writes only PUBLIC, FOLLOWERS or PRIVATE, but a post scheduled on the site can also be for SUPPORTERS or
   * a CIRCLE, and the read reports what the row holds.
   */
  audience: ScheduledPost['audience'];
  replyControl: 'EVERYONE' | 'FOLLOWING' | 'MENTIONED';
  contentWarning: string | null;
  communityId: string | null;
  poll: Record<string, unknown> | null;
  imageUrls: string[];
  imageAlts: string[];
  gifUrl: string | null;
  gifAlt: string | null;
  scheduledAt: string | null;
  /** Why it would not go out right now (read from the publish checks, never stored), or null. */
  held: HeldReason | null;
  /** The published post's id once it is out; the list never returns such a row. */
  postId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function kindOf(r: Pick<ScheduledPost, 'isCapsule' | 'scheduledAt'>): ScheduledKind {
  if (r.isCapsule) return 'capsule';
  return r.scheduledAt ? 'scheduled' : 'draft';
}

export function serializeScheduled(r: ScheduledPost, held: HeldReason | null): ApiScheduled {
  return {
    id: r.id,
    kind: kindOf(r),
    content: r.content,
    audience: r.audience,
    replyControl: r.replyControl,
    contentWarning: r.contentWarning ?? null,
    communityId: r.communityId ?? null,
    poll: (r.poll as Record<string, unknown> | null) ?? null,
    imageUrls: r.imageUrls,
    imageAlts: r.imageAlts,
    gifUrl: r.gifUrl ?? null,
    gifAlt: r.gifAlt ?? null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    held,
    postId: r.publishedId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * The checks `publishScheduledPost` makes, asked of each row without publishing anything: a sanction, missing image
 * descriptions, and the community's AutoMod rules (the same matcher `prepareCommunityPost` runs; a moderator is
 * exempt there, so here). The rule itself is never returned, only `automod`.
 */
export async function heldReasonsFor(rows: ScheduledPost[]): Promise<Map<string, HeldReason>> {
  const out = new Map<string, HeldReason>();
  const settings = new Map<string, boolean>();
  const sanctioned = new Map<string, boolean>();
  const rulesByCommunity = new Map<string, Awaited<ReturnType<typeof getAutomodRules>>>();
  for (const r of rows) {
    if (!r.communityId || r.publishedId) continue;
    let banned = sanctioned.get(r.communityId);
    if (banned === undefined) {
      banned = !!(await activeSanction(r.communityId, r.userId));
      sanctioned.set(r.communityId, banned);
    }
    if (banned) {
      out.set(r.id, 'community_sanction');
      continue;
    }
    if (r.imageUrls.length > 0 || r.gifUrl) {
      let on = settings.get(r.communityId);
      if (on === undefined) {
        on = (await getCommunitySettings(r.communityId))?.requireImageAlt === true;
        settings.set(r.communityId, on);
      }
      if (
        communityAltMissing(on, r.imageUrls, r.imageAlts).length > 0 ||
        communityGifAltMissing(on, r.gifUrl, r.gifAlt)
      ) {
        out.set(r.id, 'image_descriptions');
        continue;
      }
    }
    if (await automodWouldAct(r, rulesByCommunity)) out.set(r.id, 'automod');
  }
  return out;
}

/** Would the community's AutoMod hold, flag or remove this draft? Rules are read once per community. */
async function automodWouldAct(
  r: ScheduledPost,
  rulesByCommunity: Map<string, Awaited<ReturnType<typeof getAutomodRules>>>,
): Promise<boolean> {
  if (!r.communityId) return false;
  let rules = rulesByCommunity.get(r.communityId);
  if (!rules) {
    rules = await getAutomodRules(r.communityId);
    rulesByCommunity.set(r.communityId, rules);
  }
  if (rules.length === 0) return false;
  const [member, user] = await Promise.all([
    prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: r.communityId, userId: r.userId } },
      select: { role: true },
    }),
    prisma.user.findUnique({
      where: { id: r.userId },
      // Not a display shape: the matcher needs two account facts.
      // eslint-disable-next-line local/no-adhoc-user-select
      select: { createdAt: true, image: true },
    }),
  ]);
  if (!user || member?.role === 'MOD' || member?.role === 'ADMIN') return false;
  const verdict = evaluateAutomod(rules, {
    target: 'post',
    text: r.content,
    postKind: derivePostKind({
      content: r.content,
      gifUrl: r.gifUrl,
      imageUrls: r.imageUrls,
      hasPoll: r.poll != null,
    }),
    accountAgeDays: (Date.now() - user.createdAt.getTime()) / 86_400_000,
    hasAvatar: !!user.image,
  });
  return verdict !== null;
}

/** `media_ids` to the member's own pending uploads' URLs, in order. Nothing is attached: the draft only points at them. */
async function resolveOwnMedia(
  userId: string,
  mediaIds: string[],
): Promise<{ ok: true; urls: string[] } | { ok: false; message: string }> {
  if (mediaIds.length === 0) return { ok: true, urls: [] };
  if (mediaIds.length > MAX_MEDIA_PER_POST) {
    return { ok: false, message: `At most ${MAX_MEDIA_PER_POST} images per post.` };
  }
  if (!mediaIds.every(isMediaId)) return { ok: false, message: 'Media not found.' };
  const rows = await prisma.media.findMany({ where: { id: { in: mediaIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of mediaIds) {
    const err = attachError(byId.get(id) ?? null, userId);
    if (err) return { ok: false, message: err };
  }
  return { ok: true, urls: mediaIds.map((id) => byId.get(id)!.url) };
}

export type ApiFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  /** The gate's own code and fields, for a community refusal (the standard envelope carries them). */
  extra?: Record<string, unknown>;
};

const apiFail = (status: number, code: string, message: string, extra?: Record<string, unknown>): ApiFailure => ({
  ok: false,
  status,
  code,
  message,
  ...(extra ? { extra } : {}),
});

/** A site-path refusal as a v1 error. Messages are the site's own fixed texts; no caught error is echoed. */
export function toApiFailure(f: ScheduledFailure): ApiFailure {
  const { error, ...rest } = f.body;
  switch (f.reason) {
    case 'not_found':
      return apiFail(404, 'not_found', 'Scheduled post not found.');
    case 'published':
    case 'capsule_sealed':
      return apiFail(409, 'conflict', error);
    case 'cap':
      return apiFail(409, 'conflict', error);
    case 'held':
      return apiFail(422, 'automod_held', error);
    case 'invalid_image':
      return apiFail(400, 'invalid_media', error);
    case 'sanction':
    case 'alt_required':
    case 'community_refused':
      return apiFail(f.status, typeof rest.code === 'string' ? rest.code : 'forbidden', error, rest);
    default:
      return apiFail(400, 'invalid_request', error);
  }
}

const REFUSAL_TYPE: Record<number, string> = {
  400: 'invalid_request_error',
  403: 'authorization_error',
  404: 'not_found_error',
  409: 'conflict_error',
  422: 'invalid_request_error',
};

/** Send a failure in the v1 envelope; a gate code outside the catalog rides in the same envelope shape. */
export function failureResponse(ctx: Pick<ApiContext, 'json' | 'error' | 'requestId'>, f: ApiFailure): Response {
  const extra = f.extra ?? {};
  if (f.code === 'automod_held' || !('code' in extra)) return ctx.error(f.code, f.message, f.status);
  return ctx.json(
    {
      error: {
        type: REFUSAL_TYPE[f.status] ?? 'invalid_request_error',
        code: f.code,
        message: f.message,
        request_id: ctx.requestId,
        ...(extra.endsAt !== undefined ? { endsAt: extra.endsAt } : {}),
        ...(extra.missing !== undefined ? { missing: extra.missing } : {}),
        ...(extra.missingGif !== undefined ? { missingGif: extra.missingGif } : {}),
      },
    },
    f.status,
  );
}

/** The community gate at write time (membership, sanctions, flair, descriptions, verification, AutoMod). */
export async function communityPrecheck(userId: string, s: ScheduledState): Promise<ScheduledFailure | null> {
  if (!s.communityId) return null;
  if (s.hasPoll) {
    return {
      ok: false,
      status: 400,
      reason: 'community_refused',
      body: { error: 'A poll cannot be combined with communityId.', code: 'invalid_request' },
    };
  }
  const prepared = await prepareCommunityPost({
    communityId: s.communityId,
    userId,
    content: s.content,
    imageUrls: s.imageUrls,
    imageAlts: s.imageAlts,
    gifUrl: s.gifUrl,
    gifAlt: s.gifAlt,
    hasPoll: false,
  });
  if (!prepared.ok) {
    const r = prepared.refusal;
    return { ok: false, status: r.status, reason: 'community_refused', body: { ...r.body } };
  }
  // A scheduled row is published without a hold, so what AutoMod would hold or flag is refused now.
  if (prepared.held || prepared.flagRule) {
    return { ok: false, status: 422, reason: 'held', body: { error: HELD_MESSAGE, code: 'automod_held' } };
  }
  return null;
}

export interface ScheduledPage {
  data: ApiScheduled[];
  nextCursor: string | null;
}

export async function listScheduledForKey(
  userId: string,
  q: z.infer<typeof scheduledListQuery>,
): Promise<ScheduledPage | 'invalid_cursor'> {
  const c = q.cursor ? decodeScheduledCursor(q.cursor) : null;
  if (q.cursor && !c) return 'invalid_cursor';
  // As the site's list does: anything now due is published first.
  await publishDueForUser(userId);
  const rows = await prisma.scheduledPost.findMany({
    where: {
      userId,
      publishedId: null,
      ...(q.kind === 'capsule' ? { isCapsule: true } : q.kind ? { isCapsule: false } : {}),
      ...(q.kind === 'draft' ? { scheduledAt: null } : q.kind === 'scheduled' ? { scheduledAt: { not: null } } : {}),
      ...(c
        ? {
            OR: [{ createdAt: { lt: new Date(c.ms) } }, { createdAt: new Date(c.ms), id: { lt: c.id } }],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
  });
  const more = rows.length > q.limit;
  const slice = more ? rows.slice(0, q.limit) : rows;
  const held = await heldReasonsFor(slice);
  const last = slice[slice.length - 1];
  return {
    data: slice.map((r) => serializeScheduled(r, held.get(r.id) ?? null)),
    nextCursor: more && last ? encodeScheduledCursor(last.createdAt, last.id) : null,
  };
}

export async function getScheduledForKey(userId: string, id: string): Promise<ApiScheduled | null> {
  const row = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return null;
  const held = await heldReasonsFor([row]);
  return serializeScheduled(row, held.get(row.id) ?? null);
}

export async function createScheduledForKey(
  userId: string,
  body: z.infer<typeof createScheduledBody>,
): Promise<{ ok: true; scheduled: ApiScheduled } | ApiFailure> {
  if (body.capsule === true) {
    return apiFail(400, 'invalid_request', 'Time capsules are created on the site, not through the API.');
  }
  if (body.communityId && body.poll) {
    return apiFail(400, 'invalid_request', 'A poll cannot be combined with communityId.');
  }
  if (body.scheduledAt) {
    const bounds = scheduleBoundsError(body.scheduledAt);
    if (bounds) return apiFail(400, 'invalid_request', bounds);
  }
  const media = await resolveOwnMedia(userId, body.media_ids ?? []);
  if (!media.ok) return apiFail(400, 'invalid_media', media.message);

  const out = await createScheduledPost(
    userId,
    {
      content: body.content ?? '',
      ...(body.poll ? { poll: body.poll } : {}),
      imageUrls: media.urls,
      imageAlts: body.media_alts ?? [],
      ...(body.audience ? { audience: body.audience } : {}),
      ...(body.replyControl ? { replyControl: body.replyControl } : {}),
      ...(body.contentWarning !== undefined ? { contentWarning: body.contentWarning } : {}),
      ...(body.communityId ? { communityId: body.communityId } : {}),
      ...(body.scheduledAt ? { scheduledAt: body.scheduledAt } : {}),
    },
    { trustedImages: true, precheck: (s) => communityPrecheck(userId, s) },
  );
  if (!out.ok) return toApiFailure(out);
  return { ok: true, scheduled: serializeScheduled(out.post, null) };
}

export async function patchScheduledForKey(
  userId: string,
  id: string,
  body: z.infer<typeof patchScheduledBody>,
): Promise<{ ok: true; scheduled: ApiScheduled } | ApiFailure> {
  if (body.capsule === true) {
    return apiFail(400, 'invalid_request', 'Time capsules are created on the site, not through the API.');
  }
  if (body.communityId && body.poll) {
    return apiFail(400, 'invalid_request', 'A poll cannot be combined with communityId.');
  }
  if (body.scheduledAt) {
    const bounds = scheduleBoundsError(body.scheduledAt);
    if (bounds) return apiFail(400, 'invalid_request', bounds);
  }
  let imageUrls: string[] | undefined;
  if (body.media_ids !== undefined) {
    const media = await resolveOwnMedia(userId, body.media_ids);
    if (!media.ok) return apiFail(400, 'invalid_media', media.message);
    imageUrls = media.urls;
  }
  const patch: UpdateScheduledInput = {
    ...(body.content !== undefined ? { content: body.content } : {}),
    ...(body.audience !== undefined ? { audience: body.audience } : {}),
    ...(body.replyControl !== undefined ? { replyControl: body.replyControl } : {}),
    ...(body.contentWarning !== undefined ? { contentWarning: body.contentWarning } : {}),
    ...(body.communityId !== undefined ? { communityId: body.communityId } : {}),
    ...(body.poll !== undefined ? { poll: body.poll } : {}),
    ...(imageUrls !== undefined ? { imageUrls } : {}),
    ...(body.media_alts !== undefined ? { imageAlts: body.media_alts } : {}),
    ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt } : {}),
  };
  const out = await updateScheduledPost(userId, id, patch, {
    trustedImages: true,
    precheck: async (s) => {
      if (!s.content && !s.hasPoll && !s.gifUrl && s.imageUrls.length === 0) {
        return { ok: false, status: 400, reason: 'empty', body: { error: 'Draft cannot be empty' } };
      }
      return communityPrecheck(userId, s);
    },
  });
  if (!out.ok) return toApiFailure(out);
  const held = await heldReasonsFor([out.post]);
  return { ok: true, scheduled: serializeScheduled(out.post, held.get(out.post.id) ?? null) };
}

export async function discardScheduledForKey(userId: string, id: string): Promise<{ ok: true } | ApiFailure> {
  const row = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return apiFail(404, 'not_found', 'Scheduled post not found.');
  if (row.isCapsule) return apiFail(409, 'conflict', 'A time capsule is sealed; cancel it on the site.');
  if (row.publishedId) return apiFail(409, 'conflict', 'Already published');
  await prisma.scheduledPost.deleteMany({ where: { id, userId, publishedId: null, isCapsule: false } });
  return { ok: true };
}

/** The row a publish or a scope check needs: the key owner's, unpublished, not a capsule. */
export async function loadOwnForKey(
  userId: string,
  id: string,
): Promise<{ ok: true; row: ScheduledPost } | ApiFailure> {
  const row = await prisma.scheduledPost.findUnique({ where: { id } });
  if (!row || row.userId !== userId) return apiFail(404, 'not_found', 'Scheduled post not found.');
  return { ok: true, row };
}

export async function publishScheduledForKey(
  userId: string,
  row: ScheduledPost,
): Promise<{ ok: true; postId: string } | ApiFailure> {
  if (row.publishedId) return apiFail(409, 'conflict', 'Already published');
  if (row.isCapsule)
    return apiFail(409, 'conflict', 'A time capsule opens on its date; it cannot be published through the API.');
  const gated = await communityPrecheck(userId, {
    content: row.content,
    communityId: row.communityId,
    imageUrls: row.imageUrls,
    imageAlts: row.imageAlts,
    gifUrl: row.gifUrl,
    gifAlt: row.gifAlt,
    hasPoll: false,
  });
  if (gated) return toApiFailure(gated);
  const postId = await publishScheduledPost(row);
  if (!postId) {
    const held = await heldReasonsFor([row]);
    const why = held.get(row.id);
    return apiFail(
      409,
      'conflict',
      why === 'image_descriptions'
        ? 'Not published: the community needs a description on every image.'
        : why === 'community_sanction'
          ? 'Not published: you are banned or timed out in that community.'
          : 'Not published: it was published or removed by another request, or an image is already attached to another post.',
    );
  }
  return { ok: true, postId };
}
