import { useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/contract/client';
import { muteFieldsFor } from '@/lib/feed/conversation-controls';
import { getConversationPrefApi, setConversationPrefApi } from '@/lib/preferences/conversation.contract';
import { toast } from '@/lib/toast';

type Mode = 'all' | 'mentions' | 'none';

const prefKey = (groupId: string) => ['group-chat', 'notifications', groupId] as const;

/**
 * "Notifications" for one group in its info dialog (s07-05, FR-6): All, Mentions only or Muted, read and written through
 * the member's per-conversation preference (`group:<id>`), the same row the notifier consults.
 */
export function GroupNotificationSetting({ groupId }: { groupId: string }) {
  const { t } = useTranslation('group-mentions');
  const queryClient = useQueryClient();
  const selectId = useId();
  const scopeKey = `group:${groupId}`;
  const { data } = useQuery({
    queryKey: prefKey(groupId),
    queryFn: () =>
      api(getConversationPrefApi, {
        query: { scopeKey },
      }),
    staleTime: 30_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (mode: Mode) => {
      // Muted is "until I turn it back on": the same far-future stamp the post mute uses.
      const fields =
        mode === 'mentions'
          ? muteFieldsFor('mentions')
          : mode === 'none'
            ? muteFieldsFor('forever')
            : { muteUntil: null, mentionsOnly: false };
      return api(setConversationPrefApi, {
        body: {
          scopeKey,
          muteUntil: fields.muteUntil ? fields.muteUntil.toISOString() : null,
          mentionsOnly: fields.mentionsOnly,
        },
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(prefKey(groupId), next);
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'muted-conversations'],
      });
    },
    onError: () =>
      toast.error(
        t('notifications-error', {
          defaultValue: 'Could not change notifications for this group.',
        }),
      ),
  });
  const mode: Mode = save.variables ?? data?.mode ?? 'all';
  const description =
    mode === 'mentions'
      ? t('notifications-mentions-desc', {
          defaultValue: 'When someone writes your @handle, you are told. Other messages stay quiet.',
        })
      : mode === 'none'
        ? t('notifications-none-desc', {
            defaultValue: 'You are not told about anything in this group.',
          })
        : t('notifications-all-desc', {
            defaultValue: 'You are told about every message in this group.',
          });
  return (
    <section>
      <label htmlFor={selectId} className="t-label block pb-1">
        {t('notifications', { defaultValue: 'Notifications' })}
      </label>
      <Select
        id={selectId}
        value={mode}
        disabled={save.isPending}
        onChange={(e) => save.mutate(e.target.value as Mode)}
      >
        <option value="all">{t('notifications-all', { defaultValue: 'All' })}</option>
        <option value="mentions">{t('notifications-mentions', { defaultValue: 'Mentions only' })}</option>
        <option value="none">{t('notifications-none', { defaultValue: 'Muted' })}</option>
      </Select>
      <p className="t-meta pt-1">{description}</p>
    </section>
  );
}
