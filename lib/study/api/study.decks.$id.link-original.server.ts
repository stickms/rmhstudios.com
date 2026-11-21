import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { linkOriginalApi } from '@/lib/study/deck-sync.contract';
import { linkToOriginal } from '@/lib/study/deck-sync.server';

/** POST /api/study/decks/$id/link-original — match an older copy's cards to the original by front text. */
export const route =
  apiRoute(
    '/api/study/decks/$id/link-original',
    {
      POST: implement(
        linkOriginalApi,
        {
          rateLimit:
            'write',
        },
        async ({
          userId,
          params,
        }) => {
          const result =
            await linkToOriginal(
              userId,
              params.id,
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
            linked:
              result.linked,
            unmatched:
              result.unmatched,
          };
        },
      ),
    },
  );
