/**
 * /shop — legacy redirect.
 *
 * The cosmetics shop is the "Shop" tab of /store, alongside Membership and
 * Market. This route redirects so old links and the former nav entry land
 * there.
 *
 * It stayed live as a full page for a while after that merge, rendering the
 * same <ShopColumn/> off the same getShopData() loader as the tab — so one
 * catalog sat at two indexable URLs, and once every page gained a canonical
 * the two began asserting canonicity against each other. A redirect is the
 * only shape that cannot drift from the tab it duplicates.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/shop')({
  beforeLoad: () => {
    throw redirect({ to: '/store', search: { tab: 'shop' } });
  },
});
