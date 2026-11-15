import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import {
  deleteSavedSearchApi,
  listSavedSearchesApi,
  saveSearchApi,
} from '@/lib/rmhladder/searches.contract';
import { deleteSearchQuery, saveSearchBody } from '@/lib/rmhladder/searches-schema';

export const route = apiRoute('/api/rmhladder/searches', {
  GET: implement(listSavedSearchesApi, {}, async ({ userId }) =>
    Response.json(
      await prisma.ladderSavedSearch.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      }),
    ),
  ),
  POST: implement(
    saveSearchApi,
    {
      body: saveSearchBody,
      allowEmptyBody: true,
      invalid: () => Response.json({ error: 'Invalid saved search' }, { status: 400 }),
    },
    async ({ userId, body }) => {
      await prisma.ladderUserPrefs.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      const { id, ...data } = body;
      if (id) {
        const updated = await prisma.ladderSavedSearch.updateMany({
          where: { id, userId },
          data,
        });
        if (updated.count === 0) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(await prisma.ladderSavedSearch.findUnique({ where: { id } }));
      }
      return Response.json(await prisma.ladderSavedSearch.create({ data: { ...data, userId } }), {
        status: 201,
      });
    },
  ),
  DELETE: implement(
    deleteSavedSearchApi,
    {
      query: deleteSearchQuery,
      invalid: () => Response.json({ error: 'Missing id' }, { status: 400 }),
    },
    async ({ userId, query }) => {
      const deleted = await prisma.ladderSavedSearch.deleteMany({
        where: { id: query.id, userId },
      });
      return deleted.count
        ? { ok: true as const }
        : Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
