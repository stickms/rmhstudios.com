import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { AppError } from '@/lib/errors/codes';
import { vibeKvReadApi, vibeKvWriteApi } from '@/lib/rmhvibe/vibe-kv.contract';
import { vibeKvReadQuerySchema, vibeKvWriteBodySchema } from '@/lib/rmhvibe/vibe-kv-schema';
import { bearerToken, verifyDiscordActivityToken } from '@/lib/discord/verify-activity-token.server';
import { findLinkedUserId } from '@/lib/discord-link.server';
import { kvGet, kvIncr, kvList, kvSet, type KvScope } from '@/lib/rmhvibe/vibe-kv.server';

/** The page's id, only while it is ready: a building or failed page has no store. */
async function readyPageId(slug: string): Promise<string> {
  const page = await prisma.vibePage.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
      status: true,
    },
  });
  if (!page || page.status !== 'ready') throw new AppError('NOT_FOUND');
  return page.id;
}

/** Page scope is shared (owner ''), user scope belongs to the signed-in viewer. */
function ownerOf(scope: KvScope, userId: string | null): string {
  if (scope === 'page') return '';
  if (!userId) throw new AppError('UNAUTHORIZED');
  return userId;
}

/**
 * The Discord Activity has no site session (its iframe carries no cookies), so it sends its
 * Activity access token as a bearer. Verified with the hub's rules; a linked account is that
 * site user, an unlinked guest has no user id (page scope only). The rate bucket is the
 * Discord id, because inside Discord every caller shares the proxy's egress IP. An invalid,
 * expired or foreign-app token is simply anonymous.
 */
async function discordAuth(request: Request) {
  const token = bearerToken(request.headers);
  if (!token) return null;
  const identity = await verifyDiscordActivityToken(token);
  if (!identity) return null;
  return {
    userId: await findLinkedUserId(identity.discordId),
    rateScope: `discord:${identity.discordId}`,
  };
}

/**
 * GET/POST /api/vibe/kv/:slug — the per-vibe store, reached only through the viewer's
 * bridge host. Every limit (key shape, value size, key counts, `by` range, list size)
 * is enforced server-side in `vibe-kv.server.ts`; this layer is auth, rate and shape.
 */
export const route = apiRoute('/api/vibe/kv/$slug', {
  GET: implement(
    vibeKvReadApi,
    {
      auth: 'optional',
      alternateAuth: discordAuth,
      // Its own bucket (not the site-wide `read` one a poll loop would drain).
      rateLimit: {
        policy: 'read',
        scope: 'user',
        prefix: 'vibe-kv-read',
        limit: 120,
        windowMs: 60_000,
      },
      query: vibeKvReadQuerySchema,
      microCache: false,
    },
    async ({ userId, params, query }) => {
      const owner = ownerOf(query.scope, userId);
      const pageId = await readyPageId(params.slug);
      if (query.key !== undefined) {
        return {
          value: await kvGet(pageId, query.scope, owner, query.key),
        };
      }
      return {
        items: await kvList(pageId, query.scope, owner, {
          prefix: query.prefix ?? '',
          order: query.order ?? 'key',
          limit: query.limit ?? 100,
        }),
      };
    },
  ),
  POST: implement(
    vibeKvWriteApi,
    {
      auth: 'optional',
      alternateAuth: discordAuth,
      rateLimit: {
        policy: 'write',
        scope: 'user',
        prefix: 'vibe-kv',
        limit: 60,
        windowMs: 60_000,
      },
      body: vibeKvWriteBodySchema,
      // A value is capped at 4096 chars; this refuses an oversized body before it is read.
      maxBodyBytes: 16 * 1024,
    },
    async ({ userId, params, body }) => {
      const owner = ownerOf(body.scope, userId);
      if (body.oncePerUser && !userId) throw new AppError('UNAUTHORIZED');
      const pageId = await readyPageId(params.slug);
      if (body.op === 'set') {
        await kvSet(pageId, body.scope, owner, body.key, body.value);
        return {
          ok: true as const,
        };
      }
      return kvIncr(pageId, body.scope, owner, body.key, body.by ?? 0, {
        ...(body.oncePerUser && userId
          ? {
              oncePerUser: {
                userId,
              },
            }
          : {}),
      });
    },
  ),
});
