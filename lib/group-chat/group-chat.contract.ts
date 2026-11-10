/**
 * Contracts for the group-chat message actions (redesign audit C1). Client-safe.
 * The routes keep `defineHandler` with their in-handler membership and rate-limit
 * checks; the contract types the client side. `$id` is the group id.
 */
import { endpoint } from '@/lib/contract/endpoint';

export const reactGroupMessageApi = endpoint<{
  body: { messageId: string; emoji: string };
  res: { success: true; reacted: boolean; reactions: unknown[] };
}>()({ method: 'POST', path: '/api/group-chats/$id/react' });

export const voteGroupPollApi = endpoint<{
  body: { optionIdx: number };
  /** The serialized poll (`Msg['poll']` in the client state); typed there, loose here. */
  res: { poll: unknown };
}>()({ method: 'POST', path: '/api/group-chats/$id/messages/$messageId/vote' });

export const leaveGroupChatApi = endpoint<{ res: { success: true } }>()({
  method: 'POST',
  path: '/api/group-chats/$id/leave',
});
