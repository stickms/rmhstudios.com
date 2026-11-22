import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { formatDuration } from '@/lib/study/practice-test';
import { listDeckTestsApi } from '@/lib/study/tests.contract';

const SHOWN = 5;

/** The signed-in student's last five practice-test scores on a deck. Renders nothing when there are none. */
export function TestHistory({ deckId }: { deckId: string }) {
  const { t, i18n } = useTranslation('study-tests');
  const { data, isPending } = useQuery({
    ...apiQuery(listDeckTestsApi, { params: { id: deckId } }),
    retry: false,
  });
  const arrival = useArrival(!isPending);

  if (isPending) return <Skeleton className="h-16 w-full" />;
  const rows = data?.results.slice(0, SHOWN) ?? [];
  if (rows.length === 0) return null;

  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section aria-labelledby={`tests-${deckId}`} className={arrival}>
      <h2 id={`tests-${deckId}`} className="t-label mb-2">
        {t('history-title', { defaultValue: 'Recent practice tests' })}
      </h2>
      <ol className="border-t border-site-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3 border-b border-site-border py-2">
            <span className="t-body">
              {t('history-score', {
                defaultValue: '{{correct}} of {{total}} · {{percent}}',
                correct: r.correct,
                total: r.total,
                percent: percent.format(r.total > 0 ? r.correct / r.total : 0),
              })}
            </span>
            <span className="t-meta">
              {date.format(new Date(r.createdAt))} · {formatDuration(r.durationMs)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
