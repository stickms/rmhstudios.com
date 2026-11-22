/**
 * Contracts for group invite links (s06-09). Client-safe: types come from the zod schemas by `import type`.
 * `$id` is the group id, `$inviteId` a link, `$code` the code in a pasted link.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { createInviteBody } from '@/lib/group-chat/invites-schema';
import type { InviteRow } from '@/lib/group-chat/invites';

export type { InviteRow };

/** Owner only: the group's live links. */
export const listGroupInvitesApi = endpoint<{
  res: {
    invites: InviteRow[];
  };
}>()({
  method: 'GET',
  path: '/api/group-chats/$id/invites',
});

/** Owner only: make a link (at most five live). */
export const createGroupInviteApi = endpoint<{
  body: z.infer<typeof createInviteBody>;
  res: {
    invite: InviteRow;
  };
}>()({
  method: 'POST',
  path: '/api/group-chats/$id/invites',
});

/** Owner only: revoke a link. Nobody who joined is removed. */
export const revokeGroupInviteApi = endpoint<{
  res: {
    success: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/group-chats/$id/invites/$inviteId',
});

/** Join through a link. A refusal is always the same 400. */
export const joinGroupInviteApi = endpoint<{
  res: {
    chatId: string;
  };
}>()({
  method: 'POST',
  path: '/api/group-invites/$code/join',
});
