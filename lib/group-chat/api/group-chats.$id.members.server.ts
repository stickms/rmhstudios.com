import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { addGroupMembersApi } from '@/lib/group-chat/manage.contract';
import { addMembersBody } from '@/lib/group-chat/manage-schema';
import { addMembers } from '@/lib/group-chat/manage.server';
import { guardGroupAccount } from '@/lib/messages/send.server';

/**
 * POST /api/group-chats/$id/members — the owner adds up to 10 people. Anyone who cannot join (a block in either
 * direction, a banned account, an unknown name, a full group) is counted in `refused`, never explained.
 */
export const route =
  apiRoute(
    '/api/group-chats/$id/members',
    {
      POST: implement(
        addGroupMembersApi,
        {
          rateLimit:
            {
              policy:
                'write',
              scope:
                'user',
              prefix:
                'mutation:group-chats/:id/members',
            },
          body: addMembersBody,
        },
        async ({
          params,
          userId,
          body,
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
            await addMembers(
              userId,
              params.id,
              body.members,
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
            ...result.value,
          };
        },
      ),
    },
  );
