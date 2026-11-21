/** Contracts for the inbox's per-item endpoints. Client-safe: types only from the zod schemas. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { dismissBody, setReadBody } from '@/lib/notifications/inbox-schema';

/** Mark one notification read or unread. 404 when it is not the caller's. */
export const setNotificationReadApi = endpoint<{
  body: z.infer<typeof setReadBody>;
  res: {
    success: true;
    changed: number;
  };
}>()({
  method: 'PATCH',
  path: '/api/notifications/$id',
});

/** Delete one notification. 404 when it is not the caller's. */
export const deleteNotificationApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/notifications/$id',
});

/** Delete several notifications at once (a group's rows), at most 100. */
export const dismissNotificationsApi = endpoint<{
  body: z.infer<typeof dismissBody>;
  res: {
    success: true;
    dismissed: number;
  };
}>()({
  method: 'POST',
  path: '/api/notifications/dismiss',
});
