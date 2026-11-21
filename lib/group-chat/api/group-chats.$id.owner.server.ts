import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { transferGroupOwnerApi } from '@/lib/group-chat/manage.contract';
import { transferOwnerBody } from '@/lib/group-chat/manage-schema';
import { transferOwnership } from '@/lib/group-chat/manage.server';
import { guardGroupAccount } from '@/lib/messages/send.server';

/** PUT /api/group-chats/$id/owner — the owner hands the group to another member and becomes an ordinary member. */
export const route =
  apiRoute(
    '/api/group-chats/$id/owner',
    {
      PUT: implement(
        transferGroupOwnerApi,
        {
          rateLimit:
            {
              policy:
                'write',
              scope:
                'user',
              prefix:
                'mutation:group-chats/:id/owner',
            },
          body: transferOwnerBody,
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
            await transferOwnership(
              userId,
              params.id,
              body.userId,
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
