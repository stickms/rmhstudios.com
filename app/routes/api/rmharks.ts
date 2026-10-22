import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { checkRateLimit } from '@/lib/rate-limit.server';
import { createRMHarkSchema } from '@/lib/rmhark-schema';
import type { FeedItem, FeedFilter } from '@/lib/feed-types';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { feedEventBus } from '@/lib/feed-sse';
import { linkPostHashtags } from '@/lib/tags-extract.server';
import { notifyMentions } from '@/lib/feed/notify-mentions.server';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { getActiveBan } from '@/lib/admin-audit.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { canReadThread } from '@/lib/feed/audience.server';
import { getTimeline, type FeedSurface } from '@/lib/feed/timeline';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { publishDueForUser } from '@/lib/scheduled/publish.server';
import { screenNewContent } from '@/lib/moderation/auto-moderate.server';
import { recordLinkDomains } from '@/lib/safety/link-risk.server';
import { apiCache } from '@/lib/cache';
import { altTextViolation } from '@/lib/feed/alt-text.server';
import { gateCommunityContent, logRemoved } from '@/lib/communities/gate.server';
import { HELD_BY, recordModItem } from '@/lib/communities/automod.server';
import { derivePostKind } from '@/lib/communities/automod';
import { listFlairs } from '@/lib/communities/flairs.server';
import { challengeEntryError } from '@/lib/communities/challenge.server';
import { enqueuePostDiscovery } from '@/lib/discovery/jobs.server';
import { planPostsPlus, recordPostsPlusTx, afterPostsPlus } from '@/lib/posts-plus/compose.server';

/** Throttle window for the lazy scheduled-post probe on the feed read path. */
const SCHEDULED_PROBE_TTL_MS = 60_000;

export const Route = createFileRoute('/api/rmharks')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const cursor = searchParams.get('cursor');
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
        const filter = (searchParams.get('filter') || 'all') as FeedFilter;
        const search = searchParams.get('search');
        const feedParam = searchParams.get('feed');

        // Get current user session (optional, for liked/reposted status)
        let userId: string | null = null;
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          userId = session?.user?.id ?? null;
        } catch {
          // Not logged in, that's fine
        }

        // Normal feed browsing stays open and unthrottled. Only the `search` path is
        // gated: it runs a text match over posts and (unlike normal pages) bypasses
        // the anon first-page cache, so an unauthenticated attacker could otherwise
        // use it as a cheap DB-scan amplifier. Require a session and apply a
        // generous per-user limit (does not affect ordinary navigation).
        if (search && search.trim()) {
          if (!userId) {
            return Response.json({ error: 'Sign in to search' }, { status: 401 });
          }
          const { allowed, retryAfter } = await checkRateLimit(userId, {
            limit: 40, // ×4 multiplier ⇒ ~160/min — comfortably above debounced typing
            windowMs: 60_000,
            prefix: 'feed:search',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Searching too fast, please slow down' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }
        }

        // Lazily publish any of the viewer's scheduled posts whose time has come,
        // so they appear in the feed without the author visiting the drafts page.
        // Fire-and-forget (not awaited) so it never adds a serial DB round-trip to
        // the hot path: a just-due post surfaces on the next read/SSE tick instead.
        // Only on the first page (no cursor), and throttled per-user so a rapidly
        // refreshing feed doesn't re-run the scheduled_post scan on every request —
        // a newly-due post still surfaces within the throttle window.
        if (userId && !cursor) {
          const probeKey = `scheduled:probe:${userId}`;
          if (!apiCache.get(probeKey)) {
            apiCache.set(probeKey, 1, SCHEDULED_PROBE_TTL_MS);
            void publishDueForUser(userId).catch(() => {});
          }
        }

        // Surface resolution. The Twitter-shaped name is `feed=following|foryou`;
        // we keep back-compat with the legacy `filter=friends` value so older
        // clients (or in-flight requests during a deploy) keep working.
        const surface: FeedSurface =
          feedParam === 'following' || filter === 'friends' ? 'following' : 'foryou';

        const result = await getTimeline({
          userId,
          surface,
          filter,
          cursor,
          limit,
          search,
        });

        return Response.json(result);
      }),
      // `idempotent: true` — this is one of the endpoints the service worker's
      // offline outbox (B10) may queue and replay, and a replayed create without
      // key-based deduplication is a double post. The wrapper reads the body once
      // (to hash it for the key), so validation MUST go through `body:` here: a
      // second `request.json()` inside the handler would throw on a used stream.
      POST: defineHandler(
        { body: createRMHarkSchema, verboseValidationErrors: true, idempotent: true },
        async ({ request, session, body: input }) => {
          const ban = await getActiveBan(session.user.id);
          if (ban) {
            return Response.json(
              { error: `Your account is suspended${ban.reason ? `: ${ban.reason}` : ''}` },
              { status: 403 },
            );
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 10,
            windowMs: 60_000,
            prefix: 'rmhark-create',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const {
            content,
            poll,
            gifUrl,
            imageUrls,
            imageAlts,
            originalId,
            audience,
            isSensitive,
            replyControl,
            unlockPrice,
            communityId,
            isTake,
            codeEmbed,
            flairId,
            challengeId,
            ttl,
            seriesId,
            qotdDay,
          } = input;

          if (imageUrls?.length && !imageUrls.every((u) => ownsFeedImageUrl(u, session.user.id))) {
            return Response.json({ error: 'Invalid image reference' }, { status: 400 });
          }

          // Require-alt-text mode (X12): the author's own setting, enforced here
          // as well as in the composer. Only looked up when the post has images.
          const altError = await altTextViolation(session.user.id, imageUrls, imageAlts);
          if (altError) {
            return Response.json({ error: altError }, { status: 400 });
          }

          // posts-plus: expiry (X8), series (X5) and question-of-the-day (X4) fields.
          const planned = await planPostsPlus(session.user.id, {
            ttl,
            seriesId,
            qotdDay,
            audience,
            communityId,
          });
          if (!planned.plan) {
            return Response.json({ error: planned.error }, { status: 400 });
          }
          const plusPlan = planned.plan;

          // Trim alt text and clamp to the number of images so the two arrays stay
          // index-aligned even if the client sends a longer/whitespace-only list.
          const cleanImageAlts = (imageAlts ?? [])
            .slice(0, imageUrls?.length ?? 0)
            .map((a) => a.trim());

          // Posting into a community requires membership.
          if (communityId) {
            const member = await prisma.communityMember.findUnique({
              where: { communityId_userId: { communityId, userId: session.user.id } },
              select: { id: true },
            });
            if (!member) {
              return Response.json({ error: 'Join the community to post in it' }, { status: 403 });
            }
          }

          // Community gate (N1 flair, S2 verification, N4 AutoMod). One call; the
          // outcome decides below whether the post is refused, held, flagged, or
          // goes straight through.
          let held = false;
          let flagRule: string | null = null;
          let holdRule = 'AutoMod';
          if (communityId) {
            const gate = await gateCommunityContent({
              communityId,
              userId: session.user.id,
              target: 'post',
              content,
              postKind: derivePostKind({
                content,
                gifUrl,
                imageUrls,
                hasPoll: !!poll,
                isQuote: !!originalId,
              }),
              flairId,
            });
            if (gate.kind === 'deny') {
              return Response.json({ error: gate.error, code: gate.code }, { status: gate.status });
            }
            if (gate.kind === 'remove') {
              await logRemoved({
                communityId,
                entityType: 'rmhark',
                postId: null,
                authorId: session.user.id,
                ruleName: gate.ruleName,
                content,
              });
              return Response.json(
                {
                  error: `Your post was removed by this community's AutoMod rule "${gate.ruleName}".`,
                  code: 'automod_removed',
                },
                { status: 422 },
              );
            }
            if (challengeId) {
              const challengeError = await challengeEntryError(
                communityId,
                challengeId,
                session.user.id,
              );
              if (challengeError) {
                return Response.json({ error: challengeError, code: 'challenge_closed' }, { status: 409 });
              }
            }
            // A challenge entry is never invisible: a hold becomes a flag so the
            // mods still see it without the entry vanishing from the contest.
            if (gate.kind === 'hold' && !challengeId) {
              held = true;
              holdRule = gate.ruleName;
            } else if (gate.kind === 'hold') flagRule = gate.ruleName;
            else if (gate.kind === 'allow' && gate.flag) flagRule = gate.flag.ruleName;
          } else if (flairId || challengeId) {
            return Response.json(
              { error: 'Flair and challenges only apply to community posts' },
              { status: 400 },
            );
          }

          // Validate the quoted post exists (and isn't itself a quote, to avoid chains).
          let quotedOriginalId: string | null = null;
          if (originalId) {
            const orig = await prisma.rMHark.findUnique({
              where: { id: originalId },
              select: {
                id: true,
                deletedAt: true,
                originalId: true,
                userId: true,
                audience: true,
                communityId: true,
              },
            });
            // A quote republishes the quoted post, so it must be readable by the quoter
            // (deleted, audience, blocks, private community): same 400 as a missing post.
            if (!orig || !(await canReadThread(orig, session.user.id))) {
              return Response.json({ error: 'Quoted post not found' }, { status: 400 });
            }
            quotedOriginalId = orig.originalId ?? orig.id; // quote the root, not a quote
          }

          // Captured from the in-transaction user update so the deferred achievements
          // block can read the author's post total without a separate COUNT(*).
          let newPostCount = 0;
          const rmhark = await prisma.$transaction(async (tx) => {
            const created = await tx.rMHark.create({
              data: {
                content: content.trim(),
                gifUrl: gifUrl ?? null,
                imageUrls: imageUrls ?? [],
                imageAlts: cleanImageAlts,
                userId: session.user.id,
                originalId: quotedOriginalId,
                audience: audience ?? 'PUBLIC',
                isSensitive: isSensitive ?? false,
                replyControl: replyControl ?? 'EVERYONE',
                unlockPrice: unlockPrice && unlockPrice > 0 ? unlockPrice : null,
                communityId: communityId ?? null,
                isTake: isTake ?? false,
                hasEmbed: !!codeEmbed,
                ...(codeEmbed ? { codeEmbed: { create: codeEmbed } } : {}),
                // An AutoMod hold is a soft-delete marker: invisible everywhere
                // until a mod approves it (see automod.server.ts resolvePost).
                ...(held ? { deletedAt: new Date(), deletedBy: HELD_BY } : {}),
                expiresAt: plusPlan.expiresAt,
                seriesId: plusPlan.seriesId,
              },
              include: {
                user: { select: userDisplaySelect },
              },
            });

            // Extract @hashtags once at write time into the normalized hashtag /
            // post_hashtag tables (indexed lookups for trending + tag feeds) instead
            // of scanning `content` with ILIKE on read. Same tx as the post insert.
            // A held post is counted and hashtag-linked when a mod approves it.
            if (!held) {
              await linkPostHashtags(tx, created.id, created.content);

              // Maintain the author's denormalized post count atomically with the
              // insert (profile pages read this column instead of COUNT(*)).
              const updatedUser = await tx.user.update({
                where: { id: session.user.id },
                data: { postCount: { increment: 1 } },
                select: { postCount: true },
              });
              newPostCount = updatedUser.postCount;

              // Maintain the community's denormalized post count in the same tx so the
              // community page reads this column instead of COUNT(*) over rmheet.
              if (communityId) {
                await tx.community.update({
                  where: { id: communityId },
                  data: { postCount: { increment: 1 } },
                });
              }
            }

            if (communityId && flairId) {
              await tx.communityPostFlair.create({ data: { postId: created.id, flairId } });
            }
            if (communityId && challengeId) {
              await tx.communityChallengeEntry.create({
                data: { challengeId, postId: created.id, userId: session.user.id },
              });
            }

            if (quotedOriginalId) {
              await tx.rMHark.update({
                where: { id: quotedOriginalId },
                data: { repostCount: { increment: 1 } },
              });
            }

            await recordPostsPlusTx(tx, created.id, session.user.id, plusPlan);

            if (poll) {
              await tx.rMHarkPoll.create({
                data: {
                  rmheetId: created.id,
                  question: poll.question.trim(),
                  multiSelect: poll.multiSelect,
                  closesAt: poll.durationHours
                    ? new Date(Date.now() + poll.durationHours * 60 * 60 * 1000)
                    : null,
                  options: {
                    create: poll.options.map((text, i) => ({
                      text: text.trim(),
                      position: i,
                    })),
                  },
                },
                include: { options: true },
              });
            }

            return created;
          });

          // AutoMod hold / flag: file the mod-queue entry. A held post stops here —
          // no feed broadcast, mentions, or progression until a mod approves it.
          if (communityId && (held || flagRule)) {
            await recordModItem({
              communityId,
              entityType: 'rmhark',
              entityId: rmhark.id,
              postId: rmhark.id,
              authorId: session.user.id,
              action: held ? 'hold' : 'flag',
              ruleName: held ? holdRule : (flagRule ?? 'AutoMod'),
              snapshot: content.trim() || '(media post)',
            }).catch((e) => console.error('automod queue error:', e));
          }
          if (held) {
            return Response.json(
              {
                held: true,
                id: rmhark.id,
                message:
                  'Your post is being held for review by the community moderators. It will appear once approved.',
              },
              { status: 202 },
            );
          }

          // Fire-and-forget AI pre-screen for policy violations. Never blocks or
          // delays the post; only files a report for human review if clearly abusive.
          await recordLinkDomains(rmhark.content);
          if (rmhark.content.trim()) {
            void screenNewContent({
              entityType: 'rmhark',
              entityId: rmhark.id,
              authorId: session.user.id,
              text: rmhark.content,
            });
          }

          // Re-fetch with poll data if poll was created
          let pollData: FeedItem['poll'] | undefined;
          if (poll) {
            const createdPoll = await prisma.rMHarkPoll.findUnique({
              where: { rmheetId: rmhark.id },
              include: {
                options: { orderBy: { position: 'asc' } },
              },
            });
            if (createdPoll) {
              pollData = {
                id: createdPoll.id,
                question: createdPoll.question,
                multiSelect: createdPoll.multiSelect,
                totalVotes: 0,
                options: createdPoll.options.map((o) => ({
                  id: o.id,
                  text: o.text,
                  voteCount: 0,
                })),
                myVotes: [],
              };
            }
          }

          const item: FeedItem = {
            id: rmhark.id,
            type: 'rmhark',
            createdAt: rmhark.createdAt.toISOString(),
            content: rmhark.content,
            user: resolveUser(rmhark.user),
            likeCount: 0,
            commentCount: 0,
            repostCount: 0,
            viewCount: 0,
            liked: false,
            reposted: false,
            poll: pollData,
            gifUrl: rmhark.gifUrl ?? undefined,
            imageUrls: rmhark.imageUrls,
            imageAlts: rmhark.imageAlts,
            isSensitive: rmhark.isSensitive,
            replyControl: rmhark.replyControl,
            isTake: rmhark.isTake || undefined,
            hasEmbed: rmhark.hasEmbed || undefined,
            seriesId: rmhark.seriesId ?? undefined,
            expiresAt: rmhark.expiresAt?.toISOString(),
            reactions: [],
          };
          if (communityId && flairId) {
            const flair = (await listFlairs(communityId)).find((f) => f.id === flairId);
            if (flair) item.communityFlair = flair;
          }

          // Attach the quoted original so the card renders it inline immediately.
          if (quotedOriginalId) {
            const orig = await prisma.rMHark.findUnique({
              where: { id: quotedOriginalId },
              select: {
                id: true,
                content: true,
                createdAt: true,
                likeCount: true,
                commentCount: true,
                repostCount: true,
                viewCount: true,
                gifUrl: true,
                imageUrls: true,
                unlockPrice: true,
                audience: true,
                user: { select: userDisplaySelect },
              },
            });
            if (orig) {
              // Match timeline mapOriginal: only free public originals show media.
              const showMedia = (orig.unlockPrice ?? 0) === 0 && orig.audience === 'PUBLIC';
              item.original = {
                id: orig.id,
                type: 'rmhark',
                createdAt: orig.createdAt.toISOString(),
                content: orig.content,
                user: resolveUser(orig.user),
                likeCount: orig.likeCount,
                commentCount: orig.commentCount,
                repostCount: orig.repostCount,
                viewCount: orig.viewCount,
                gifUrl: showMedia ? (orig.gifUrl ?? undefined) : undefined,
                imageUrls: showMedia ? orig.imageUrls : undefined,
              };

              // Tell the quoted author. Links to the QUOTE so they see the commentary.
              void createNotification({
                userId: orig.user.id,
                actorId: session.user.id,
                type: 'REPOST',
                entityType: 'rmhark',
                entityId: item.id,
                preview: content.trim().slice(0, 140) || null,
                link: `/u/${item.user?.handle ?? '_'}/post/${item.id}`,
              });
            }
          }

          // Publish to the SSE bus. The stream endpoint targets this to each
          // viewer's follow graph using `authorId` (Phase 3) instead of blindly
          // prepending onto every open client.
          // Paid posts must broadcast a locked teaser — never the unlocked content,
          // since the SSE payload reaches the author's followers.
          const broadcastItem =
            unlockPrice && unlockPrice > 0
              ? {
                  ...item,
                  content: '',
                  imageUrls: undefined,
                  imageAlts: undefined,
                  gifUrl: undefined,
                  poll: undefined,
                  locked: true,
                  unlockPrice,
                }
              : item;
          feedEventBus.publishPostCreated({
            type: 'rmhark.created',
            rmharkId: item.id,
            payload: broadcastItem,
            timestamp: item.createdAt,
            authorId: session.user.id,
          });

          // Notify mentioned users (persisted MENTION notification + live SSE toast).
          // Best-effort and nothing downstream uses its result, so fire-and-forget:
          // awaiting it put a user lookup + N notification inserts on the 201's path.
          const mentionAuthor = item.user;
          if (mentionAuthor) {
            void notifyMentions({
              content: rmhark.content,
              author: {
                id: mentionAuthor.id,
                name: mentionAuthor.name ?? null,
                image: mentionAuthor.image ?? null,
                handle: mentionAuthor.handle ?? null,
              },
              postId: item.id,
              entityType: 'rmhark',
              entityId: item.id,
              link: `/u/${mentionAuthor.handle ?? mentionAuthor.id}/post/${item.id}`,
              timestamp: item.createdAt,
            }).catch((err) => console.error('Mention notification error:', err));
          }

          // Achievements + progression (posting milestones, night-owl easter egg, XP,
          // quests) are best-effort and don't shape the response, so run them as a
          // fire-and-forget background task. Awaiting them here added ~6 serial DB
          // round-trips before the 201. The post total comes from the denormalized
          // User.postCount captured in the transaction (no separate COUNT(*)).
          void (async () => {
            try {
              const count = newPostCount;
              await progressAchievement(session.user.id, 'social.first_post', {
                setProgress: count,
              });
              await progressAchievement(session.user.id, 'social.posts_10', { setProgress: count });
              await progressAchievement(session.user.id, 'social.posts_100', {
                setProgress: count,
              });
              const hour = new Date().getHours();
              if (hour >= 2 && hour < 5)
                await grantAchievement(session.user.id, 'special.night_owl');
              if (poll) await grantAchievement(session.user.id, 'social.first_poll');
              if (originalId) await grantAchievement(session.user.id, 'social.first_quote');
              if (unlockPrice && unlockPrice > 0)
                await grantAchievement(session.user.id, 'creator.first_paid_post');
              // Progression: XP + quests for posting.
              await awardXp(session.user.id, 25);
              await progressQuests(session.user.id, 'post');
            } catch (e) {
              console.error('post achievement error:', e);
            }
          })();

          afterPostsPlus(item.id, session.user.id, plusPlan);
          // Keyword alerts + community watchers: matched by the jobs worker, never inline.
          void enqueuePostDiscovery(item.id);

          return Response.json(item, { status: 201 });
        },
      ),
    },
  },
});
