/**
 * The member's RMHTube subscriptions (s13-07): one shared query behind every Subscribe button and the landing's
 * "Hosts you follow", and the one place that flips a subscription and keeps that query in step.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HttpError } from '@/lib/http';
import { api, apiQuery } from '@/lib/contract/client';
import {
  listSubscriptionsApi,
  subscribeApi,
  unsubscribeApi,
  type TubeHostDTO,
} from '@/lib/rmhtube/subscriptions.contract';

const listQuery = () => ({ ...apiQuery(listSubscriptionsApi), retry: false, staleTime: 30_000 });

export function useTubeSubscriptions() {
  const query = useQuery(listQuery());
  const signedOut = query.error instanceof HttpError && query.error.status === 401;
  return { query, signedOut, hosts: query.data?.hosts ?? [] };
}

/** Subscribe (`next` true) or unsubscribe. Rejects with the server's refusal, for `useRefusalText`. */
export function useSetSubscribed() {
  const queryClient = useQueryClient();
  return useCallback(
    async (host: TubeHostDTO, next: boolean) => {
      await api(next ? subscribeApi : unsubscribeApi, { params: { channelId: host.id } });
      queryClient.setQueryData(listQuery().queryKey, (old: { hosts: TubeHostDTO[] } | undefined) => {
        const rest = (old?.hosts ?? []).filter((h) => h.id !== host.id);
        return { hosts: next ? [host, ...rest] : rest };
      });
    },
    [queryClient],
  );
}
