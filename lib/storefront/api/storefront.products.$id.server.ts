import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteStorefrontProductApi,
  updateStorefrontProductApi,
} from '@/lib/storefront/storefront.contract';
import { deleteProduct, productCreator, updateProduct } from '@/lib/listings/product.server';
import { z } from 'zod';

const patchSchema = z.object({
  title: z.string().min(2).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  price: z.number().int().min(1).max(1_000_000).optional(),
  deliverable: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
});

/** PATCH / DELETE /api/storefront/products/$id — manage your product. */
export const route = apiRoute('/api/storefront/products/$id', {
  PATCH: implement(
    updateStorefrontProductApi,
    { body: patchSchema, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ params, session, body }) => {
      if ((await productCreator(params.id)) !== session.user.id) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }

      const d = body;

      const updated = await updateProduct(params.id, {
        ...(d.title !== undefined ? { title: d.title.trim() } : {}),
        ...(d.description !== undefined ? { description: d.description?.trim() || null } : {}),
        ...(d.price !== undefined ? { price: d.price } : {}),
        ...(d.deliverable !== undefined ? { deliverable: d.deliverable?.trim() || null } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      });
      return Response.json(updated);
    },
  ),

  DELETE: implement(deleteStorefrontProductApi, {}, async ({ params, session }) => {
    if ((await productCreator(params.id)) !== session.user.id) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    await deleteProduct(params.id);
    return Response.json({ success: true });
  }),
});
