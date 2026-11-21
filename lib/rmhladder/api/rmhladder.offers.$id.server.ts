import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  deleteOfferApi,
  updateOfferApi,
} from '@/lib/rmhladder/offers.contract';
import { offerPatchBody } from '@/lib/rmhladder/offers-schema';
import {
  deleteOffer,
  updateOffer,
} from '@/lib/rmhladder/offers.server';

/** PATCH changes the caller's offer (a changed amount is kept as a revision); DELETE removes it. */
export const route =
  apiRoute(
    '/api/rmhladder/offers/$id',
    {
      PATCH:
        implement(
          updateOfferApi,
          {
            rateLimit:
              'write',
            body: offerPatchBody,
          },
          async ({
            userId,
            params,
            body,
          }) => {
            const result =
              await updateOffer(
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
            return {
              offer:
                result.value,
            };
          },
        ),

      DELETE:
        implement(
          deleteOfferApi,
          {
            rateLimit:
              'write',
          },
          async ({
            userId,
            params,
          }) => {
            const result =
              await deleteOffer(
                userId,
                params.id!,
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
              ok: true as const,
            };
          },
        ),
    },
  );
