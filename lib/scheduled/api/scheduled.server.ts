import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createScheduledSchema } from '@/lib/scheduled/scheduled-schema';
import { createScheduledApi, listScheduledApi } from '@/lib/scheduled/scheduled.contract';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { listScheduled } from '@/lib/scheduled/list.server';
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

const MAX_PENDING = 50;

export const route = apiRoute('/api/scheduled', {
  // List the viewer's drafts + scheduled posts (publishing any that are due).
  GET: implement(listScheduledApi, {}, async ({ session }) => {
    return listScheduled(session.user.id);
  }),

  // Save a new draft or scheduled post.
  POST: implement(
    createScheduledApi,
    { body: createScheduledSchema, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, {
        limit: 30,
        windowMs: 60_000,
        prefix: 'scheduled-create',
      });
      if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

      const d = body;

      const hasContent =
        d.content.trim().length > 0 || !!d.poll || !!d.gifUrl || (d.imageUrls?.length ?? 0) > 0;
      if (!hasContent) {
        return Response.json({ error: 'Draft cannot be empty' }, { status: 400 });
      }

      if (d.imageUrls?.length && !d.imageUrls.every((u) => ownsFeedImageUrl(u, userId))) {
        return Response.json({ error: 'Invalid image reference' }, { status: 400 });
      }

      const altError = await altTextViolation(userId, d.imageUrls, d.imageAlts, {
        url: d.gifUrl,
        alt: d.gifAlt,
      });
      if (altError) {
        return Response.json({ error: altError }, { status: 400 });
      }

      let scheduledAt: Date | null = null;
      if (d.scheduledAt) {
        scheduledAt = new Date(d.scheduledAt);
        if (scheduledAt.getTime() <= Date.now()) {
          return Response.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
        }
      }

      if (d.capsule) {
        if (!scheduledAt) {
          return Response.json({ error: 'Pick a date to seal the capsule until' }, { status: 400 });
        }
        const capsuleError = capsuleDateError(scheduledAt);
        if (capsuleError) return Response.json({ error: capsuleError }, { status: 400 });
      }

      const pending = await prisma.scheduledPost.count({
        where: { userId, publishedId: null },
      });
      if (pending >= MAX_PENDING) {
        return Response.json(
          { error: `You can keep at most ${MAX_PENDING} drafts` },
          { status: 400 },
        );
      }

      // s06-01: no scheduling into a community the member is banned or timed out of.
      if (d.communityId) {
        const sanction = await activeSanction(d.communityId, userId);
        if (sanction) {
          return Response.json(
            {
              error: denyText(sanction.kind, sanction.endsAt),
              code: denyCode(sanction.kind),
              endsAt: sanction.endsAt ? sanction.endsAt.toISOString() : null,
            },
            { status: 403 },
          );
        }
      }

      // s07-16: a requiring community refuses an undescribed image at scheduling time too.
      if (d.communityId && (d.imageUrls?.length || d.gifUrl)) {
        const community = await getCommunitySettings(d.communityId);
        const missing = communityAltMissing(
          community?.requireImageAlt === true,
          d.imageUrls,
          d.imageAlts,
        );
        const missingGif = communityGifAltMissing(community?.requireImageAlt === true, d.gifUrl, d.gifAlt);
        if (missing.length > 0 || missingGif) {
          return Response.json(
            { error: ALT_REQUIRED_MESSAGE, code: ALT_REQUIRED_CODE, missing, ...(missingGif ? { missingGif } : {}) },
            { status: 400 },
          );
        }
      }

      const sp = await prisma.scheduledPost.create({
        data: {
          userId,
          content: d.content.trim(),
          gifUrl: d.gifUrl ?? null,
          gifAlt: normalizeGifAlt(d.gifUrl, d.gifAlt),
          imageUrls: d.imageUrls ?? [],
          imageAlts: (d.imageAlts ?? []).slice(0, d.imageUrls?.length ?? 0).map((a) => a.trim()),
          audience: d.audience ?? 'PUBLIC',
          ...normalizeContentWarning({ isSensitive: d.isSensitive, contentWarning: d.contentWarning }),
          replyControl: d.replyControl ?? 'EVERYONE',
          unlockPrice: d.unlockPrice && d.unlockPrice > 0 ? d.unlockPrice : null,
          communityId: d.communityId ?? null,
          poll: d.poll ?? undefined,
          scheduledAt,
          isCapsule: d.capsule === true,
        },
      });

      return Response.json(sp, { status: 201 });
    },
  ),
});
