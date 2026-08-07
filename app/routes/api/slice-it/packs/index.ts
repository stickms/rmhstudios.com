import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { PackCreateZ, PackListQueryZ, type PackSummary } from '@/lib/slice-it/packs';
import { addSongsToPack, listPacks, packSelect, toPackSummary } from '@/lib/slice-it/packs.server';

/**
 * L16 — list and create packs.
 *
 * A pack is an ordered, curated set of songs: the unit `S2` courses, `L2`
 * shelves and `S8` setlists are all specified in terms of, and which had a
 * model in the plan and no authoring surface anywhere.
 *
 * `POST` creates the pack **and its initial members in one transaction**. The
 * builder's "make a pack from this selection" path sends both, and a create
 * followed by a separate add is a titled empty pack sitting in somebody's list
 * whenever the second call fails.
 */
export const Route = createFileRoute('/api/slice-it/packs/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: PackListQueryZ, rateLimit: 'read' },
        async ({ userId, query }) => {
          // `scope=mine` from a signed-out caller is an empty list, not the
          // public browse: quietly widening a request for "my packs" into
          // "everybody's packs" would be a surprising thing for a UI to render.
          if (query.scope === 'mine' && !userId) {
            return Response.json({ packs: [], nextCursor: null });
          }
          return Response.json(await listPacks(query, userId));
        },
      ),

      POST: defineHandler({ body: PackCreateZ, rateLimit: 'write' }, async ({ userId, body }) => {
        const songIds = body.songIds ?? [];

        // Filter the seed list to songs that exist and the curator may
        // actually see. A pack may hold other people's charts — that is the
        // point of packs — but not their *private* ones, and an id that is
        // simply wrong should not become a dangling row.
        const visible =
          songIds.length > 0
            ? await prisma.song.findMany({
                where: {
                  id: { in: songIds },
                  OR: [{ isPublic: true }, { uploadedBy: userId }],
                },
                select: { id: true },
              })
            : [];
        const allowed = new Set(visible.map((s) => s.id));
        // Preserve the caller's order, drop what they may not add.
        const seed = songIds.filter((id) => allowed.has(id));

        const pack = await prisma.$transaction(async (tx) => {
          const created = await tx.chartPack.create({
            data: {
              curatorId: userId,
              title: body.title,
              description: body.description || null,
              kind: body.kind,
              isPublic: body.isPublic,
            },
            select: { id: true },
          });
          if (seed.length > 0) await addSongsToPack(tx, created.id, seed);
          return created;
        });

        const row = await prisma.chartPack.findUniqueOrThrow({
          where: { id: pack.id },
          select: packSelect,
        });
        return Response.json({ pack: toPackSummary(row, userId) } satisfies {
          pack: PackSummary;
        });
      }),
    },
  },
});
