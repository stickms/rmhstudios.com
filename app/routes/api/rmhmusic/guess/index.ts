import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { getMusicGuessList } from '@/lib/music-guess.server';

const createSchema = z.object({
  title: z.string().min(1).max(160),
  artist: z.string().min(1).max(160),
  hints: z.array(z.string().min(1).max(200)).min(1).max(6),
  acceptedAnswers: z.array(z.string().min(1).max(160)).max(10).optional(),
});

/**
 * GET  /api/rmhmusic/guess — puzzle list (no answers) + the viewer's solves.
 * POST /api/rmhmusic/guess — create a puzzle.
 */
export const Route = createFileRoute('/api/rmhmusic/guess/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        return Response.json(await getMusicGuessList(session?.user.id ?? null));
      }),

      POST: defineHandler(
        {
          rateLimit: { limit: 15, windowMs: 60_000, prefix: 'music-guess-create' },
          body: createSchema,
          allowEmptyBody: true,
          verboseValidationErrors: true,
        },
        async ({ session, body }) => {
          const accepted = new Set<string>([body.title.toLowerCase().trim()]);
          for (const a of body.acceptedAnswers ?? []) accepted.add(a.toLowerCase().trim());

          const puzzle = await prisma.musicGuessPuzzle.create({
            data: {
              authorId: session.user.id,
              title: body.title.trim(),
              artist: body.artist.trim(),
              hints: body.hints.map((h) => h.trim()),
              acceptedAnswers: [...accepted],
            },
            select: { id: true },
          });
          return Response.json({ success: true, id: puzzle.id }, { status: 201 });
        },
      ),
    },
  },
});
