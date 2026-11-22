import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiQuery } from '@/lib/contract/client';
import { listSavedRepliesApi, recordSavedReplyUseApi } from '@/lib/messages/saved-replies.contract';
import type { SavedReplyRow } from '@/lib/messages/saved-replies';

/** The list is fetched once per session when a composer first needs it, and again only after an edit. */
const STALE_MS = 5 * 60_000;

/** The member's saved replies. `enabled` is false until a menu, the manage dialog or a `/` trigger needs them. */
export function useSavedRepliesQuery(enabled: boolean) {
  return useQuery({
    ...apiQuery(listSavedRepliesApi),
    enabled,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    select: (data): SavedReplyRow[] => data.replies,
  });
}

/** Mark the cached list stale after a create, edit, delete or reorder. */
export function useInvalidateSavedReplies() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [listSavedRepliesApi.path] });
}

/** Fire-and-forget: a failed count must never get in the way of the message being written. */
export function recordReplyUse(id: string): void {
  api(recordSavedReplyUseApi, { params: { id } }).catch(() => undefined);
}
