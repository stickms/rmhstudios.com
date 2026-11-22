/** The member's account-wide receipt and typing switches as a query (Settings > Privacy). */
import { getReadReceiptsApi } from '@/lib/messages/read-receipts.contract';
import { contractQuery } from '@/lib/route/route-query';

export const readReceiptsQuery = () =>
  contractQuery(['settings', 'read-receipts'], getReadReceiptsApi, undefined, {
    staleTime: 30_000,
  });
