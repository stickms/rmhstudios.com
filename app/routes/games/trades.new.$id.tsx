import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import { getTradeInventories, TradeError } from '@/lib/cards/trades.server';
import { TradeComposer } from '@/components/steam/TradeComposer';
import { noindexHead } from '@/lib/seo';

const fetchComposer = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const session = await getRequestSession();
    if (!session) return { signedOut: true as const };
    const user = await prisma.user.findUnique({ where: { id }, select: userDisplaySelect });
    if (!user) throw notFound();
    try {
      const inventories = await getTradeInventories(session.user.id, id);
      const d = resolveUserDisplay(user as Parameters<typeof resolveUserDisplay>[0]);
      return {
        signedOut: false as const,
        partner: {
          userId: id,
          handle: (user as { handle?: string | null }).handle ?? null,
          name: d.name ?? 'Player',
          image: d.image ?? null,
        },
        inventories,
      };
    } catch (e) {
      // Strangers (and yourself) have no composer; there is nothing to show.
      if (e instanceof TradeError) throw notFound();
      throw e;
    }
  });

export const Route = createFileRoute('/games/trades/new/$id')({
  head: () => noindexHead('New trade offer'),
  loader: async ({ params }) => {
    const data = await fetchComposer({ data: params.id });
    if (data.signedOut) {
      throw redirect({ href: `/login?callbackURL=${encodeURIComponent(`/games/trades/new/${params.id}`)}` });
    }
    return data;
  },
  component: ComposerRoute,
});

function ComposerRoute() {
  const { partner, inventories } = Route.useLoaderData();
  return <TradeComposer partner={partner} inventories={inventories} />;
}
