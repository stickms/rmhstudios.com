import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { setGroupAdminApi } from '@/lib/group-chat/roles.contract';
import { setAdminBody } from '@/lib/group-chat/roles-schema';
import { setAdmin } from '@/lib/group-chat/roles.server';
import { guardGroupAccount } from '@/lib/messages/send.server';

/** PUT /api/group-chats/$id/members/$userId/role — the owner makes a member an admin or takes it back. */
export const route =
  apiRoute(
    '/api/group-chats/$id/members/$userId/role',
    {
      PUT: implement(
        setGroupAdminApi,
        {
          rateLimit:
            {
              policy:
                'write',
              scope:
                'user',
              prefix:
                'mutation:group-chats/:id/members/:userId/role',
            },
          body: setAdminBody,
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
            await setAdmin(
              params.id,
              userId,
              params.userId,
              body.admin,
            );
          if (
            !result.ok
          )
            return Response.json(
              {
                error:
                  result.error,
                ...(result.code
                  ? {
                      code: result.code,
                    }
                  : {}),
              },
              {
                status:
                  result.status,
              },
            );
          return {
            success:
              true as const,
            admin:
              result.admin,
          };
        },
      ),
    },
  );
