/** Contract for "Your mentions" in a group (s07-05). Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';

export interface MyMentionRow {
  messageId: string;
  createdAt: string;
  /** The start of the message, never more than 160 characters. */
  snippet: string;
  sender: {
    id: string;
    name: string | null;
    handle: string | null;
  };
}

/** The viewer's own mentions in one group, newest first; `next` is the cursor for the page after. */
export const listMyGroupMentionsApi = endpoint<{
  query: {
    cursor?: string;
  };
  res: {
    mentions: MyMentionRow[];
    next: string | null;
  };
}>()({
  method: 'GET',
  path: '/api/group-chats/$id/mentions',
});
