import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { grantAchievement } from '@/lib/achievements/engine.server';

const schema = z.object({
  title: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  price: z.number().int().min(1).max(1_000_000),
  deliverable: z.string().max(2000).optional(),
});

const MAX_PRODUCTS = 30;

/** POST /api/storefront/products — create a product on your storefront. */
export const Route = createFileRoute('/api/storefront/products/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'storefront-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }

          const count = await prisma.storefrontProduct.count({ where: { creatorId: userId } });
          if (count >= MAX_PRODUCTS) {
            return Response.json({ error: `At most ${MAX_PRODUCTS} products` }, { status: 400 });
          }

          const product = await prisma.storefrontProduct.create({
            data: {
              creatorId: userId,
              title: parsed.data.title.trim(),
              description: parsed.data.description?.trim() || null,
              price: parsed.data.price,
              deliverable: parsed.data.deliverable?.trim() || null,
            },
          });

          await grantAchievement(userId, 'creator.first_product').catch(() => {});
          return Response.json(product, { status: 201 });
        } catch (error) {
          console.error('Storefront create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
