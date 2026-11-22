import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { renameGroupApi } from '@/lib/group-chat/manage.contract';
import { renameGroupBody } from '@/lib/group-chat/manage-schema';
import { renameGroup } from '@/lib/group-chat/manage.server';
import { guardGroupAccount } from '@/lib/messages/send.server';

/** PATCH /api/group-chats/$id/manage — the owner renames the group. */
export const route = apiRoute('/api/group-chats/$id/manage', {
  PATCH: implement(
    renameGroupApi,
    {
      rateLimit: {
        policy: 'write',
        scope: 'user',
        prefix: 'mutation:group-chats/:id/manage',
      },
      body: renameGroupBody,
    },
    async ({ params, userId, body }) => {
      const denied = await guardGroupAccount(userId);
      if (denied) return denied.response;
      const result = await renameGroup(userId, params.id, body.name);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
          },
          {
            status: result.status,
          },
        );
      return {
        success: true as const,
        name: result.value.name,
      };
    },
  ),
});
