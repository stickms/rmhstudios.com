/** Contracts for describing images after posting (sprint 05 #16). Client-safe: types come from the zod schemas by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { MissingAltPage } from '@/lib/feed/alt-text-edit';
import type {
  editPostAltsBodySchema,
  missingAltQuerySchema,
} from '@/lib/feed/alt-text-edit-schema';

/**
 * Replace the descriptions of the images on the caller's own post. 400 unless there is exactly one per image, 403 for
 * anyone but the author or a locked post, 404 for a missing or deleted one. Not a content edit: no "edited" marker and
 * no history row.
 */
export const editPostAltsApi =
  endpoint<{
    body: z.infer<
      typeof editPostAltsBodySchema
    >;
    res: {
      success: true;
      imageAlts: string[];
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/rmharks/$id/alt-text',
    },
  );

/** One page of the caller's own posts that still have an undescribed image, newest first. */
export const listMissingAltTextApi =
  endpoint<{
    query: z.infer<
      typeof missingAltQuerySchema
    >;
    res: MissingAltPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/settings/missing-alt-text',
    },
  );
