import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/** GET /api/rmhmusic/guess/$id — puzzle hints for play (answer hidden unless solved). */
export const Route = createFileRoute('/api/rmhmusic/guess/$id/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const puzzle = await prisma.musicGuessPuzzle.findUnique({
          where: { id: params.id },
          select: {
            id: true,
            title: true,
            artist: true,
            hints: true,
            plays: true,
            solves: true,
            authorId: true,
          },
        });
        if (!puzzle) return Response.json({ error: 'Not found' }, { status: 404 });

        let solved = false;
        if (session) {
          const attempt = await prisma.musicGuessAttempt.findUnique({
            where: { puzzleId_userId: { puzzleId: puzzle.id, userId: session.user.id } },
            select: { solved: true },
          });
          solved = !!attempt?.solved;
        }
        const isAuthor = session?.user?.id === puzzle.authorId;

        return Response.json({
          id: puzzle.id,
          artist: puzzle.artist,
          hints: puzzle.hints,
          plays: puzzle.plays,
          solves: puzzle.solves,
          solved,
          // Reveal the title only to solvers or the author.
          title: solved || isAuthor ? puzzle.title : null,
          signedIn: !!session,
        });
      }),
    },
  },
});
