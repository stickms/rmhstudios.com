/** Contracts for /api/communities/$slug/alerts (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PostAlertLevel } from '@/lib/communities/post-alerts';
import type { setPostAlertsBody } from '@/lib/communities/post-alerts-schema';

export interface PostAlertsDTO {
  level: PostAlertLevel;
  /** The community has more members than alerts are sent to; the control says so. */
  tooLarge: boolean;
}

/** The caller's post-alert setting for a community (members only). */
export const getPostAlertsApi =
  endpoint<{
    res: PostAlertsDTO;
  }>()(
    {
      method:
        'GET',
      path: '/api/communities/$slug/alerts',
    },
  );

/** Turn alerts for new posts in the community on or off for the caller. */
export const setPostAlertsApi =
  endpoint<{
    body: z.infer<
      typeof setPostAlertsBody
    >;
    res: PostAlertsDTO;
  }>()(
    {
      method:
        'PUT',
      path: '/api/communities/$slug/alerts',
    },
  );
