import { Pencil, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { useAwayQuery, useAwayStatus, useTurnOffAway } from '@/components/messages/useAway';
import { IconButton } from '@/components/ui/icon-button';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/lib/toast';
import { awayDayDate, awayLastDay } from '@/lib/messages/away';

const DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };

/** "Away until 3 Dec" under a member's name, in the reader's language. Shows the end date only, never the text. */
export function AwayStatusLine({ userId, context }: { userId: string; context: 'header' | 'profile' }) {
  const { t } = useTranslation('away-message');
  const { data: session } = useSession();
  const format = useLocaleFormat();
  const { data } = useAwayStatus(userId, context, !!session);
  if (!data?.active || !data.endsAt || !data.tz) return null;
  const date = format.date(awayDayDate(awayLastDay(data.endsAt, data.tz)), DAY_FORMAT);
  return <p className="t-meta">{t('away-until', { date, defaultValue: 'Away until {{date}}' })}</p>;
}

/** The inbox line while the member's own message is set: "Away message on until 3 Dec" + Edit / Turn off icons. */
export function AwayInboxLine({ onEdit }: { onEdit: () => void }) {
  const { t } = useTranslation('away-message');
  const { data: session } = useSession();
  const format = useLocaleFormat();
  const { data } = useAwayQuery(!!session);
  const off = useTurnOffAway(() =>
    toast.error(t('turn-off-failed', { defaultValue: 'Could not turn off your away message' })),
  );
  const away = data?.away;
  if (!away) return null;
  const date = format.date(awayDayDate(away.endDay), DAY_FORMAT);
  return (
    <div className="t-meta mb-2 flex flex-wrap items-center gap-x-1 border-b border-site-border pb-2">
      <span className="me-auto">
        {away.active
          ? t('inbox-on-until', { date, defaultValue: 'Away message on until {{date}}' })
          : t('inbox-starts', { date, defaultValue: 'Away message set, ends {{date}}' })}
      </span>
      <IconButton icon={Pencil} size="icon-xs" label={t('edit', { defaultValue: 'Edit' })} onClick={onEdit} />
      <IconButton
        icon={X}
        size="icon-xs"
        label={t('turn-off', { defaultValue: 'Turn off' })}
        onClick={() => off.mutate()}
        disabled={off.isPending}
      />
    </div>
  );
}

/** "Automatic reply" above the text of an away message's reply; part of the message's accessible text. */
export function AutomaticReplyLabel() {
  const { t } = useTranslation('away-message');
  return (
    <span className="t-meta mb-1 block text-current opacity-70">
      {t('automatic-reply', { defaultValue: 'Automatic reply' })}
    </span>
  );
}

/** "Auto-replied" on a conversation row of the member who was away, so they can follow up when back. */
export function AutoRepliedMark() {
  const { t } = useTranslation('away-message');
  return <span className="t-meta">{t('auto-replied', { defaultValue: 'Auto-replied' })}</span>;
}
