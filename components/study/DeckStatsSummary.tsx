import { deviceTimeZone } from '@/lib/core/zoned-time';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { getStudyStatsApi } from '@/lib/study/stats.contract';

/**
 * One deck's due-today count and mature share for the signed-in studier, with a link to the
 * statistics page filtered to the deck. Renders nothing when the stats cannot be loaded.
 */
export function DeckStatsSummary({ deckId }: { deckId: string }) {
  const { t, i18n } = useTranslation('study-stats');
  const timeZone = deviceTimeZone();
  const { data, isPending } = useQuery({
    ...apiQuery(getStudyStatsApi, {
      query: { deckId, ...(timeZone ? { tz: timeZone } : {}) },
    }),
    retry: false,
  });
  const arrival = useArrival(!isPending);

  if (isPending) return <Skeleton className="h-5 w-64" />;
  const row = data?.decks.find((d) => d.id === deckId);
  if (!row) return null;

  const share = row.cards > 0 ? row.mature / row.cards : 0;
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 });

  return (
    <p className={`t-meta flex flex-wrap items-center gap-x-3 gap-y-1 ${arrival ?? ''}`}>
      <span>{t('summary-due', { defaultValue: 'Due today: {{count}}', count: row.dueToday })}</span>
      <span>{t('summary-mature', { defaultValue: 'Mature: {{share}}', share: percent.format(share) })}</span>
      <Link to="/study/stats" search={{ deck: deckId }} className="underline">
        {t('summary-link', { defaultValue: 'Statistics' })}
      </Link>
    </p>
  );
}
