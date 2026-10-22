import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { patchRecipeSchema } from '@/lib/devplatform/recipes-schema';
import { deleteRecipe, setRecipeEnabled } from '@/lib/devplatform/recipes.server';

/** PATCH /api/recipes/:id pauses/resumes a recipe; DELETE removes it. */
export const Route = createFileRoute('/api/recipes/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { rateLimit: 'write', body: patchRecipeSchema },
        async ({ userId, params, body }) => {
          const ok = await setRecipeEnabled(userId, params.id, body.enabled);
          return ok
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 });
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await deleteRecipe(userId, params.id);
        return ok
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }),
    },
  },
});
