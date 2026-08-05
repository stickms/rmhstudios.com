import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/**
 * `/api/history/position` — cross-device read position for long-form content (B7).
 *
 * A `ReadPosition` is a fraction plus an ANCHOR. The fraction alone is wrong the
 * moment the same document is opened at a different width: 0.42 of a phone
 * column is not 0.42 of a desktop one, and a reader that seeks to it lands
 * several paragraphs off. The anchor is an element id the reader recognises, so
 * the fraction is only the fallback for documents that have none.
 *
 * Writes are **not** on a scroll handler. The client beacons once, on
 * `visibilitychange` — see `hooks/useReadPosition.ts` for why that is the only
 * cadence that works (a scroll-driven write is hundreds of round trips per
 * read, and the last one still loses the race with the page unloading).
 *
 * `historyPaused` is honoured here exactly as `lib/history/history.server.ts`
 * honours it for visit beats: a user who turned history off has turned this off
 * too, and the endpoint no-ops with a 200 rather than a 403 so the reader has
 * nothing to handle.
 */

/**
 * Mirrors `ReadPosition.kind` in the schema. `docs` is accepted for storage even
 * though the resume rail cannot link at it (the docs site is published
 * separately), because a reader that beacons is not the place to discover that.
 */
const READ_POSITION_KINDS = ['library', 'news', 'blog', 'docs'] as const;

const lookupSchema = z.object({
  kind: z.enum(READ_POSITION_KINDS),
  entityId: z.string().min(1).max(191),
});

const writeSchema = lookupSchema.extend({
  fraction: z.number().min(0).max(1),
  /** `@db.VarChar(120)` — a longer id is a bug in the caller, not a longer id. */
  anchorId: z.string().min(1).max(120).nullish(),
});

export const Route = createFileRoute('/api/history/position')({
  server: {
    handlers: {
      GET: defineHandler({ query: lookupSchema }, async ({ userId, query }) => {
        const row = await prisma.readPosition.findUnique({
          where: {
            userId_kind_entityId: { userId, kind: query.kind, entityId: query.entityId },
          },
          select: { fraction: true, anchorId: true, updatedAt: true },
        });
        return Response.json({
          position: row
            ? {
                fraction: row.fraction,
                anchorId: row.anchorId,
                updatedAt: row.updatedAt.toISOString(),
              }
            : null,
        });
      }),

      POST: defineHandler({ rateLimit: 'write', body: writeSchema }, async ({ userId, body }) => {
        const profile = await prisma.userProfile.findUnique({
          where: { userId },
          select: { historyPaused: true },
        });
        if (profile?.historyPaused) return Response.json({ ok: true, paused: true });

        const data = { fraction: body.fraction, anchorId: body.anchorId ?? null };
        await prisma.readPosition.upsert({
          where: { userId_kind_entityId: { userId, kind: body.kind, entityId: body.entityId } },
          create: { userId, kind: body.kind, entityId: body.entityId, ...data },
          update: data,
        });
        return Response.json({ ok: true });
      }),
    },
  },
});
