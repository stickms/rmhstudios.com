import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createRecipeApi, listRecipesApi } from '@/lib/devplatform/recipes.contract';
import { createRecipeSchema } from '@/lib/devplatform/recipes-schema';
import { createRecipe, listRecipes, recipeOptions } from '@/lib/devplatform/recipes.server';

/**
 * GET  /api/recipes — the caller's recipes (webhook URLs are never returned).
 * POST /api/recipes — create a "when X then Y" recipe (max 10 per member).
 */
export const route = apiRoute('/api/recipes', {
  GET: implement(listRecipesApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(
      { recipes: await listRecipes(userId), options: recipeOptions() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ),
  ),
  POST: implement(
    createRecipeApi,
    { rateLimit: 'write', body: createRecipeSchema },
    async ({ userId, body }) => {
      const result = await createRecipe(userId, body);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ id: result.id }, { status: 201 });
    },
  ),
});
