import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

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
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const puzzles = await prisma.musicGuessPuzzle.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, artist: true, plays: true, solves: true, createdAt: true, author: { select: userDisplaySelect } },
        });

        let solvedIds = new Set<string>();
        if (session) {
          const attempts = await prisma.musicGuessAttempt.findMany({
            where: { userId: session.user.id, puzzleId: { in: puzzles.map((p) => p.id) }, solved: true },
            select: { puzzleId: true },
          });
          solvedIds = new Set(attempts.map((a) => a.puzzleId));
        }

        return Response.json({
          puzzles: puzzles.map((p) => ({
            id: p.id, artist: p.artist, plays: p.plays, solves: p.solves, createdAt: p.createdAt,
            author: resolveUser(p.author), solved: solvedIds.has(p.id),
          })),
          signedIn: !!session,
        });
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'music-guess-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

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
        } catch (error) {
          console.error('Music puzzle create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
