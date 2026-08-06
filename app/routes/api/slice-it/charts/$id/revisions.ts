/**
 * A chart's revision history.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §1.1 (`ChartRevision`) / §2.
 *
 * Read-only in phases 1–3: autosave appends here (see `charts/$id.ts` PATCH) and
 * this is how an author sees that it worked. Restoring a revision is a POST this
 * route deliberately does not have yet — see the TODO below.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import type { ChartRevisionDto } from '@/lib/slice-it/editor/api-schemas';

const RevisionQueryZ = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const Route = createFileRoute('/api/slice-it/charts/$id/revisions')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: RevisionQueryZ },
        async ({ userId, params, query }) => {
          const chart = await prisma.chart.findUnique({
            where: { id: params.id },
            select: { id: true, authorId: true },
          });
          if (!chart) return Response.json({ error: 'Not found' }, { status: 404 });
          if (chart.authorId !== userId) {
            return Response.json({ error: 'Not yours' }, { status: 403 });
          }

          /*
           * Raw, for one reason: `notes` is the whole chart, and a Prisma
           * `select` that includes it to call `.length` on it would ship twenty
           * copies of a 90 KB array to count them. `jsonb_array_length` does the
           * counting in the database and the payload stays a list of metadata.
           */
          const rows = await prisma.$queryRaw<
            { id: bigint; kind: string; label: string | null; createdAt: Date; noteCount: number }[]
          >`
            SELECT "id", "kind", "label", "createdAt",
                   jsonb_array_length("notes") AS "noteCount"
              FROM "ChartRevision"
             WHERE "chartId" = ${chart.id}::uuid
             ORDER BY "createdAt" DESC
             LIMIT ${query.limit}
          `;

          const revisions: ChartRevisionDto[] = rows.map((row) => ({
            // BigInt does not survive `JSON.stringify`; the client only ever
            // echoes this back as an opaque handle.
            id: row.id.toString(),
            kind: row.kind,
            label: row.label,
            noteCount: Number(row.noteCount ?? 0),
            createdAt: row.createdAt.toISOString(),
          }));

          return Response.json({ revisions });
        },
      ),

      // TODO(phase 7 — `docs/slice-it-chart-editor.md` §2): POST here restores a
      // revision onto the chart. It needs the publish/status machinery to decide
      // what restoring onto a PUBLISHED chart means for its leaderboard (§17.2),
      // which is the same open question `publish.ts` has to answer, so both land
      // together rather than this one landing half-answered.
    },
  },
});
