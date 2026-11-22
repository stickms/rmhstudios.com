/**
 * The calls the invite-links dialog and the join page make (s06-09). Client-safe: contracts only.
 */
import { api } from '@/lib/contract/client';
import {
  createGroupInviteApi,
  joinGroupInviteApi,
  listGroupInvitesApi,
  revokeGroupInviteApi,
} from '@/lib/group-chat/invites.contract';
import type { InviteExpiryDays, InviteMaxUses } from '@/lib/group-chat/invites';

export const listGroupInvites = (groupId: string) =>
  api(listGroupInvitesApi, {
    params: {
      id: groupId,
    },
  });

export const createGroupInvite = (
  groupId: string,
  input: {
    expiresInDays: InviteExpiryDays;
    maxUses: InviteMaxUses;
  },
) =>
  api(createGroupInviteApi, {
    params: {
      id: groupId,
    },
    body: input,
  });

export const revokeGroupInvite = (groupId: string, inviteId: string) =>
  api(revokeGroupInviteApi, {
    params: {
      id: groupId,
      inviteId,
    },
  });

export const joinGroupInvite = (code: string) =>
  api(joinGroupInviteApi, {
    params: {
      code,
    },
  });
