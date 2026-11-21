import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { revokeGroupInviteApi } from '@/lib/group-chat/invites.contract';
import { revokeInvite } from '@/lib/group-chat/invites.server';

/** DELETE /api/group-chats/$id/invites/$inviteId — the owner revokes a link; nobody who joined is removed. */
export const route =
  apiRoute(
    '/api/group-chats/$id/invites/$inviteId',
    {
      DELETE:
        implement(
          revokeGroupInviteApi,
          {
            rateLimit:
              'write',
          },
          async ({
            params,
            userId,
          }) => {
            const result =
              await revokeInvite(
                userId,
                params.id,
                params.inviteId,
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
