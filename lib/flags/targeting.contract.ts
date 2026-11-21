/** Contracts for flag targeting, the check tool and the flag history (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  checkQuery,
  historyQuery,
  targetingEditBody,
} from './targeting-schema';
import type {
  FlagCheckDTO,
  FlagHistoryPage,
  FlagTargetingDTO,
} from './targeting';

/** The two lists of one flag, members resolved for display (admin only; 404 when the flag is gone). */
export const getFlagTargetingApi =
  endpoint<{
    res: FlagTargetingDTO;
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/flags/$key/targeting',
    },
  );

/** Add handles to, or remove member ids from, one list; a member joining one list leaves the other. */
export const editFlagTargetingApi =
  endpoint<{
    body: z.infer<
      typeof targetingEditBody
    >;
    res: FlagTargetingDTO;
  }>()(
    {
      method:
        'PUT',
      path: '/api/admin/flags/$key/targeting',
    },
  );

/** How the flag resolves for one member, and why. */
export const checkFlagApi =
  endpoint<{
    query: z.infer<
      typeof checkQuery
    >;
    res: FlagCheckDTO;
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/flags/$key/check',
    },
  );

/** The flag's audit entries, newest first, 20 a page. */
export const flagHistoryApi =
  endpoint<{
    query: z.infer<
      typeof historyQuery
    >;
    res: FlagHistoryPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/flags/$key/history',
    },
  );
