/**
 * The member's reading subscriptions as one shared query: the follow buttons on the Logs, News and story pages and
 * the settings list all read (and update) the same cache entry. Client-safe.
 */
import { listReadingSubscriptionsApi } from '@/lib/reading/subscriptions.contract';
import { contractQuery } from '@/lib/route/route-query';

export const readingSubscriptionsQuery = (enabled = true) =>
  contractQuery(['reading', 'subscriptions'], listReadingSubscriptionsApi, undefined, {
    staleTime: 30_000,
    enabled,
  });
