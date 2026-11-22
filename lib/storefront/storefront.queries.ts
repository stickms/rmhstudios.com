/**
 * React Query options for a creator's storefront (client-safe). The profile header's storefront strip reads it; the
 * storefront page has its own loader.
 */

import { contractQuery } from '@/lib/route/route-query';
import { getStorefrontApi } from '@/lib/storefront/storefront.contract';

export const storefrontQuery = (userid: string) =>
  contractQuery(
    ['storefront', 'creator', userid],
    getStorefrontApi,
    {
      params: {
        userid,
      },
      retries: 0,
    },
    {
      staleTime: 60_000,
      retry: false,
    },
  );
