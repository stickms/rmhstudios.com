/**
 * Contracts for managing a group chat (s04-10). Client-safe: types come from the zod schemas by `import type`.
 * `$id` is the group id; `$userId` a member.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { addMembersBody, renameGroupBody, transferOwnerBody } from '@/lib/group-chat/manage-schema';

/** Owner only: rename the group. Posts a system line. */
export const renameGroupApi = endpoint<{
  body: z.infer<typeof renameGroupBody>;
  res: {
    success: true;
    name: string;
  };
}>()({
  method: 'PATCH',
  path: '/api/group-chats/$id/manage',
});

/** Owner only: add up to 10 people by id or handle. `refused` counts everyone left out; it never says why. */
export const addGroupMembersApi = endpoint<{
  body: z.infer<typeof addMembersBody>;
  res: {
    success: true;
    added: number;
    refused: number;
  };
}>()({
  method: 'POST',
  path: '/api/group-chats/$id/members',
});

/** Owner only: remove another member. */
export const removeGroupMemberApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/group-chats/$id/members/$userId',
});

/** Owner only: hand the group to another member; the caller becomes an ordinary member. */
export const transferGroupOwnerApi = endpoint<{
  body: z.infer<typeof transferOwnerBody>;
  res: {
    success: true;
  };
}>()({
  method: 'PUT',
  path: '/api/group-chats/$id/owner',
});
