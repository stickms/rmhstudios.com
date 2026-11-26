/**
 * `/api/v1/me/notifications*` (s15-10): the list with each notice's key and params, the unread count, and mark-read.
 *
 * Nothing here is a second implementation of the inbox: the count is `getUnreadNotificationCount` (the site badge's
 * own number) and marking read is the inbox's `setRead` / `markAllRead`, so the badge counter and the live count stay
 * right. Every query carries the key owner's `userId`.
 */
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { getUnreadNotificationCount } from '@/lib/notifications.server';
import { markAllRead, setRead } from '@/lib/notifications/inbox.server';
import { apiAuthorSelect, serializeAuthor } from '@/lib/api/serializers.server';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  type ListQuery,
  type MarkReadBody,
} from '@/lib/api/v1/notifications-schema';

/** Headers for every response of these routes: an inbox is personal and must not sit in a shared cache. */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

const SELECT = {
  id: true,
  type: true,
  entityType: true,
  entityId: true,
  preview: true,
  previewKey: true,
  previewParams: true,
  link: true,
  read: true,
  createdAt: true,
  actor: { select: apiAuthorSelect },
} satisfies Prisma.NotificationSelect;

/**
 * A keyed notice's params are a JSON object of strings and numbers (the template's slots, which the member's own inbox
 * renders); a stored value that is not an object reads as `{}`, and an entry that is not a string or a finite number
 * is dropped, so the answer always has its documented type.
 */
function paramsOf(value: Prisma.JsonValue | null): Record<string, string | number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string | number> = {};
  for (const [name, v] of Object.entries(value)) {
    if (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) out[name] = v;
  }
  return out;
}

/** Your notifications, newest first, paged by (`createdAt`, `id`). A malformed cursor is `'invalid_cursor'`. */
export async function listNotificationsForKey(userId: string, q: ListQuery) {
  const cursor = q.cursor ? decodeNotificationCursor(q.cursor) : null;
  if (q.cursor && !cursor) return 'invalid_cursor' as const;
  const after: Prisma.NotificationWhereInput = !cursor
    ? {}
    : cursor.id === null
      ? { createdAt: { lt: cursor.createdAt } }
      : { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
  const rows = await prisma.notification.findMany({
    where: { userId, ...(q.unread === 'true' ? { read: false } : {}), ...after },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit,
    select: SELECT,
  });
  const data = rows.map((n) => ({
    id: n.id,
    type: n.type,
    entityType: n.entityType,
    entityId: n.entityId,
    preview: n.preview,
    key: n.previewKey,
    params: n.previewKey ? paramsOf(n.previewParams) : null,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt,
    actor: n.actor ? serializeAuthor(n.actor) : null,
  }));
  const last = rows[rows.length - 1];
  const nextCursor = last && rows.length === q.limit ? encodeNotificationCursor(last.createdAt, last.id) : null;
  return { data, nextCursor };
}

/** The very number behind the site's badge. */
export async function unreadCountForKey(userId: string): Promise<{ count: number }> {
  return { count: await getUnreadNotificationCount(userId) };
}

/**
 * Mark read: by ids (others' ids change nothing) or everything unread created at or before a time. Returns how many
 * rows actually changed, so a repeat answers 0.
 */
export async function markReadForKey(userId: string, body: MarkReadBody): Promise<{ updated: number }> {
  if ('ids' in body) {
    const { changed } = await setRead(userId, [...new Set(body.ids)], true);
    return { updated: changed };
  }
  return { updated: await markAllRead(userId, undefined, new Date(body.before)) };
}

/** Parse a query string or JSON body with zod; the first issue's message, never the input. */
export function readInput<T extends z.ZodType>(raw: unknown, schema: T) {
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? ({ ok: true, data: parsed.data as z.infer<T> } as const)
    : ({ ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid request' } as const);
}

export const queryOf = (request: Request): Record<string, string> =>
  Object.fromEntries(new URL(request.url).searchParams);
