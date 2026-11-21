/** Contract for the admin lookup. Client-safe: types only, by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { LookupResponse } from '@/lib/admin/lookup';
import type { lookupQuerySchema } from '@/lib/admin/lookup-schema';

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
