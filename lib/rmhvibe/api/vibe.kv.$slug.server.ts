import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { AppError } from '@/lib/errors/codes';
import { vibeKvReadApi, vibeKvWriteApi } from '@/lib/rmhvibe/vibe-kv.contract';
import { vibeKvReadQuerySchema, vibeKvWriteBodySchema } from '@/lib/rmhvibe/vibe-kv-schema';
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
 * GET/POST /api/vibe/kv/:slug — the per-vibe store, reached only through the viewer's
 * bridge host. Every limit (key shape, value size, key counts, `by` range, list size)
 * is enforced server-side in `vibe-kv.server.ts`; this layer is auth, rate and shape.
 */
export const route = apiRoute('/api/vibe/kv/$slug', {
  GET: implement(
    vibeKvReadApi,
    {
      auth: 'optional',
      rateLimit: 'read',
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
