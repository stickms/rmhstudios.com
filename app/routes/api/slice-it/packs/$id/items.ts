import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { PackItemsZ } from '@/lib/slice-it/packs';
import { addSongsToPack, ownedPack, packSongIds, reorderPack } from '@/lib/slice-it/packs.server';

/**
 * L16 — add, remove and reorder a pack's members.
 *
 * One `PATCH` rather than three routes, because the builder's save is one
 * gesture: a curator drags a track in, drags another out and reorders the rest,
 * then presses save. Three requests for that is three chances to land two of
 * them — a pack with the addition and not the reorder is a pack in a state the
 * curator never asked for and cannot see they are in.
 *
 * So the whole patch is one transaction, applied add → remove → reorder. That
 * order matters: `order` may legitimately name a song that `add` is bringing in
 * this same request, and a reorder that ran first would ignore it.
 */
const ParamsZ = z.object({ id: z.string().uuid() });

export const Route = createFileRoute('/api/slice-it/packs/$id/items')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { body: PackItemsZ, rateLimit: 'write' },
        async ({ userId, params, body }) => {
          const parsed = ParamsZ.safeParse(params);
          if (!parsed.success) return Response.json({ error: 'Not found.' }, { status: 404 });

          const owned = await ownedPack(parsed.data.id, userId);
          if (!owned) return Response.json({ error: 'Not found.' }, { status: 404 });

          // An album pack's membership is the upload that created it. Letting
          // it be edited by hand would make "album" a claim about the pack
          // rather than a fact about where it came from — rename it to a plain
          // pack first if that is what you want.
          if (owned.kind === 'album' && (body.add?.length || body.remove?.length)) {
            return Response.json(
              { error: 'An album pack’s tracks come from its upload and cannot be edited.' },
              { status: 409 },
            );
          }

          const requested = body.add ?? [];
          const visible =
            requested.length > 0
              ? await prisma.song.findMany({
                  where: {
                    id: { in: requested },
                    OR: [{ isPublic: true }, { uploadedBy: userId }],
                  },
                  select: { id: true },
                })
              : [];
          const allowed = new Set(visible.map((s) => s.id));
          const toAdd = requested.filter((id) => allowed.has(id));

          const added = await prisma.$transaction(async (tx) => {
            const count = await addSongsToPack(tx, owned.id, toAdd);
            if (body.remove?.length) {
              await tx.chartPackItem.deleteMany({
                where: { packId: owned.id, songId: { in: body.remove } },
              });
            }
            if (body.order?.length) await reorderPack(tx, owned.id, body.order);
            // Only touched on a real change, so the "my packs" list's
            // most-recently-edited order means what it says.
            await tx.chartPack.update({ where: { id: owned.id }, data: { updatedAt: new Date() } });
            return count;
          });

          return Response.json({
            success: true,
            added,
            // The resulting order, so the builder can reconcile without a
            // second GET — and so a client whose copy was stale learns it here.
            songIds: await packSongIds(owned.id),
            // Non-zero when the caller asked to add songs they may not see.
            skipped: requested.length - toAdd.length,
          });
        },
      ),
    },
  },
});
