import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { joinGroupInviteApi } from '@/lib/group-chat/invites.contract';
import { joinByInvite } from '@/lib/group-chat/invites.server';
import { guardGroupAccount } from '@/lib/messages/send.server';

/** POST /api/group-invites/$code/join — join through a link. Every refusal is the same 400, whatever the cause. */
export const route = apiRoute('/api/group-invites/$code/join', {
  POST: implement(
    joinGroupInviteApi,
    {
      rateLimit: {
        limit: 20,
        windowMs: 60_000,
        prefix: 'group-invite-join',
      },
    },
    async ({ params, userId }) => {
      const refused = () =>
        Response.json(
          {
            error: "This invite can't be used",
          },
          {
            status: 400,
          },
        );
      if (await guardGroupAccount(userId)) return refused();
      const result = await joinByInvite(userId, params.code);
      if (!result.ok) return refused();
      return {
        chatId: result.chatId,
      };
    },
  ),
});
