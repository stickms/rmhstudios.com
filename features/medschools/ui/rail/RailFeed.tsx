import { useTranslation } from 'react-i18next';
import { ARRIVE, useArrival } from '@/components/ui/arrive';
import { useSentinel } from '@/hooks/useSentinel';
import { cn } from '@/lib/utils';
import type { LiveFilters } from '../../medschools.queries';
import { LiveRow } from '../LiveRow';
import { useLiveFeed } from '../useLiveFeed';
import { RailSkeleton } from './RailSkeleton';

/**
 * The rail's list: its own chunk, loaded and queried only where the rail shows (>= 1280px; `ActivityRail`). Until the
 * first page lands it is the same static skeleton the server drew, then the rows fade in (M9); a later refetch keeps
 * the rows on screen, dimmed, and never goes back to the skeleton.
 */
export default function RailFeed({ filters }: { filters: LiveFilters }) {
  const { t } = useTranslation('medschools');
  const { query, data, rows, arriving, cursor, loadingOlder, olderFailed, showOlder, stale } = useLiveFeed(filters);
  const arrived = useArrival(!!data);
  const more = useSentinel(() => void showOlder(), {
    enabled: !!cursor && !loadingOlder && !olderFailed,
    watch: rows.length,
    rootMargin: '200px 0px',
  });

  if (query.isError && !data) {
    return <p className="medapp-sub">{t('live-load-failed', { defaultValue: 'Could not load the live feed.' })}</p>;
  }
  if (!data) return <RailSkeleton />;
  if (rows.length === 0) {
    return <p className="medapp-sub">{t('rail-empty', { defaultValue: 'Nothing matches yet.' })}</p>;
  }
  return (
    <div className={cn('medapp-swap', stale && 'medapp-stale', arrived)} aria-busy={stale || undefined}>
      <ul className="medapp-rows">
        {rows.map((r) => (
          <LiveRow key={r.id} event={r} compact className={arriving(r.id) ? ARRIVE : undefined} />
        ))}
      </ul>
      {cursor ? <div ref={more} aria-hidden="true" className="h-px" /> : null}
      {loadingOlder ? <p className="medapp-sub">{t('rail-loading', { defaultValue: 'Loading' })}</p> : null}
      {olderFailed ? (
        <button type="button" className="medapp-link text-start text-xs" onClick={() => void showOlder()}>
          {t('rail-older-retry', { defaultValue: 'Could not load more. Try again' })}
        </button>
      ) : null}
    </div>
  );
}
