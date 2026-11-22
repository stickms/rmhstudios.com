/** Contract for the admin lookup. Client-safe: types only, by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  LookupBatchResponse,
  LookupResponse,
} from '@/lib/admin/lookup';
import type {
  lookupBatchSchema,
  lookupQuerySchema,
} from '@/lib/admin/lookup-schema';

/** @deprecated The page sends every lookup by POST (`adminLookupBatchApi`); kept one release for open tabs. */
export const adminLookupApi =
  endpoint<{
    query: z.infer<
      typeof lookupQuerySchema
    >;
    res: LookupResponse;
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/lookup',
    },
  );

/** POST /api/admin/lookup: 1 to 50 items, one group per item in order. No e-mail address ever rides in the URL. */
export const adminLookupBatchApi =
  endpoint<{
    body: z.infer<
      typeof lookupBatchSchema
    >;
    res: LookupBatchResponse;
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/lookup',
    },
  );
