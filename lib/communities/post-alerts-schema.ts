/** Request body for the community post-alert setting (shared by the route and `post-alerts.contract.ts`). */
import { z } from 'zod';
import { POST_ALERT_LEVELS } from '@/lib/communities/post-alerts';

export const setPostAlertsBody =
  z.object(
    {
      level:
        z.enum(
          POST_ALERT_LEVELS,
        ),
    },
  );
