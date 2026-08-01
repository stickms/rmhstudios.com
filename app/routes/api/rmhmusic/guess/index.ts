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
        { rateLimit: { limit: 15, windowMs: 60_000, prefix: 'music-guess-create' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success)
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );

          // Always accept the canonical title; merge any extra accepted answers.
          const accepted = new Set<string>([parsed.data.title.toLowerCase().trim()]);
          for (const a of parsed.data.acceptedAnswers ?? []) accepted.add(a.toLowerCase().trim());

          const puzzle = await prisma.musicGuessPuzzle.create({
            data: {
              authorId: session.user.id,
              title: parsed.data.title.trim(),
              artist: parsed.data.artist.trim(),
              hints: parsed.data.hints.map((h) => h.trim()),
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
