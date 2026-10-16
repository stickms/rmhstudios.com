import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { plusUpdateSchema, pronunciationUrl } from '@/lib/profile/plus';
import { getPlusView, profileHasModules, updatePlus } from '@/lib/profile/plus.server';

/**
 * GET /api/profile/plus — the caller's own identity extras (pronouns, timezone,
 * /now, counter switch, pronunciation clip) for the settings editor.
 * PUT /api/profile/plus — update any subset of them (P2/P3/P4/P9). An empty
 * string clears a text field.
 */
async function ownView(userId: string) {
  const [view, clip, shown] = await Promise.all([
    getPlusView(userId),
    prisma.profilePlus.findUnique({
      where: { userId },
      select: { pronunciationKey: true, pronunciationMs: true },
    }),
    profileHasModules(userId, ['endorsements']),
  ]);
  return {
    ...view,
    endorsementsEnabled: shown.has('endorsements'),
    pronunciationUrl: pronunciationUrl(userId, clip?.pronunciationKey),
    pronunciationMs: clip?.pronunciationMs ?? null,
  };
}

export const Route = createFileRoute('/api/profile/plus')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await ownView(userId), { headers: { 'Cache-Control': 'private, no-store' } }),
      ),
      PUT: defineHandler(
        {
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'profile-plus' },
          body: plusUpdateSchema,
        },
        async ({ userId, body }) => {
          await updatePlus(userId, body);
          return Response.json(await ownView(userId));
        },
      ),
    },
  },
});
