import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { WishlistView } from '@/components/wishlist/WishlistView';
import { auth } from '@/lib/auth';
import { listWishlist } from '@/lib/wishlist/wishlist.server';
import type { WishlistItemView } from '@/lib/wishlist/types';

const fetchWishlist = createServerFn({ method: 'GET' }).handler(async (): Promise<WishlistItemView[]> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return [];
  return listWishlist(session.user.id);
});

export const Route = createFileRoute('/_site/wishlist')({
  head: () => ({
    meta: [{ title: 'Wishlist | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  loader: () => fetchWishlist(),
  component: WishlistPage,
});

function WishlistPage() {
  const items = Route.useLoaderData();
  return (
    <PageLayout title="Wishlist">
      <div className="px-4 pt-4 pb-12">
        <WishlistView initial={items} />
      </div>
    </PageLayout>
  );
}
