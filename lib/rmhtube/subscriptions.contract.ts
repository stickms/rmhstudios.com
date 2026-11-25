/** Contracts for subscribing to an RMHTube host. Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';
import type { TubeHostDTO } from '@/lib/rmhtube/subscriptions';

export type { TubeHostDTO };

/** Subscribe to a host's watch parties. Idempotent. */
export const subscribeApi = endpoint<{
  res: {
    subscribed: boolean;
  };
}>()({
  method: 'PUT',
  path: '/api/rmhtube/subscribe/$channelId',
});

/** Unsubscribe. Idempotent: no subscription is still `subscribed: false`. */
export const unsubscribeApi = endpoint<{
  res: {
    subscribed: boolean;
  };
}>()({
  method: 'DELETE',
  path: '/api/rmhtube/subscribe/$channelId',
});

/** The hosts the signed-in member follows. Never a list of anyone's subscribers, never a count. */
export const listSubscriptionsApi = endpoint<{
  res: {
    hosts: TubeHostDTO[];
  };
}>()({
  method: 'GET',
  path: '/api/rmhtube/subscriptions',
});
