import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import { CommentBodyZ } from '@/lib/slice-it/api-schemas';
import { extractTimestamp } from '@/lib/slice-it/taxonomy';

const CommentQueryZ = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

/**
 * Song comments.
 *
 * The GET was capped at a flat `take: 200` with no pagination — a cap chosen so
 * a popular thread would not grow into the response forever, which is a real
 * concern and the wrong fix: it made comment 201 unreachable instead of
 * unloaded. Keyset pagination on `(createdAt desc, id desc)` gets both.
 *
 * The POST hand-rolled its own length and emptiness checks on an untyped body;
 * `CommentBodyZ` is the same rules, declared where the client can read them.
 */
export const Route = createFileRoute('/api/slice-it/songs/$id/comments')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: CommentQueryZ, rateLimit: 'read' },
        async ({ params, query, userId }) => {
          const song = await prisma.song.findUnique({
            where: { id: params.id },
            select: { isPublic: true, uploadedBy: true },
          });
          if (!song || (!song.isPublic && song.uploadedBy !== userId)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          const cursorDate = query.cursor ? new Date(query.cursor) : null;
          const rows = await prisma.songComment.findMany({
            where: {
              songId: params.id,
              ...(cursorDate && !Number.isNaN(cursorDate.getTime())
                ? { createdAt: { lt: cursorDate } }
                : {}),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: query.limit + 1,
            select: {
              id: true,
              content: true,
              atSeconds: true,
              createdAt: true,
              userId: true,
              user: { select: userDisplaySelect },
            },
          });

          const hasMore = rows.length > query.limit;
          const page = hasMore ? rows.slice(0, query.limit) : rows;

          return Response.json({
            comments: page.map((row) => format(row, userId)),
            nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
          });
        },
      ),

      POST: defineHandler(
        {
          body: CommentBodyZ,
          rateLimit: { limit: 15, windowMs: 60_000, prefix: 'slice-comments', scope: 'user' },
        },
        async ({ params, body, userId }) => {
          const song = await prisma.song.findUnique({
            where: { id: params.id },
            // `duration` for L5: a timestamp past the end of the track is
            // somebody writing about something else, and the parser needs the
            // length to tell the difference.
            select: { isPublic: true, uploadedBy: true, duration: true },
          });
          if (!song || (!song.isPublic && song.uploadedBy !== userId)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          const comment = await prisma.songComment.create({
            data: {
              content: body.content,
              songId: params.id,
              userId,
              // L5 — parsed from the body rather than collected by a separate
              // field. osu! modding taught a generation of players to type
              // `1:42`, and a field nobody fills is worse than a convention
              // they already have.
              atSeconds: extractTimestamp(body.content, song.duration),
            },
            select: {
              id: true,
              content: true,
              atSeconds: true,
              createdAt: true,
              userId: true,
              user: { select: userDisplaySelect },
            },
          });
          return Response.json(format(comment, userId));
        },
      ),

      DELETE: defineHandler(
        {
          query: z.object({ commentId: z.string().min(1).max(64) }),
          rateLimit: 'write',
        },
        async ({ query, userId, isAdmin }) => {
          const comment = await prisma.songComment.findUnique({
            where: { id: query.commentId },
            select: { id: true, userId: true, song: { select: { uploadedBy: true } } },
          });
          if (!comment) return Response.json({ error: 'Comment not found' }, { status: 404 });

          // The author, the song's uploader (their track, their thread) or an
          // admin. Deleting comments was previously impossible for anyone.
          const canDelete =
            comment.userId === userId || comment.song.uploadedBy === userId || isAdmin;
          if (!canDelete) return Response.json({ error: 'Forbidden' }, { status: 403 });

          await prisma.songComment.delete({ where: { id: comment.id } });
          return Response.json({ success: true });
        },
      ),
    },
  },
});


function format(
  row: {
    id: string;
    content: string;
    atSeconds: number | null;
    createdAt: Date;
    userId: string;
    user: Parameters<typeof resolveUserDisplay>[0];
  },
  viewerId: string | null,
) {
  const display = resolveUserDisplay(row.user);
  return {
    id: row.id,
    content: row.content,
    /** L5 — seconds into the track, or null for a comment about the song. */
    atSeconds: row.atSeconds,
    createdAt: row.createdAt.toISOString(),
    isOwn: viewerId !== null && row.userId === viewerId,
    user: { name: display.name || 'Unknown', image: display.image ?? null },
  };
}
