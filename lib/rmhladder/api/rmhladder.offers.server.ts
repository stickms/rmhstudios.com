import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listOffersApi, recordOfferApi } from '@/lib/rmhladder/offers.contract';
import { offerBody } from '@/lib/rmhladder/offers-schema';
import { listOffers, recordOffer } from '@/lib/rmhladder/offers.server';

/** GET /api/rmhladder/offers lists the caller's offers; POST records one on their application. */
export const route = apiRoute('/api/rmhladder/offers', {
  GET: implement(
    listOffersApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) => listOffers(userId),
  ),

  POST: implement(
    recordOfferApi,
    {
      rateLimit: 'write',
      body: offerBody,
    },
    async ({ userId, body }) => {
      const result = await recordOffer(userId, body);
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
        offer: result.value,
      };
    },
  ),
});
