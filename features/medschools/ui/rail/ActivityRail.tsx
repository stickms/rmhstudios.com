import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { ARRIVE } from '@/components/ui/arrive';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useSentinel } from '@/hooks/useSentinel';
import { parsePrograms, programsQueryValue, type ProgramKey } from '../../engine/programs';
import { Q_MAX } from '../../engine/search';
import type { LiveFilters } from '../../medschools.queries';
import { LiveRow } from '../LiveRow';
import { ProgramSetToggles } from '../ProgramSetToggles';
import { useEffectiveView } from '../useEffectiveView';
import { useLiveFeed } from '../useLiveFeed';
import { useMedLabels } from '../labels';

/** The rail's event filter: one option per type, plus "Decisions" for the three outcomes at once. */
const KINDS = ['', 'INTERVIEW', 'SECONDARY', 'ACCEPTANCE', 'WAITLIST', 'REJECTION', 'DECISIONS'] as const;
type Kind = (typeof KINDS)[number];
const KIND_TYPES: Record<Exclude<Kind, ''>, string> = {
  INTERVIEW: 'interview',
  SECONDARY: 'secondary',
  ACCEPTANCE: 'acceptance',
  WAITLIST: 'waitlist',
  REJECTION: 'rejection',
  DECISIONS: 'acceptance,waitlist,rejection',
};
const PAGE = 15;

/**
 * The live activity rail: a paper panel in the app frame's right column on every /rmh-medschool page (>= 1280px). The newest reported
 * events, a search over school, state, event and program, the 60 s head refetch with the M9 fade for new rows, and older
 * pages loaded as the end of the list scrolls into view (one `IntersectionObserver`, on the sentinel only: it loads
 * data, it decorates nothing). The filters here are the rail's own; the program toggles start from the page's `programs`
 * or the viewer's preferences.
 */
export default function ActivityRail() {
  const { t } = useTranslation('medschools');
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const { view } = useEffectiveView('live', { programs: parsePrograms(raw.programs) });
  const [programs, setPrograms] = useState<ProgramKey[] | null>(null);
  const [kind, setKind] = useState<Kind>('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const { eventLabel } = useMedLabels();
  const push = useDebouncedCallback((v: string) => setQ(v.trim()), 250);

  const set = programs ?? view.programs;
  const qp = programsQueryValue(set);
  const filters: LiveFilters = {
    limit: PAGE,
    ...(q ? { q } : {}),
    ...(kind ? { types: KIND_TYPES[kind] } : {}),
    ...(qp ? { programs: qp } : {}),
  };

  return (
    <section aria-labelledby="medschools-rail-heading" className="medapp-panel medapp-panel--rail flex flex-col gap-3">
      <div className="medapp-rail-head">
        <h2 id="medschools-rail-heading">{t('rail-title', { defaultValue: 'Live activity' })}</h2>
        <Link to="/rmh-medschool/live" className="medapp-link text-xs">
          {t('rail-open', { defaultValue: 'Open live page' })}
        </Link>
      </div>
      <SearchField
        aria-label={t('rail-search-label', { defaultValue: 'Search activity' })}
        placeholder={t('rail-search-placeholder', { defaultValue: 'School or state' })}
        maxLength={Q_MAX}
        value={text}
        onValueChange={(v) => {
          setText(v);
          push(v);
        }}
      />
      <Select
        controlSize="sm"
        aria-label={t('rail-kind-label', { defaultValue: 'Event' })}
        value={kind}
        onChange={(e) => setKind(e.target.value as Kind)}
      >
        <option value="">{t('live-type-all', { defaultValue: 'All events' })}</option>
        {KINDS.filter((k) => k && k !== 'DECISIONS').map((k) => (
          <option key={k} value={k}>
            {eventLabel(k as Exclude<Kind, '' | 'DECISIONS'>)}
          </option>
        ))}
        <option value="DECISIONS">{t('rail-kind-decisions', { defaultValue: 'Decisions' })}</option>
      </Select>
      <ProgramSetToggles size="xs" className="gap-1" value={set} onChange={setPrograms} />
      {/* Keyed by the filters: a new filter set starts with its own rows and older pages. */}
      <RailFeed key={JSON.stringify(filters)} filters={filters} />
    </section>
  );
}

function RailFeed({ filters }: { filters: LiveFilters }) {
  const { t } = useTranslation('medschools');
  const { query, data, rows, arriving, cursor, loadingOlder, olderFailed, showOlder } = useLiveFeed(filters);
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
    <>
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
    </>
  );
}
