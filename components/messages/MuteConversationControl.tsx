import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { api } from '@/lib/contract/client';
import { activeMuteUntil, dmMuteUntil, isOpenEndedMute, type DmMuteChoice } from '@/lib/messages/dm-mute';
import { getConversationPrefApi, setConversationPrefApi } from '@/lib/preferences/conversation.contract';
import { toast } from '@/lib/toast';

const prefKey = (conversationId: string) => ['messages', 'mute', conversationId] as const;

/**
 * The member's mute for one direct conversation, read and written through the same per-conversation preference the
 * notifier consults (`dm:<id>`). `muteUntil` is the whole state: null or past is "not muted".
 */
export function useDmMute(conversationId: string) {
  const { t } = useTranslation('message-push');
  const queryClient = useQueryClient();
  const scopeKey = `dm:${conversationId}`;
  const { data } = useQuery({
    queryKey: prefKey(conversationId),
    queryFn: () => api(getConversationPrefApi, { query: { scopeKey } }),
    staleTime: 30_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (muteUntil: Date | null) =>
      api(setConversationPrefApi, { body: { scopeKey, muteUntil: muteUntil ? muteUntil.toISOString() : null } }),
    onSuccess: (next) => {
      queryClient.setQueryData(prefKey(conversationId), next);
      void queryClient.invalidateQueries({ queryKey: ['settings', 'muted-conversations'] });
    },
    onError: () => toast.error(t('error', { defaultValue: 'Could not change notifications for this conversation.' })),
  });
  return {
    mutedUntil: activeMuteUntil(data?.muteUntil),
    pending: save.isPending,
    mute: (choice: DmMuteChoice) => save.mutate(dmMuteUntil(choice)),
    unmute: () => save.mutate(null),
  };
}

/** The four choices, in the order the menu shows them. */
export function MuteChoiceItems({ onChoose }: { onChoose: (choice: DmMuteChoice) => void }) {
  const { t } = useTranslation('message-push');
  return (
    <>
      <MenuItem onSelect={() => onChoose('1h')}>{t('mute-1h', { defaultValue: 'For 1 hour' })}</MenuItem>
      <MenuItem onSelect={() => onChoose('8h')}>{t('mute-8h', { defaultValue: 'For 8 hours' })}</MenuItem>
      <MenuItem onSelect={() => onChoose('7d')}>{t('mute-7d', { defaultValue: 'For 1 week' })}</MenuItem>
      <MenuItem onSelect={() => onChoose('forever')}>
        {t('mute-forever', { defaultValue: 'Until I turn it back on' })}
      </MenuItem>
    </>
  );
}

/** "Muted until 9 Dec, 14:30", or the open-ended sentence. Draws nothing when the conversation is not muted. */
export function MutedUntilLine({ mutedUntil, locale }: { mutedUntil: Date | null; locale?: string | undefined }) {
  const { t } = useTranslation('message-push');
  if (!mutedUntil) return null;
  if (isOpenEndedMute(mutedUntil)) {
    return <p className="t-meta">{t('muted-forever', { defaultValue: 'Muted until you turn it back on' })}</p>;
  }
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(mutedUntil);
  return <p className="t-meta">{t('muted-until', { defaultValue: 'Muted until {{time}}', time })}</p>;
}

/** The header's bell: "Mute notifications" with four choices, or "Turn notifications back on" while it is muted. */
export function MuteConversationControl({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation('message-push');
  const { mutedUntil, pending, mute, unmute } = useDmMute(conversationId);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = mutedUntil
    ? t('muted-button', { defaultValue: 'Notifications muted' })
    : t('mute-button', { defaultValue: 'Mute notifications' });
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        {mutedUntil ? <BellOff aria-hidden /> : <Bell aria-hidden />}
      </Button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} label={label} className="w-64">
        {mutedUntil ? (
          <MenuItem
            icon={Bell}
            onSelect={() => {
              setOpen(false);
              unmute();
            }}
          >
            {t('unmute', { defaultValue: 'Turn notifications back on' })}
          </MenuItem>
        ) : (
          <MuteChoiceItems
            onChoose={(choice) => {
              setOpen(false);
              mute(choice);
            }}
          />
        )}
      </AnchoredMenu>
    </>
  );
}

/** The line under the other member's name in the thread header. */
export function MutedUntilHeaderLine({ conversationId }: { conversationId: string }) {
  const { i18n } = useTranslation('message-push');
  const { mutedUntil } = useDmMute(conversationId);
  return <MutedUntilLine mutedUntil={mutedUntil} locale={i18n.language || undefined} />;
}
