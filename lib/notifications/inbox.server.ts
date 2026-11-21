/**
 * Per-item inbox actions: mark read or unread, dismiss, mark everything read for a filter.
 *
 * Every `where` carries `userId`, so a foreign id matches nothing and changes nothing. The unread badge counter
 * (`adjustNotifUnread`) moves by the number of UNREAD rows that actually changed, never by the number requested, so
 * re-marking or a race cannot drift it.
 */
import { prisma } from '@/lib/prisma.server';
import { adjustNotifUnread } from '@/lib/notifications.server';
import {
  typesFor,
  type NotificationFilter,
} from '@/lib/notifications/filters';

export interface InboxChange {
  /** How many of the given ids belong to the caller. Zero means "not found". */
  found: number;
  /** How many rows changed state (read flipped, or row deleted). */
  changed: number;
}

/** Mark the caller's notifications read or unread. Rows already in that state are found but not changed. */
export async function setRead(
  userId: string,
  ids: string[],
  read: boolean,
): Promise<InboxChange> {
  if (
    ids.length ===
    0
  )
    return {
      found: 0,
      changed: 0,
    };
  const res =
    await prisma.notification.updateMany(
      {
        where:
          {
            userId,
            id: {
              in: ids,
            },
            read: !read,
          },
        data: {
          read,
        },
      },
    );
  const found =
    res.count ===
    ids.length
      ? res.count
      : await prisma.notification.count(
          {
            where:
              {
                userId,
                id: {
                  in: ids,
                },
              },
          },
        );
  if (
    res.count >
    0
  )
    await adjustNotifUnread(
      userId,
      read
        ? -res.count
        : res.count,
    );
  return {
    found,
    changed:
      res.count,
  };
}

/** Delete the caller's notifications. Unread rows are deleted first so the badge moves by exactly their number. */
export async function dismiss(
  userId: string,
  ids: string[],
): Promise<InboxChange> {
  if (
    ids.length ===
    0
  )
    return {
      found: 0,
      changed: 0,
    };
  const unread =
    await prisma.notification.deleteMany(
      {
        where:
          {
            userId,
            id: {
              in: ids,
            },
            read: false,
          },
      },
    );
  const rest =
    await prisma.notification.deleteMany(
      {
        where:
          {
            userId,
            id: {
              in: ids,
            },
          },
      },
    );
  if (
    unread.count >
    0
  )
    await adjustNotifUnread(
      userId,
      -unread.count,
    );
  const changed =
    unread.count +
    rest.count;
  return {
    found:
      changed,
    changed,
  };
}

/** Mark every unread notification read, limited to a filter's types when one is given. One `updateMany`. */
export async function markAllRead(
  userId: string,
  filter?: NotificationFilter,
): Promise<number> {
  const types =
    typesFor(
      filter,
    );
  const res =
    await prisma.notification.updateMany(
      {
        where:
          {
            userId,
            read: false,
            ...(types
              ? {
                  type: {
                    in: types,
                  },
                }
              : {}),
          },
        data: {
          read: true,
        },
      },
    );
  if (
    res.count >
    0
  )
    await adjustNotifUnread(
      userId,
      -res.count,
    );
  return res.count;
}
