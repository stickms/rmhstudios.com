import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { statusUpdateSchema, statusExpiresAt, resolveStatus } from '@/lib/profile/status';

/**
 * PUT    /api/profile/status — set the caller's custom status (full replace).
 * DELETE /api/profile/status — clear it.
 *
 * Body (PUT): { emoji?, text?, expiresIn?: '30m'|'1h'|'today'|null, auto? }.
 * An empty emoji + text clears the status. Expiry is computed server-side from
 * `expiresIn` and enforced at read time (see lib/profile/status.ts).
 */
export const Route = createFileRoute('/api/profile/status')({
  server: {
    handlers: {
      PUT: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'profile-status' },
          body: statusUpdateSchema,
        },
        async ({ session, body }) => {
          const emoji = body.emoji?.trim() || null;
          const text = body.text?.trim() || null;
          const auto = body.auto ?? false;
          const cleared = !emoji && !text;
          const statusExpires = cleared ? null : statusExpiresAt(body.expiresIn ?? null);

          const fields = {
            statusEmoji: emoji,
            statusText: text,
            statusExpires,
            statusAuto: auto,
          };
          await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...fields },
            update: fields,
          });

          return Response.json({
            status: resolveStatus({ statusEmoji: emoji, statusText: text, statusExpires }),
            auto,
          });
        },
      ),

      DELETE: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'profile-status' } },
        async ({ session }) => {
          await prisma.userProfile.updateMany({
            where: { userId: session.user.id },
            data: {
              statusEmoji: null,
              statusText: null,
              statusExpires: null,
              statusAuto: false,
            },
          });
          return Response.json({ status: null });
        },
      ),
    },
  },
});
