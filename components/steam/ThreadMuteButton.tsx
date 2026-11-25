import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { activeMuteUntil, dmMuteUntil } from '@/lib/messages/dm-mute';
import { getConversationPrefApi, setConversationPrefApi } from '@/lib/preferences/conversation.contract';
import { toast } from '@/lib/toast';

const prefKey = (threadId: string) => ['games-hub', 'thread-mute', threadId] as const;

/**
 * "Mute this thread" / "Unmute this thread" on a game discussion, for a signed-in member. It writes the same
 * per-conversation preference the notifier reads (`game-thread:<id>`), so a muted thread tells the member nothing more
 * about replies in it. Posting in a thread or starting one never changes it.
 */
export function ThreadMuteButton({ threadId, className }: { threadId: string; className?: string }) {
  const { t } = useTranslation('thread-replies');
  const queryClient = useQueryClient();
  const scopeKey = `game-thread:${threadId}`;
  const { data } = useQuery({
    queryKey: prefKey(threadId),
    queryFn: () => api(getConversationPrefApi, { query: { scopeKey } }),
    staleTime: 30_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (muteUntil: Date | null) =>
      api(setConversationPrefApi, { body: { scopeKey, muteUntil: muteUntil ? muteUntil.toISOString() : null } }),
    onSuccess: (next) => {
      queryClient.setQueryData(prefKey(threadId), next);
      void queryClient.invalidateQueries({ queryKey: ['settings', 'muted-conversations'] });
    },
    onError: () => toast.error(t('error', { defaultValue: 'Could not change notifications for this thread.' })),
  });
  const muted = activeMuteUntil(data?.muteUntil) !== null;
  return (
    <button
      type="button"
      className={className}
      disabled={save.isPending || data === undefined}
      onClick={() => save.mutate(muted ? null : dmMuteUntil('forever'))}
    >
      {muted ? <BellOff aria-hidden className="size-3.5" /> : <Bell aria-hidden className="size-3.5" />}
      {muted ? t('unmute', { defaultValue: 'Unmute this thread' }) : t('mute', { defaultValue: 'Mute this thread' })}
    </button>
  );
}
