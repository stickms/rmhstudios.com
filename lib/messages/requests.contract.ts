/**
 * Contracts for the message-request routes (sprint 04 #16). Client-safe.
 *
 *  - GET  lists the viewer's pending requests (the Requests folder).
 *  - POST accepts or declines one; only its recipient can.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { decideRequestBody, listRequestsQuery } from '@/lib/messages/requests-schema';

/** One row of the Requests folder: who, what they wrote, when. */
export interface MessageRequestItem {
  id: string;
  sender: {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
  };
  /** The one text message the sender left. */
  content: string;
  createdAt: string;
}

export interface MessageRequestPage {
  requests: MessageRequestItem[];
  /** All pending requests, not only this page. */
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export const listMessageRequestsApi = endpoint<{
  query: z.infer<typeof listRequestsQuery>;
  res: MessageRequestPage;
}>()({ method: 'GET', path: '/api/messages/requests' });

export const decideMessageRequestApi = endpoint<{
  body: z.infer<typeof decideRequestBody>;
  res: { success: true; conversationId: string };
}>()({ method: 'POST', path: '/api/messages/requests/$id' });
