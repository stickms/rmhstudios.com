/**
 * Contracts for /api/rmhladder/offers (sprint 03, feature 17). Client-safe:
 * types come from the zod schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { OfferDto, OpenApplication, PendingOfferApplication } from '@/lib/rmhladder/offers';
import type { decideBody, offerBody, offerPatchBody } from '@/lib/rmhladder/offers-schema';

/** The member's offers, the applications at Offer with none recorded, and the open applications Accept may withdraw. */
export const listOffersApi = endpoint<{
  res: {
    offers: OfferDto[];
    pending: PendingOfferApplication[];
    openApplications: OpenApplication[];
  };
}>()({
  method: 'GET',
  path: '/api/rmhladder/offers',
});

export const recordOfferApi = endpoint<{
  body: z.infer<typeof offerBody>;
  res: {
    offer: OfferDto;
  };
}>()({
  method: 'POST',
  path: '/api/rmhladder/offers',
});

export const updateOfferApi = endpoint<{
  body: z.infer<typeof offerPatchBody>;
  res: {
    offer: OfferDto;
  };
}>()({
  method: 'PATCH',
  path: '/api/rmhladder/offers/$id',
});

export const deleteOfferApi = endpoint<{
  res: {
    ok: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/rmhladder/offers/$id',
});

export const decideOfferApi = endpoint<{
  body: z.infer<typeof decideBody>;
  res: {
    offer: OfferDto;
    withdrawn: number;
  };
}>()({
  method: 'POST',
  path: '/api/rmhladder/offers/$id/decide',
});
