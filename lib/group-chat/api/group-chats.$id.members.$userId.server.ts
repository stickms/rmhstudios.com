import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { removeGroupMemberApi } from '@/lib/group-chat/manage.contract';
import { removeMember } from '@/lib/group-chat/manage.server';
import { guardGroupAccount } from '@/lib/messages/send.server';

/** DELETE /api/group-chats/$id/members/$userId — the owner removes another member. */
export const route =
  apiRoute(
    '/api/group-chats/$id/members/$userId',
    {
      DELETE:
        implement(
          removeGroupMemberApi,
          {
            rateLimit:
              {
                policy:
                  'write',
                scope:
                  'user',
                prefix:
                  'mutation:group-chats/:id/members/:userId',
              },
          },
          async ({
            params,
            userId,
          }) => {
            const denied =
              await guardGroupAccount(
                userId,
              );
            if (
              denied
            )
              return denied.response;
            const result =
              await removeMember(
                userId,
                params.id,
                params.userId,
              );
            if (
              !result.ok
            )
              return Response.json(
                {
                  error:
                    result.error,
                },
                {
                  status:
                    result.status,
                },
              );
            return {
              success:
                true as const,
            };
          },
        ),
    },
  );
