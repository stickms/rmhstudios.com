import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getDailyShop } from '@/lib/shop/daily-shop.server';
import { DailyPage } from '@/components/steam/DailyPage';
import { noindexHead } from '@/lib/seo';

const fetchDaily = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return getDailyShop(session?.user.id ?? null);
});

export const Route = createFileRoute('/games/daily')({
  // /store?tab=daily is the main-site copy of the same rotation.
  head: () => noindexHead('Daily deals'),
  loader: () => fetchDaily(),
  component: DailyRoute,
});

function DailyRoute() {
  return <DailyPage data={Route.useLoaderData()} />;
}
