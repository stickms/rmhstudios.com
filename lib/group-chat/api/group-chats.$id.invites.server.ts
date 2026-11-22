import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createGroupInviteApi, listGroupInvitesApi } from '@/lib/group-chat/invites.contract';
import { createInviteBody } from '@/lib/group-chat/invites-schema';
import { createInvite, listInvites } from '@/lib/group-chat/invites.server';
import { guardGroupAccount } from '@/lib/messages/send.server';

/** GET/POST /api/group-chats/$id/invites — the owner lists the live invite links, or makes one. */
export const route = apiRoute('/api/group-chats/$id/invites', {
  GET: implement(
    listGroupInvitesApi,
    {
      rateLimit: 'read',
    },
    async ({ params, userId }) => {
      const result = await listInvites(userId, params.id);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        invites: result.value,
      };
    },
  ),
  POST: implement(
    createGroupInviteApi,
    {
      rateLimit: 'write',
      body: createInviteBody,
    },
    async ({ params, userId, body }) => {
      const denied = await guardGroupAccount(userId);
      if (denied) return denied.response;
      const result = await createInvite(userId, params.id, body);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        invite: result.value,
      };
    },
  ),
});
