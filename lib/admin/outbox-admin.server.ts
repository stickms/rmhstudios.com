/**
 * Server side of the outbox console (`/admin/outbox`): a per-topic summary, a topic's dead or pending
 * events, one event's payload, and requeue / discard. Payloads carry member ids and webhook bodies:
 * they go to admins only, are redacted and capped, and nothing here logs them.
 *
 * Requeue and discard are conditional on the row still being dead and undelivered, so an event the
 * drain delivered (or one that was never dead) in the meantime is untouched; each runs in one
 * transaction with its audit row.
 */
import { prisma } from '@/lib/prisma.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { toJsonField } from '@/lib/admin/jobs';
import {
  MAX_TOPIC_EVENTS,
  OUTBOX_PAGE_SIZE,
  rowError,
  sortTopics,
  type OutboxAction,
  type OutboxEventDetail,
  type OutboxEventRow,
  type OutboxListState,
  type TopicSummary,
} from '@/lib/admin/outbox-admin';

const DAY_MS =
  24 *
  60 *
  60 *
  1000;

/** The undelivered, not-dead rows: pending, whether due or scheduled. */
const PENDING =
  {
    deliveredAt:
      null,
    deadAt:
      null,
  } as const;

const iso =
  (
    d:
      | Date
      | null
      | undefined,
  ):
    | string
    | null =>
    d
      ? d.toISOString()
      : null;

/**
 * One row per topic that has anything pending, dead or recently delivered. Four grouped counts over
 * the existing indexes (`[deliveredAt, deadAt, nextAttempt]` serves the first three and the
 * delivered-in-24h range; `[topic, createdAt]` serves the grouping), run together.
 */
export async function summarizeOutbox(
  now = new Date(),
): Promise<
  TopicSummary[]
> {
  const [
    pending,
    due,
    dead,
    delivered,
  ] =
    await Promise.all(
      [
        prisma.outboxEvent.groupBy(
          {
            by: [
              'topic',
            ],
            where:
              PENDING,
            _count:
              {
                _all: true,
              },
            _min: {
              createdAt: true,
            },
          },
        ),
        prisma.outboxEvent.groupBy(
          {
            by: [
              'topic',
            ],
            where:
              {
                ...PENDING,
                nextAttempt:
                  {
                    lte: now,
                  },
              },
            _count:
              {
                _all: true,
              },
          },
        ),
        prisma.outboxEvent.groupBy(
          {
            by: [
              'topic',
            ],
            where:
              {
                deliveredAt:
                  null,
                deadAt:
                  {
                    not: null,
                  },
              },
            _count:
              {
                _all: true,
              },
          },
        ),
        prisma.outboxEvent.groupBy(
          {
            by: [
              'topic',
            ],
            where:
              {
                deliveredAt:
                  {
                    gte: new Date(
                      now.getTime() -
                        DAY_MS,
                    ),
                  },
              },
            _count:
              {
                _all: true,
              },
          },
        ),
      ],
    );
  const byTopic =
    new Map<
      string,
      TopicSummary
    >();
  const row =
    (
      topic: string,
    ): TopicSummary => {
      let r =
        byTopic.get(
          topic,
        );
      if (
        !r
      ) {
        r =
          {
            topic,
            pendingDue: 0,
            scheduled: 0,
            dead: 0,
            delivered24h: 0,
            oldestPendingAt:
              null,
          };
        byTopic.set(
          topic,
          r,
        );
      }
      return r;
    };
  for (const g of pending) {
    const r =
      row(
        g.topic,
      );
    r.scheduled =
      g._count._all;
    r.oldestPendingAt =
      iso(
        g
          ._min
          .createdAt,
      );
  }
  for (const g of due) {
    const r =
      row(
        g.topic,
      );
    r.pendingDue =
      g._count._all;
    r.scheduled =
      Math.max(
        0,
        r.scheduled -
          g
            ._count
            ._all,
      );
  }
  for (const g of dead)
    row(
      g.topic,
    ).dead =
      g._count._all;
  for (const g of delivered)
    row(
      g.topic,
    ).delivered24h =
      g._count._all;
  return sortTopics(
    [
      ...byTopic.values(),
    ],
  );
}

/** One page of a topic's dead or pending events, newest first, keyset on `id`. */
export async function listOutboxEvents(
  topic: string,
  state: OutboxListState,
  after:
    | bigint
    | undefined,
): Promise<{
  events: OutboxEventRow[];
  nextCursor:
    | string
    | null;
}> {
  const rows =
    await prisma.outboxEvent.findMany(
      {
        where:
          {
            topic,
            deliveredAt:
              null,
            deadAt:
              state ===
              'dead'
                ? {
                    not: null,
                  }
                : null,
            ...(after ===
            undefined
              ? {}
              : {
                  id: {
                    lt: after,
                  },
                }),
          },
        orderBy:
          {
            id: 'desc',
          },
        take:
          OUTBOX_PAGE_SIZE +
          1,
        select:
          {
            id: true,
            createdAt: true,
            attempts: true,
            nextAttempt: true,
            deadAt: true,
            lastError: true,
          },
      },
    );
  const page =
    rows.slice(
      0,
      OUTBOX_PAGE_SIZE,
    );
  return {
    events:
      page.map(
        (
          r,
        ) => ({
          id: r.id.toString(),
          createdAt:
            r.createdAt.toISOString(),
          attempts:
            r.attempts,
          nextAttempt:
            r.nextAttempt.toISOString(),
          deadAt:
            iso(
              r.deadAt,
            ),
          error:
            rowError(
              r.lastError,
            ),
        }),
      ),
    nextCursor:
      rows.length >
      OUTBOX_PAGE_SIZE
        ? (page[
            page.length -
              1
          ]?.id.toString() ??
          null)
        : null,
  };
}

/** One event with its payload (redacted, capped at 8 KB) and its whole last error. */
export async function getOutboxEvent(
  id: bigint,
): Promise<OutboxEventDetail | null> {
  const r =
    await prisma.outboxEvent.findUnique(
      {
        where:
          {
            id,
          },
      },
    );
  if (
    !r
  )
    return null;
  return {
    id: r.id.toString(),
    topic:
      r.topic,
    createdAt:
      r.createdAt.toISOString(),
    attempts:
      r.attempts,
    nextAttempt:
      r.nextAttempt.toISOString(),
    deadAt:
      iso(
        r.deadAt,
      ),
    deliveredAt:
      iso(
        r.deliveredAt,
      ),
    error:
      rowError(
        r.lastError,
      ),
    lastError:
      r.lastError,
    payload:
      toJsonField(
        r.payload,
      ) ?? {
        text: 'null',
        truncated: false,
      },
  };
}

export type OutboxTarget =
  | {
      ids: bigint[];
    }
  | {
      topic: string;
      allDead: true;
    };

/**
 * Requeue or discard dead events and audit it, in one transaction. A requeue clears `deadAt`, resets
 * `attempts` and makes the event due now; `lastError` stays until the next attempt overwrites it. A
 * discard deletes. Both only touch rows that are still dead and undelivered; `affected` is how many
 * were. "All dead in a topic" first picks at most 500 ids (oldest first), then acts on those ids.
 */
export async function runOutboxAction(
  adminId: string,
  action: OutboxAction,
  target: OutboxTarget,
  now = new Date(),
): Promise<{
  requested: number;
  affected: number;
}> {
  return prisma.$transaction(
    async (
      tx,
    ) => {
      let ids: bigint[];
      if (
        'ids' in
        target
      )
        ids =
          target.ids;
      else {
        const picked =
          await tx.outboxEvent.findMany(
            {
              where:
                {
                  topic:
                    target.topic,
                  deliveredAt:
                    null,
                  deadAt:
                    {
                      not: null,
                    },
                },
              orderBy:
                {
                  id: 'asc',
                },
              take: MAX_TOPIC_EVENTS,
              select:
                {
                  id: true,
                },
            },
          );
        ids =
          (
            Array.isArray(
              picked,
            )
              ? picked
              : []
          ).map(
            (
              p,
            ) =>
              p.id,
          );
      }
      const where =
        {
          id: {
            in: ids,
          },
          deadAt:
            {
              not: null,
            },
          deliveredAt:
            null,
        };
      const affected =
        ids.length ===
        0
          ? 0
          : action ===
              'requeue'
            ? (
                await tx.outboxEvent.updateMany(
                  {
                    where,
                    data: {
                      deadAt:
                        null,
                      attempts: 0,
                      nextAttempt:
                        now,
                    },
                  },
                )
              )
                .count
            : (
                await tx.outboxEvent.deleteMany(
                  {
                    where,
                  },
                )
              )
                .count;
      const first =
        ids[0]?.toString() ??
        '';
      // The audit target column holds 64 characters: the topic or one id, or the first id and how many more.
      const targetId =
        'topic' in
        target
          ? `topic:${target.topic}`.slice(
              0,
              64,
            )
          : ids.length ===
              1
            ? first
            : `${first}+${ids.length - 1}`;
      await recordAdminActionIn(
        tx,
        adminId,
        `outbox.${action}`,
        {
          targetType:
            'outbox_event',
          targetId,
          detail:
            'topic' in
            target
              ? `topic=${target.topic} affected=${affected}/${ids.length}`
              : `affected=${affected}/${ids.length} ids=${ids.join(',')}`,
        },
      );
      return {
        requested:
          ids.length,
        affected,
      };
    },
  );
}
