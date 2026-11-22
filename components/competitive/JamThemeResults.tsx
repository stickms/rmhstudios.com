import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { jamThemeVoteQuery } from '@/lib/competitive/jam-themes.queries';
import { cn } from '@/lib/utils';

/** After the start: the shortlist with each candidate's vote count, the winner marked in words ("Chosen"). */
export function JamThemeResults({ slug }: { slug: string }) {
  const { t } = useTranslation('jam-themes');
  const { data, isError } = useQuery(jamThemeVoteQuery(slug));
  const view = data?.view;
  const arrival = useArrival(view !== undefined);

  if (isError) return null;
  if (!view) return <Skeleton className="h-24 rounded-site" />;
  if (!view.enabled || view.phase !== 'closed' || view.candidates.length === 0) return null;

  return (
    <section className={cn('space-y-2', arrival)} aria-labelledby="jam-theme-results-title">
      <h2 id="jam-theme-results-title" className="t-heading">
        {t('results-title', {
          defaultValue: 'The theme vote',
        })}
      </h2>
      <ul>
        {view.candidates.map((c) => (
          <li key={c.id} className="flex items-baseline gap-3 border-b border-site-border py-2">
            <span className={cn('t-body min-w-0 flex-1', c.id === view.winnerId && 'font-semibold')}>{c.text}</span>
            {c.id === view.winnerId && (
              <span className="t-label">
                {t('results-chosen', {
                  defaultValue: 'Chosen',
                })}
              </span>
            )}
            <span className="t-meta">
              {t('results-votes', {
                defaultValue: 'Votes: {{n}}',
                n: c.votes ?? 0,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
