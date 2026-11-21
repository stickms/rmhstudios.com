import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { decideOfferApi } from '@/lib/rmhladder/offers.contract';
import { decideBody } from '@/lib/rmhladder/offers-schema';
import { decideOffer } from '@/lib/rmhladder/offers.server';

/** POST accepts or declines the caller's open offer; accept withdraws only the applications listed. */
export const route =
  apiRoute(
    '/api/rmhladder/offers/$id/decide',
    {
      POST: implement(
        decideOfferApi,
        {
          rateLimit:
            'write',
          body: decideBody,
        },
        async ({
          userId,
          params,
          body,
        }) => {
          const result =
            await decideOffer(
              userId,
              params.id!,
              body,
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
          return result.value;
        },
      ),
    },
  );
