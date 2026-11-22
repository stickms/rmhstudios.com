/**
 * The inbox's type filters: which notification types each filter shows.
 *
 * Pure and client-safe. The labels are not here: `lib/` returns ids and the
 * components translate them (`notifications-inbox` namespace). A later filter
 * (for example a followed-feed kind) is one more entry in this list, and the
 * select, the list query and mark-all-as-read all pick it up from here.
 */
import type { NotificationType } from '@prisma/client';

/** The most ids one inbox request may touch (a group's rows, a dismiss batch, the unread snapshot). */
export const MAX_NOTIFICATION_BATCH = 100;

export const NOTIFICATION_FILTERS = [
  {
    id: 'all',
    types: null,
  },
  {
    id: 'mentions',
    types: ['MENTION', 'REPLY', 'COMMENT'],
  },
  {
    id: 'follows',
    types: ['FOLLOW'],
  },
  {
    id: 'likes',
    types: ['LIKE', 'REPOST'],
  },
  {
    id: 'system',
    types: ['SYSTEM'],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  types: ReadonlyArray<NotificationType> | null;
}>;

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]['id'];

/** The filter ids as a zod-enum-ready tuple. */
export const NOTIFICATION_FILTER_IDS = NOTIFICATION_FILTERS.map((f) => f.id) as [
  NotificationFilter,
  ...NotificationFilter[],
];

export function isNotificationFilter(value: unknown): value is NotificationFilter {
  return NOTIFICATION_FILTERS.some((f) => f.id === value);
}

/** The types a filter shows, or `undefined` for "everything" (no type constraint). */
export function typesFor(filter: NotificationFilter | null | undefined): NotificationType[] | undefined {
  const entry = NOTIFICATION_FILTERS.find((f) => f.id === filter);
  return entry?.types ? [...entry.types] : undefined;
}
