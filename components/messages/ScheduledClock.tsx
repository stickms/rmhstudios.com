import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { apiQuery } from '@/lib/contract/client';
import { listScheduledMessagesApi } from '@/lib/messages/scheduled.contract';

/** The chats in which the signed-in member holds scheduled messages (`/messages` marks them with a clock). */
export function useScheduledChatIds(signedIn: boolean): ReadonlySet<string> {
  const { data } = useQuery({ ...apiQuery(listScheduledMessagesApi), enabled: signedIn });
  return useMemo(() => new Set((data?.messages ?? []).map((m) => m.chatId)), [data]);
}

/** A small clock on a conversation row, named for assistive technology. */
export function ScheduledClock() {
  const { t } = useTranslation('send-later');
  return (
    <Clock
      className="size-3.5 shrink-0 self-center text-site-text-muted"
      role="img"
      aria-label={t('inbox-clock-label', { defaultValue: 'Has scheduled messages' })}
    />
  );
}
