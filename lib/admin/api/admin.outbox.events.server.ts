import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminOutboxEventsApi } from '@/lib/admin/outbox.contract';
import { listOutboxEventsQuerySchema } from '@/lib/admin/outbox-admin-schema';
import { parseEventId } from '@/lib/admin/outbox-admin';
import { listOutboxEvents } from '@/lib/admin/outbox-admin.server';

/** GET /api/admin/outbox/events?topic=&state=dead|pending&after= — one page of a topic's events, newest first. Admin only. */
export const route =
  apiRoute(
    '/api/admin/outbox/events',
    {
      GET: implement(
        listAdminOutboxEventsApi,
        {
          auth: 'admin',
          rateLimit:
            'read',
          query:
            listOutboxEventsQuerySchema,
        },
        async ({
          query,
        }) => {
          const after =
            query.after ===
            undefined
              ? undefined
              : (parseEventId(
                  query.after,
                ) ??
                undefined);
          return listOutboxEvents(
            query.topic,
            query.state,
            after,
          );
        },
      ),
    },
  );
