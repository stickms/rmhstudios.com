import { z } from 'zod';

/** Body of POST /api/admin/library/quota-requests: decide one upload-quota appeal. */
export const adminQuotaDecisionSchema =
  z.object(
    {
      id: z.string(),
      approve:
        z.boolean(),
      grantedTotal:
        z
          .number()
          .optional(),
    },
  );

/** Body of POST /api/admin/library/reorder: LibraryDocument ids in their desired order. */
export const adminReorderBooksSchema =
  z.object(
    {
      ids: z.array(
        z.string(),
      ),
    },
  );

/**
 * Body of PATCH /api/admin/library/$id. Deliberately loose: the route reads each
 * known field only when it has the right type and answers 422 with a bespoke text
 * for a bad title or description.
 */
export const adminBookPatchSchema =
  z.record(
    z.string(),
    z.unknown(),
  );
