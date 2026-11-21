/** Contracts for the community ownership handover (client-safe; types by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  HandoverOfferDTO,
  HandoverStatusDTO,
  OwnedCommunityDTO,
} from '@/lib/communities/handover';
import type {
  assignOwnerBody,
  offerHandoverBody,
  respondHandoverBody,
} from './handover-schema';

/** The viewer's side of the community's handover: the offer, and for the owner the moderators to choose from. */
export const getHandoverApi = endpoint<{ res: HandoverStatusDTO }>()({
  method: 'GET',
  path: '/api/communities/$slug/handover',
});

/** The owner offers the community to one moderator (409 when an unexpired offer is already pending). */
export const offerHandoverApi = endpoint<{
  body: z.infer<typeof offerHandoverBody>;
  res: { offer: HandoverOfferDTO };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/handover',
});

/** The owner withdraws the pending offer. */
export const cancelHandoverApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/communities/$slug/handover',
});

/** The offered moderator accepts (the community becomes theirs) or declines. */
export const respondHandoverApi = endpoint<{
  body: z.infer<typeof respondHandoverBody>;
  res: { success: true; action: 'accept' | 'decline' };
}>()({
  method: 'POST',
  path: '/api/communities/$slug/handover/respond',
});

/** Site admin: the communities a user created, with whether their owner is gone and who could take over. */
export const listOwnedCommunitiesApi = endpoint<{
  res: { communities: OwnedCommunityDTO[] };
}>()({
  method: 'GET',
  path: '/api/admin/users/$id/owned-communities',
});

/** Site admin: give a community whose owner is deleted or banned to one of its moderators. */
export const assignCommunityOwnerApi = endpoint<{
  body: z.infer<typeof assignOwnerBody>;
  res: { success: true };
}>()({
  method: 'PUT',
  path: '/api/admin/communities/$slug/owner',
});
