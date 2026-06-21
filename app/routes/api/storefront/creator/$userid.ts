import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/**
 * GET /api/storefront/creator/$userid — a creator's storefront. Resolves by
 * handle or id. Deliverables are only included for the owner or buyers.
 */
export const Route = createFileRoute('/api/storefront/creator/$userid')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);

          const creator = await prisma.user.findFirst({
            where: { OR: [{ id: params.userid }, { handle: params.userid }] },
            select: userDisplaySelect,
          });
          if (!creator) return Response.json({ error: 'Not found' }, { status: 404 });

          const isOwner = session?.user?.id === creator.id;
          const products = await prisma.storefrontProduct.findMany({
            where: { creatorId: creator.id, ...(isOwner ? {} : { active: true }) },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              description: true,
              price: true,
              active: true,
              salesCount: true,
              deliverable: true,
              createdAt: true,
            },
          });

          // Which products the viewer already owns.
          let ownedIds = new Set<string>();
          if (session && !isOwner) {
            const purchases = await prisma.storefrontPurchase.findMany({
              where: { buyerId: session.user.id, productId: { in: products.map((p) => p.id) } },
              select: { productId: true },
            });
            ownedIds = new Set(purchases.map((p) => p.productId));
          }

          return Response.json({
            creator: resolveUser(creator),
            isOwner,
            signedIn: !!session,
            products: products.map((p) => {
              const owned = ownedIds.has(p.id);
              const canSeeDeliverable = isOwner || owned;
              return {
                id: p.id,
                title: p.title,
                description: p.description,
                price: p.price,
                active: p.active,
                salesCount: p.salesCount,
                createdAt: p.createdAt,
                owned,
                deliverable: canSeeDeliverable ? p.deliverable : null,
              };
            }),
          });
        } catch (error) {
          console.error('Storefront list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
