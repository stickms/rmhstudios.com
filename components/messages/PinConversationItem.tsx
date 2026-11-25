import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pin, PinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/contract/client';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { CONVERSATION_PINS_CHANGED_EVENT, dmScopeKey } from '@/lib/messages/pins';
import { getConversationPrefApi, setConversationPrefApi } from '@/lib/preferences/conversation.contract';
import { toast } from '@/lib/toast';

// The same cache entry the mute control reads: both are one `dm:<id>` preference.
const prefKey = (conversationId: string) => ['messages', 'mute', conversationId] as const;

/**
 * "Pin to top" / "Unpin" in a direct conversation's header, beside the mute bell. A button with `aria-pressed`
 * (the header has no menu); the limit of five is the server's, and its sentence is shown when a sixth is refused.
 */
export function PinConversationItem({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation('pinned-conversations');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const scopeKey = dmScopeKey(conversationId);
  const { data } = useQuery({
    queryKey: prefKey(conversationId),
    queryFn: () => api(getConversationPrefApi, { query: { scopeKey } }),
    staleTime: 30_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (pinned: boolean) => api(setConversationPrefApi, { body: { scopeKey, pinned } }),
    onSuccess: (next) => {
      queryClient.setQueryData(prefKey(conversationId), next);
      void queryClient.invalidateQueries({ queryKey: ['messages', 'list'] });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONVERSATION_PINS_CHANGED_EVENT));
    },
    onError: (error) =>
      toast.error(refusalText.maybe(error) ?? t('error', { defaultValue: 'Could not change this pin.' })),
  });
  const pinned = data?.pinned === true;
  const label = pinned ? t('unpin', { defaultValue: 'Unpin' }) : t('pin-to-top', { defaultValue: 'Pin to top' });
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={save.isPending}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      onClick={() => save.mutate(!pinned)}
    >
      {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
    </Button>
  );
}
