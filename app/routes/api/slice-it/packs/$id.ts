import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { PackUpdateZ, type PackSummary } from '@/lib/slice-it/packs';
import type { LibrarySong } from '@/lib/slice-it/library-filters';
import {
  ownedPack,
  packSelect,
  packSongIds,
  readPack,
  toPackSummary,
} from '@/lib/slice-it/packs.server';
import {
  libraryFieldsOf,
  songSelect,
  toSliceSong,
  viewerSongJoins,
} from '@/lib/slice-it/songs.server';

/**
 * L16 — read, edit and delete one pack.
 *
 * `GET` returns the pack and its members **in pack order**. The order is the
 * pack — a course is an ordering and an album is an ordering — so returning
 * the songs and leaving the client to sort them would be handing back the one
 * piece of information the model exists to store.
 *
 * `PATCH`/`DELETE` are curator-only, and a pack the caller does not curate is
 * a 404 rather than a 403: telling a stranger that a private pack id exists is
 * telling them something.
 */
const ParamsZ = z.object({ id: z.string().uuid() });

export interface PackDetailResponse {
  pack: PackSummary;
  songs: LibrarySong[];
}

export const Route = createFileRoute('/api/slice-it/packs/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const parsed = ParamsZ.safeParse(params);
        if (!parsed.success) return Response.json({ error: 'Not found.' }, { status: 404 });

        const pack = await readPack(parsed.data.id, userId);
        if (!pack) return Response.json({ error: 'Not found.' }, { status: 404 });

        const ids = await packSongIds(pack.id);
        const rows =
          ids.length > 0
            ? await prisma.song.findMany({
                // A pack can outlive a song's visibility: somebody adds a
                // public track and its uploader later makes it private. Those
                // rows drop out of the read rather than 404ing the pack.
                where: { id: { in: ids }, OR: [{ isPublic: true }, { uploadedBy: userId ?? '' }] },
                select: { ...songSelect, ...viewerSongJoins(userId) },
              })
            : [];
        const byId = new Map(rows.map((r) => [r.id, r]));

        const body: PackDetailResponse = {
          pack,
          // Re-threaded onto the position order the query above already
          // decided — a lookup, not a sort.
          songs: ids
            .map((id) => byId.get(id))
            .filter((r): r is (typeof rows)[number] => r != null)
            .map((row) => ({
              ...toSliceSong(row, userId),
              ...libraryFieldsOf(row),
              bestScore: null,
            })),
        };
        return Response.json(body);
      }),

      PATCH: defineHandler(
        { body: PackUpdateZ, rateLimit: 'write' },
        async ({ userId, params, body }) => {
          const parsed = ParamsZ.safeParse(params);
          if (!parsed.success) return Response.json({ error: 'Not found.' }, { status: 404 });

          const owned = await ownedPack(parsed.data.id, userId);
          if (!owned) return Response.json({ error: 'Not found.' }, { status: 404 });

          const row = await prisma.chartPack.update({
            where: { id: owned.id },
            data: {
              ...(body.title !== undefined ? { title: body.title } : {}),
              ...(body.description !== undefined ? { description: body.description } : {}),
              ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
            },
            select: packSelect,
          });
          return Response.json({ pack: toPackSummary(row, userId) } satisfies {
            pack: PackSummary;
          });
        },
      ),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const parsed = ParamsZ.safeParse(params);
        if (!parsed.success) return Response.json({ error: 'Not found.' }, { status: 404 });

        const owned = await ownedPack(parsed.data.id, userId);
        if (!owned) return Response.json({ error: 'Not found.' }, { status: 404 });

        // Items go with it — `onDelete: Cascade` on `ChartPackItem.packId`.
        // Songs do not: a pack is a view of the library, never an owner of it.
        await prisma.chartPack.delete({ where: { id: owned.id } });
        return Response.json({ success: true });
      }),
    },
  },
});
