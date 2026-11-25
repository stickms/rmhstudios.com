import { lazy, useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Activity, SquareArrowOutUpRight } from 'lucide-react';
import type { MedEventTypeId } from '../../medschools.contract';
import { MedSearch } from '../controls/MedSearch';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { schoolsParam, type MineChoice } from '../../engine/mine';
import { parsePrograms, programsQueryValue, type ProgramKey } from '../../engine/programs';
import { Q_MAX } from '../../engine/search';
import type { LiveFilters } from '../../medschools.queries';
import { EventTypeMultiSelect, LIVE_EVENT_TYPES, ProgramMultiSelect } from '../ProgramMultiSelect';
import { MineSelect } from '../MineSelect';
import { useEffectiveView } from '../useEffectiveView';
import { useMineFilter } from '../useMineFilter';
import { saveFilters, useSavedFilters } from '../useSavedFilters';
import { RailSkeleton } from './RailSkeleton';

// The list and its live query are their own chunk, fetched only where the rail is displayed (>= 1280px).
const RailFeed = lazy(() => import('./RailFeed'));

const PAGE = 15;

/**
 * The live activity rail: a paper panel in the app frame's right column on every /med page (>= 1280px). The frame
 * (heading, the open-live link, the search and the two filters) and a static skeleton list are in the server HTML on
 * every width, and CSS hides the column below 1280px, so the page's layout is right from the first paint (owner
 * 2026-11-24). Only at 1280px and up does the client load the list's chunk and start the live query. The
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
  // The rail's own filters (owner 2026-11-24): this visit's pick, else what this device saved for the rail, else the
  // page's program set (its URL, saved filters or preferences) and every event type. A pick is saved at once; "all"
  // forgets it. The rail keeps a scope of its own, so a change here never moves the page beside it.
  const saved = useSavedFilters().rail;
  const [programs, setPrograms] = useState<ProgramKey[] | null>(null);
  const [picked, setPicked] = useState<MedEventTypeId[] | null>(null);
  const [mineChoice, setMineChoice] = useState<MineChoice | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const shown = useMediaQuery('(min-width: 1280px)');
  const push = useDebouncedCallback((v: string) => setQ(v.trim()), 250);
  // The private reads behind "My schools" run only where the rail shows (>= 1280px), signed in.
  const mine = useMineFilter(mineChoice, saved?.mine, { enabled: shown });

  const set = programs ?? saved?.programs ?? view.programs;
  const types = picked ?? saved?.types ?? [...LIVE_EVENT_TYPES];
  const qp = programsQueryValue(set);
  const allTypes = types.length === LIVE_EVENT_TYPES.length;
  const schools = mine.slugs ? schoolsParam(mine.slugs) : undefined;
  const filters: LiveFilters = {
    limit: PAGE,
    ...(q ? { q } : {}),
    ...(allTypes ? {} : { types: types.map((ty) => ty.toLowerCase()).join(',') }),
    ...(qp ? { programs: qp } : {}),
    ...(schools ? { schools } : {}),
  };
  const noSchools = !!mine.choice && mine.slugs?.size === 0;

  return (
    <section aria-labelledby="medschools-rail-heading" className="medapp-panel medapp-panel--rail">
      <div className="medapp-rail-top">
        <div className="medapp-rail-head">
          <h2 id="medschools-rail-heading" className="medapp-headicon">
            <Activity aria-hidden="true" className="size-4" />
            {t('rail-title', { defaultValue: 'Live activity' })}
          </h2>
          <Link
            to="/med/live"
            className="medapp-round"
            aria-label={t('rail-open-icon', { defaultValue: 'Open live activity' })}
            title={t('rail-open-icon', { defaultValue: 'Open live activity' })}
          >
            <SquareArrowOutUpRight aria-hidden="true" size={18} />
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
          <EventTypeMultiSelect
            compact
            value={types}
            onChange={(next) => {
              setPicked(next);
              saveFilters('rail', { types: next });
            }}
          />
          <ProgramMultiSelect
            compact
            value={set}
            onChange={(next) => {
              setPrograms(next);
              saveFilters('rail', { programs: next });
            }}
          />
          {mine.signedIn ? (
            <MineSelect
              compact
              containerClassName="medapp-rail-filters__wide"
              value={mine.choice}
              lists={mine.lists}
              onChange={(next) => {
                setMineChoice(next);
                saveFilters('rail', { mine: next });
              }}
            />
          ) : null}
        </div>
      </div>
      {shown && noSchools ? (
        <p className="medapp-sub">{t('rail-empty', { defaultValue: 'Nothing matches yet.' })}</p>
      ) : shown ? (
        <ArrivalSuspense fallback={<RailSkeleton />} wrap={false}>
          <RailFeed filters={filters} />
        </ArrivalSuspense>
      ) : (
        <RailSkeleton />
      )}
    </section>
  );
}
