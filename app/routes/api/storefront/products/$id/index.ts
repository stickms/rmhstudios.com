import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';

const patchSchema = z.object({
  title: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  price: z.number().int().min(1).max(1_000_000).optional(),
  deliverable: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

/** PATCH / DELETE /api/storefront/products/$id — manage your product. */
export const Route = createFileRoute('/api/storefront/products/$id/')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { body: patchSchema, allowEmptyBody: true, verboseValidationErrors: true },
        async ({ params, session, body }) => {
          const existing = await prisma.storefrontProduct.findUnique({
            where: { id: params.id },
            select: { creatorId: true },
          });
          if (!existing || existing.creatorId !== session.user.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          const d = body;

          const updated = await prisma.storefrontProduct.update({
            where: { id: params.id },
            data: {
              ...(d.title !== undefined ? { title: d.title.trim() } : {}),
              ...(d.description !== undefined
                ? { description: d.description?.trim() || null }
                : {}),
              ...(d.price !== undefined ? { price: d.price } : {}),
              ...(d.deliverable !== undefined
                ? { deliverable: d.deliverable?.trim() || null }
                : {}),
              ...(d.active !== undefined ? { active: d.active } : {}),
            },
          });
          return Response.json(updated);
        },
      ),

      DELETE: defineHandler({}, async ({ params, session }) => {
        const existing = await prisma.storefrontProduct.findUnique({
          where: { id: params.id },
          select: { creatorId: true },
        });
        if (!existing || existing.creatorId !== session.user.id) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }

        await prisma.storefrontProduct.delete({ where: { id: params.id } });
        return Response.json({ success: true });
      }),
    },
  },
});
