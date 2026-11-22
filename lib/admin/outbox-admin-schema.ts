/** Zod for the outbox console endpoints (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import { EVENT_ID_PATTERN, OUTBOX_LIST_STATES, TOPIC_PATTERN, parseEventIds } from '@/lib/admin/outbox-admin';

export const topicSchema = z.string().regex(TOPIC_PATTERN);
export const eventIdSchema = z.string().regex(EVENT_ID_PATTERN);

export const listOutboxEventsQuerySchema = z.object({
  topic: topicSchema,
  state: z.enum(OUTBOX_LIST_STATES),
  /** The id of the last row of the previous page. */
  after: eventIdSchema.optional(),
});

/**
 * One action on either a list of event ids (`ids`, one comma-separated string, at most 100) or, for
 * requeue only, every dead event in a topic (`topic` with `allDead: true`, at most 500 at a time).
 */
export const outboxActionBodySchema = z
  .object({
    action: z.enum(['requeue', 'discard']),
    ids: z.string().max(2200).optional(),
    topic: topicSchema.optional(),
    allDead: z.boolean().optional(),
  })
  .refine(
    (b) => {
      const byIds = b.ids !== undefined;
      const byTopic = b.allDead === true;
      if (byIds === byTopic) return false;
      if (byIds) return b.topic === undefined && parseEventIds(b.ids as string) !== null;
      return b.action === 'requeue' && b.topic !== undefined;
    },
    {
      message: 'Invalid request.',
    },
  );
