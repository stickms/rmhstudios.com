/**
 * Contracts for /api/messages/scheduled/** (s03-12). Client-safe: request types
 * come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ScheduledMessageRow, SentMessage } from '@/lib/messages/scheduled';
import type {
  createScheduledMessageBody,
  listScheduledMessagesQuery,
  patchScheduledMessageBody,
} from '@/lib/messages/scheduled-schema';

/** The caller's scheduled messages: one conversation's with `chatId`, otherwise all of them. */
export const listScheduledMessagesApi = endpoint<{
  query: z.infer<typeof listScheduledMessagesQuery>;
  res: {
    messages: ScheduledMessageRow[];
  };
}>()({
  method: 'GET',
  path: '/api/messages/scheduled',
});

/** 201: the saved row. 409 once the member holds 20 pending messages. */
export const createScheduledMessageApi = endpoint<{
  body: z.infer<typeof createScheduledMessageBody>;
  res: {
    message: ScheduledMessageRow;
  };
}>()({
  method: 'POST',
  path: '/api/messages/scheduled',
});

/** Change the text or the time of a pending message. */
export const updateScheduledMessageApi = endpoint<{
  body: z.infer<typeof patchScheduledMessageBody>;
  res: {
    message: ScheduledMessageRow;
  };
}>()({
  method: 'PATCH',
  path: '/api/messages/scheduled/$id',
});

/** Cancel a pending message, or dismiss a failed one. */
export const cancelScheduledMessageApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/messages/scheduled/$id',
});

/** Deliver a pending message now through the normal path and answer the message it created; 409 with the reason if a check no longer passes. */
export const sendScheduledMessageNowApi = endpoint<{
  res: {
    success: true;
    message: SentMessage;
  };
}>()({
  method: 'POST',
  path: '/api/messages/scheduled/$id/send-now',
});
