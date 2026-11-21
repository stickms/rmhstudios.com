import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { getAdminOutboxEventApi } from '@/lib/admin/outbox.contract';
import { parseEventId } from '@/lib/admin/outbox-admin';
import { getOutboxEvent } from '@/lib/admin/outbox-admin.server';

/** GET /api/admin/outbox/events/$id — one event's payload (redacted, capped at 8 KB) and error. Admin only. */
export const route =
  apiRoute(
    '/api/admin/outbox/events/$id',
    {
      GET: implement(
        getAdminOutboxEventApi,
        {
          auth: 'admin',
          rateLimit:
            'read',
        },
        async ({
          params,
        }) => {
          const id =
            parseEventId(
              params.id,
            );
          if (
            id ===
            null
          )
            return apiError(
              'Event not found.',
              404,
            );
          const event =
            await getOutboxEvent(
              id,
            );
          return event
            ? {
                event,
              }
            : apiError(
                'Event not found.',
                404,
              );
        },
      ),
    },
  );
