import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteReaderMarksApi, getReaderMarksApi, putReaderMarksApi } from '@/lib/library/reader-sync.contract';
import { putMarksBody, readerSlug } from '@/lib/library/reader-sync-schema';
import { deleteReaderMarks, getReaderMarks, putReaderMarks } from '@/lib/library/reader-sync.server';

/**
 * GET    /api/library/$slug/marks — the caller's synced place, bookmarks and notes for a book.
 * PUT    /api/library/$slug/marks — a batch (at most 50) of upserts and tombstones, and the place.
 * DELETE /api/library/$slug/marks — remove everything the caller synced for the book.
 *
 * Session-only and keyed by the caller: no route reads another member's marks, the
 * uploader's included. GET and PUT refuse a book the caller cannot open (hidden or
 * missing); DELETE is the caller's own data and always works.
 */
const notFound = () =>
  Response.json(
    {
      error: 'Not found.',
    },
    {
      status: 404,
    },
  );

export const route = apiRoute('/api/library/$slug/marks', {
  GET: implement(
    getReaderMarksApi,
    {
      rateLimit: 'read',
    },
    async ({ userId, params }) => {
      const slug = readerSlug.safeParse(params.slug);
      if (!slug.success) return notFound();
      const res = await getReaderMarks(userId, slug.data);
      return res ?? notFound();
    },
  ),
  PUT: implement(
    putReaderMarksApi,
    {
      // The place goes up at most every 10 s per open book; edits ride along.
      rateLimit: {
        policy: 'write',
        scope: 'user',
        prefix: 'reader-marks',
        limit: 30,
        windowMs: 60_000,
      },
      body: putMarksBody,
    },
    async ({ userId, params, body }) => {
      const slug = readerSlug.safeParse(params.slug);
      if (!slug.success) return notFound();
      const res = await putReaderMarks(userId, slug.data, body);
      return res ?? notFound();
    },
  ),
  DELETE: implement(
    deleteReaderMarksApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const slug = readerSlug.safeParse(params.slug);
      if (!slug.success) return notFound();
      return {
        ok: true as const,
        removed: await deleteReaderMarks(userId, slug.data),
      };
    },
  ),
});
