/**
 * Contracts for /api/guides (redesign audit C1, batch 4). Client-safe: request
 * types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  guideCreateSchema,
  guidePublishBody,
  guideUpdateSchema,
} from '@/lib/games/reviews';

/** Creates a draft. */
export const createGuideApi =
  endpoint<{
    body: z.infer<
      typeof guideCreateSchema
    >;
    res: {
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/guides',
    },
  );

/** Author only; a changed body appends a revision. */
export const updateGuideApi =
  endpoint<{
    body: z.infer<
      typeof guideUpdateSchema
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/guides/$id',
    },
  );

export const deleteGuideApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/guides/$id',
    },
  );

export const publishGuideApi =
  endpoint<{
    body: z.infer<
      typeof guidePublishBody
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/guides/$id/publish',
    },
  );
