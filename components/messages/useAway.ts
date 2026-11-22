import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiQuery } from '@/lib/contract/client';
import { awayStatusApi, deleteAwayApi, getAwayApi } from '@/lib/messages/away.contract';

/** The member's own away message and the chats it answered. Fetched once their messages list asks for it. */
export function useAwayQuery(enabled: boolean) {
  return useQuery({
    ...apiQuery(getAwayApi),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** What someone else may know about a member: away or not, and until when. Nothing is fetched for a signed-out viewer. */
export function useAwayStatus(userId: string | null, context: 'header' | 'profile', enabled: boolean) {
  return useQuery({
    ...apiQuery(awayStatusApi, { params: { userId: userId ?? '' }, query: { context } }),
    enabled: enabled && !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useInvalidateAway() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [getAwayApi.path] });
}

/** Turn the away message off. */
export function useTurnOffAway(onError: () => void) {
  const invalidate = useInvalidateAway();
  return useMutation({
    mutationFn: () => api(deleteAwayApi),
    onSuccess: () => void invalidate(),
    onError,
  });
}
