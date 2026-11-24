import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import type { MedEventTypeId } from '../../medschools.contract';
import { MedSearch } from '../controls/MedSearch';
import { ARRIVE } from '@/components/ui/arrive';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useSentinel } from '@/hooks/useSentinel';
import { parsePrograms, programsQueryValue, type ProgramKey } from '../../engine/programs';
import { Q_MAX } from '../../engine/search';
import type { LiveFilters } from '../../medschools.queries';
import { LiveRow } from '../LiveRow';
import { EventTypeMultiSelect, LIVE_EVENT_TYPES, ProgramMultiSelect } from '../ProgramMultiSelect';
import { useEffectiveView } from '../useEffectiveView';
import { useLiveFeed } from '../useLiveFeed';

const PAGE = 15;

/**
 * The live activity rail: a paper panel in the app frame's right column on every /rmh-medschool page (>= 1280px). The
 * newest reported events, a search over school and state, the event types and the programs as two compact
 * multi-selects on one line, the 60 s head refetch with the M9 fade for new rows, and older pages loaded as the end of
 * the list scrolls into view (one `IntersectionObserver`, on the sentinel only: it loads data, it decorates nothing).
 * The heading and the filters stay at the top of the rail while the list scrolls under them. The filters here are the
 * rail's own; the programs start from the page's `programs` or the viewer's preferences.
 */
export default function ActivityRail() {
  const { t } = useTranslation('medschools');
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const { view } = useEffectiveView('live', { programs: parsePrograms(raw.programs) });
  const [programs, setPrograms] = useState<ProgramKey[] | null>(null);
  const [types, setTypes] = useState<MedEventTypeId[]>([...LIVE_EVENT_TYPES]);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const push = useDebouncedCallback((v: string) => setQ(v.trim()), 250);

  const set = programs ?? view.programs;
  const qp = programsQueryValue(set);
  const allTypes = types.length === LIVE_EVENT_TYPES.length;
  const filters: LiveFilters = {
    limit: PAGE,
    ...(q ? { q } : {}),
    ...(allTypes ? {} : { types: types.map((ty) => ty.toLowerCase()).join(',') }),
    ...(qp ? { programs: qp } : {}),
  };

  return (
    <section aria-labelledby="medschools-rail-heading" className="medapp-panel medapp-panel--rail">
      <div className="medapp-rail-top">
        <div className="medapp-rail-head">
          <h2 id="medschools-rail-heading" className="medapp-headicon">
            <Activity aria-hidden="true" className="size-4" />
            {t('rail-title', { defaultValue: 'Live activity' })}
          </h2>
          <Link to="/rmh-medschool/live" className="medapp-link medapp-rail-open">
            {t('rail-open', { defaultValue: 'Open live page' })}
          </Link>
        </div>
        <MedSearch
          aria-label={t('rail-search-label', { defaultValue: 'Search activity' })}
          placeholder={t('rail-search-placeholder', { defaultValue: 'School or state' })}
          maxLength={Q_MAX}
          value={text}
          onValueChange={(v) => {
            setText(v);
            push(v);
          }}
        />
        <div className="medapp-rail-filters">
          <EventTypeMultiSelect compact value={types} onChange={setTypes} />
          <ProgramMultiSelect compact value={set} onChange={setPrograms} />
        </div>
      </div>
      <RailFeed filters={filters} />
    </section>
  );
}

function RailFeed({ filters }: { filters: LiveFilters }) {
  const { t } = useTranslation('medschools');
  const { query, data, rows, arriving, cursor, loadingOlder, olderFailed, showOlder, stale } = useLiveFeed(filters);
  const more = useSentinel(() => void showOlder(), {
    enabled: !!cursor && !loadingOlder && !olderFailed,
    watch: rows.length,
    rootMargin: '200px 0px',
  });

  if (query.isError && !data) {
    return <p className="medapp-sub">{t('live-load-failed', { defaultValue: 'Could not load the live feed.' })}</p>;
  }
  if (!data) return <p className="medapp-sub">{t('rail-loading', { defaultValue: 'Loading' })}</p>;
  if (rows.length === 0) {
    return <p className="medapp-sub">{t('rail-empty', { defaultValue: 'Nothing matches yet.' })}</p>;
  }
  return (
    <div className={stale ? 'medapp-swap medapp-stale' : 'medapp-swap'} aria-busy={stale || undefined}>
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
