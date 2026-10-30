import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getInventory } from '@/lib/cards/inventory.server';
import { InventoryPage } from '@/components/steam/InventoryPage';
import { noindexHead } from '@/lib/seo';

const fetchInventory = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) return null;
  return getInventory(session.user.id);
});

export const Route = createFileRoute('/games/inventory')({
  head: () => noindexHead('Inventory'),
  // An inventory is one person's own; signed out, send them to sign in and back.
  loader: async () => {
    const data = await fetchInventory();
    if (!data) throw redirect({ href: '/login?callbackURL=%2Fgames%2Finventory' });
    return data;
  },
  component: InventoryRoute,
});

function InventoryRoute() {
  return <InventoryPage data={Route.useLoaderData()} />;
}
