/** The /developer page's reads (API keys, recipes) as route-seeded queries (redesign audit B4). Signed out: nothing is seeded. */
import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { api } from '@/lib/contract/client';
import { listDeveloperKeysApi } from '@/lib/devplatform/keys.contract';
import { listRecipesApi } from '@/lib/devplatform/recipes.contract';
import { routeQueryFn } from '@/lib/route/route-query';
import { getRequestSession } from '@/lib/auth-session.server';
import { listDeveloperKeysView } from '@/lib/devplatform/keys-list.server';
import { listRecipes, recipeOptions } from '@/lib/devplatform/recipes.server';

// Same bodies as GET /api/developer/keys and GET /api/recipes.
const getKeysOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return listDeveloperKeysView(session.user.id);
});

const getRecipesOnServer = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) throw new Error('Unauthorized');
  return { recipes: await listRecipes(session.user.id), options: recipeOptions() };
});

export const developerKeysQuery = () =>
  queryOptions({
    queryKey: ['developer', 'keys'],
    queryFn: routeQueryFn(
      () => getKeysOnServer(),
      () => api(listDeveloperKeysApi),
    ),
    staleTime: 15_000,
  });

export const recipesQuery = () =>
  queryOptions({
    queryKey: ['developer', 'recipes'],
    queryFn: routeQueryFn(
      () => getRecipesOnServer(),
      () => api(listRecipesApi),
    ),
    staleTime: 15_000,
  });
