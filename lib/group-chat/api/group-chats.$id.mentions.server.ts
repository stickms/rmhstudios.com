import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMyGroupMentionsApi } from '@/lib/group-chat/mentions.contract';
import { listMyMentions } from '@/lib/group-chat/mentions.server';
import { findGroupMembership } from '@/lib/chat/chat.server';

const query =
  z.object(
    {
      cursor:
        z
          .string()
          .datetime()
          .optional(),
    },
  );

/** GET /api/group-chats/$id/mentions?cursor= — the viewer's own mentions in this group (members only). */
export const route =
  apiRoute(
    '/api/group-chats/$id/mentions',
    {
      GET: implement(
        listMyGroupMentionsApi,
        {
          rateLimit:
            'read',
          query,
        },
        async ({
          params,
          userId,
          query:
            q,
        }) => {
          const membership =
            await findGroupMembership(
              params.id,
              userId,
              {
                id: true,
              },
            );
          if (
            !membership
          )
            return Response.json(
              {
                error:
                  'Not found',
              },
              {
                status: 404,
              },
            );
          return listMyMentions(
            userId,
            params.id,
            q.cursor ??
              null,
          );
        },
      ),
    },
  );
