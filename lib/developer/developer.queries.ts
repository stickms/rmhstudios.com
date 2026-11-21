/** The /developer page's reads (API keys, recipes, webhooks) as route-seeded queries (redesign audit B4). Signed out: nothing is seeded. */
import { listDeveloperKeysApi } from '@/lib/developer/keys.contract';
import { listRecipesApi } from '@/lib/developer/recipes.contract';
import { listWebhooksApi } from '@/lib/developer/webhooks.contract';
import { contractQuery } from '@/lib/route/route-query';

export const developerKeysQuery =
  () =>
    contractQuery(
      [
        'developer',
        'keys',
      ],
      listDeveloperKeysApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );

export const recipesQuery =
  () =>
    contractQuery(
      [
        'developer',
        'recipes',
      ],
      listRecipesApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );

/** The webhook console's endpoint list. Its deliveries live under `['developer', 'webhooks', id, …]`, so one invalidation of this prefix refreshes both. */
export const webhooksQuery =
  () =>
    contractQuery(
      [
        'developer',
        'webhooks',
      ],
      listWebhooksApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );
