/**
 * Contracts for /api/recipes (redesign audit C1, batch 4). Client-safe: request
 * types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { RecipeView } from '@/lib/devplatform/recipes';
import type { createRecipeSchema, patchRecipeSchema } from '@/lib/devplatform/recipes-schema';

export interface RecipeOptions {
  games: { id: string; title: string }[];
  items: { id: string; name: string }[];
}

export const listRecipesApi = endpoint<{
  res: { recipes: RecipeView[]; options: RecipeOptions };
}>()({ method: 'GET', path: '/api/recipes' });

/** 201. */
export const createRecipeApi = endpoint<{
  body: z.infer<typeof createRecipeSchema>;
  res: { id: string };
}>()({ method: 'POST', path: '/api/recipes' });

export const setRecipeEnabledApi = endpoint<{
  body: z.infer<typeof patchRecipeSchema>;
  res: { ok: true };
}>()({ method: 'PATCH', path: '/api/recipes/$id' });

export const deleteRecipeApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/recipes/$id',
});
