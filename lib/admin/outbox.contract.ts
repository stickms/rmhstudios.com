/** Contracts for the outbox console. Client-safe: types only, by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  OutboxEventDetail,
  OutboxEventRow,
  TopicSummary,
} from '@/lib/admin/outbox-admin';
import type {
  listOutboxEventsQuerySchema,
  outboxActionBodySchema,
} from '@/lib/admin/outbox-admin-schema';

export const getAdminOutboxApi =
  endpoint<{
    res: {
      topics: TopicSummary[];
      now: string;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/outbox',
    },
  );

export const listAdminOutboxEventsApi =
  endpoint<{
    query: z.infer<
      typeof listOutboxEventsQuerySchema
    >;
    res: {
      events: OutboxEventRow[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/outbox/events',
    },
  );

export const getAdminOutboxEventApi =
  endpoint<{
    res: {
      event: OutboxEventDetail;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/outbox/events/$id',
    },
  );

export const adminOutboxActionApi =
  endpoint<{
    body: z.infer<
      typeof outboxActionBodySchema
    >;
    res: {
      requested: number;
      affected: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/outbox/actions',
    },
  );
