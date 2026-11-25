import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Bookmark, Clock3, TrendingUp, Waves } from 'lucide-react';
import { useArrival } from '@/components/ui/arrive';
import { useSession } from '@/components/session/session-context';
import { cn } from '@/lib/utils';
import { mineOfSearch, schoolsParam } from '../../engine/mine';
import { programsQueryValue } from '../../engine/programs';
import { pickFilter } from '../../engine/saved-filters';
import { SCHOOL_SEARCH_DEFAULTS, parseLiveSearch } from '../../engine/search';
import type { LiveSchoolDto, MedEventTypeId, MedLiveSummaryRes } from '../../medschools.contract';
import {
  indexQuery,
  listsQuery,
  liveSummaryQuery,
  schoolsQuery,
  trackerQuery,
  type LiveSummaryFilters,
} from '../../medschools.queries';
import { holdScroll } from '../hold-scroll';
import { useMedLabels } from '../labels';
import { LatestStatus } from '../LatestStatus';
import { SchoolCrest } from '../SchoolCrest';
import { StatusIcon } from '../status/StatusIcon';
import { StatusText } from '../status/StatusText';
import { statusOfEvent } from '../status/status';
import { useEffectiveView } from '../useEffectiveView';
import { useMineFilter } from '../useMineFilter';
import { useSavedFilters } from '../useSavedFilters';
import { TodaySkeleton } from './TodaySkeleton';
import { livePollInterval, useLiveSignal } from '../useLiveSignal';
import { memberSlugs, yourSchools } from './your-schools';

/**
 * The "Today" column's content (its own chunk; `TodayRail` mounts it only from 1280px). Four blocks, each a heading
 * and rows on rules: the reported events of the last 24 hours by type (a row filters the live page to that type, and
 * shows as pressed while it does), the schools with an interview wave today, the five most active schools, and,
 * signed in only, the newest public status at the member's own schools. Every query here is `enabled` only while the
 * column shows, so nothing (an invalidation included) fetches them on a phone.
 */
const NO_SUMMARY: MedLiveSummaryRes = { asOf: '', since: '', counts: [], waves: [], active: [] };

export default function TodaySummary({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('medschools');
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const search = parseLiveSearch(raw);
  const { view } = useEffectiveView('live', search);
  // The page's own filters, resolved the same way (the URL, else this device's saved ones), so the column and the feed
  // beside it always count the same events.
  const saved = useSavedFilters().page;
  const states = pickFilter(search.states, saved?.states, undefined, [] as string[]).value;
  const mine = useMineFilter(mineOfSearch(search), saved?.mine, { enabled });
  const programs = programsQueryValue(view.programs);
  const schools = mine.slugs ? schoolsParam(mine.slugs) : undefined;
  const filters: LiveSummaryFilters = {
    ...(programs ? { programs } : {}),
    ...(states.length ? { state: states.join(',') } : {}),
    ...(schools ? { schools } : {}),
  };
  // The live signal refreshes the summary (and "Your schools", through the school list); only from 1280px.
  const connected = useLiveSignal(enabled);
  // A "My schools" set with no schools asks for nothing, as the feed beside it: every block reads empty.
  const none = !!mine.slugs && mine.slugs.size === 0;
  const query = useQuery({
    ...liveSummaryQuery(filters),
    enabled: enabled && !none,
    refetchInterval: livePollInterval(connected),
    refetchIntervalInBackground: false,
  });
  const data = none ? NO_SUMMARY : query.data;
  const arrived = useArrival(!!data);

  if (query.isError && !data) {
    return (
      <p className="medapp-today__none">
        {t('live-today-failed', { defaultValue: "Could not load today's summary." })}
      </p>
    );
  }
  if (!data) return <TodaySkeleton />;
  const stale = !none && query.isPlaceholderData;
  return (
    <div
      className={cn('medapp-today__blocks medapp-swap', stale && 'medapp-stale', arrived)}
      aria-busy={stale || undefined}
    >
      <TodayBlock
        id="medschools-today-counts"
        icon={<Clock3 aria-hidden="true" size={16} />}
        title={t('live-today-counts-title', { defaultValue: 'Reported in the last 24 hours' })}
      >
        {data.counts.length === 0 ? (
          <p className="medapp-today__none">
            {t('live-today-counts-none', { defaultValue: 'Nothing reported in the last 24 hours.' })}
          </p>
        ) : (
          <CountRows counts={data.counts} selected={search.type} />
        )}
      </TodayBlock>
      {data.waves.length > 0 ? (
        <TodayBlock
          id="medschools-today-waves"
          icon={<Waves aria-hidden="true" size={16} />}
          title={t('live-today-waves-title', { defaultValue: 'Waves now' })}
        >
          <ul className="medapp-rows">
            {data.waves.map((w) => (
              <SchoolRow
                key={w.school.slug}
                school={w.school}
                meta={t('live-today-wave-row', { defaultValue: 'Interview wave · {{n}} today', n: w.count })}
              />
            ))}
          </ul>
        </TodayBlock>
      ) : null}
      {data.active.length > 0 ? (
        <TodayBlock
          id="medschools-today-active"
          icon={<TrendingUp aria-hidden="true" size={16} />}
          title={t('live-today-active-title', { defaultValue: 'Most active, last 24 hours' })}
        >
          <ul className="medapp-rows">
            {data.active.map((a) => (
              <SchoolRow
                key={a.school.slug}
                school={a.school}
                end={
                  <span className="medapp-today__count">
                    {a.count}
                    <span className="sr-only">
                      {' '}
                      {t('live-today-active-count', { defaultValue: 'reported events' })}
                    </span>
                  </span>
                }
              />
            ))}
          </ul>
        </TodayBlock>
      ) : null}
      <YourSchools enabled={enabled} programs={view.programs} />
    </div>
  );
}

function TodayBlock({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="medapp-today__block" aria-labelledby={id}>
      <h2 id={id} className="medapp-today__h medapp-headicon">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One row per reported type: the status disc and words in its colour, the count at the end. A row filters the page. */
function CountRows({
  counts,
  selected,
}: {
  counts: { eventType: MedEventTypeId; count: number }[];
  selected: MedEventTypeId | undefined;
}) {
  const { eventLabel } = useMedLabels();
  const navigate = useNavigate();
  const pick = (type: MedEventTypeId) => {
    holdScroll();
    void navigate({
      to: '/med/live',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        type: selected === type ? undefined : type,
      })) as never,
      replace: true,
      resetScroll: false,
    });
  };
  return (
    <ul className="medapp-rows">
      {counts.map(({ eventType, count }) => {
        const status = statusOfEvent(eventType);
        return (
          <li key={eventType} className="medapp-today__item">
            <button
              type="button"
              className="medapp-today__row medapp-today__btn"
              aria-pressed={selected === eventType}
              onClick={() => pick(eventType)}
            >
              <StatusIcon status={status} size="sm" />
              <StatusText status={status} className="medapp-today__label">
                {eventLabel(eventType)}
              </StatusText>
              <span className="medapp-today__count">{count}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SchoolRow({ school, meta, end }: { school: LiveSchoolDto; meta?: string; end?: ReactNode }) {
  return (
    <li className="medapp-today__item medapp-today__row">
      <SchoolCrest slug={school.slug} name={school.name} size={24} />
      <span className="medapp-today__body">
        <Link
          to="/med/$slug"
          params={{ slug: school.slug }}
          search={SCHOOL_SEARCH_DEFAULTS}
          className="medapp-today__name"
        >
          {school.name}
        </Link>
        {meta ? <span className="medapp-today__meta">{meta}</span> : null}
      </span>
      {end}
    </li>
  );
}

/**
 * Signed in only (absent, and never fetched, signed out): the newest public status at the schools on the member's
 * lists and tracker. WHICH schools is private (`me/lists`, `me/tracker`); WHAT happened is the public school list's
 * `latest`; the two meet here, in the browser, so the public endpoint never learns the member.
 */
function YourSchools({
  enabled,
  programs,
}: {
  enabled: boolean;
  programs: Parameters<typeof indexQuery>[1]['programs'];
}) {
  const { t } = useTranslation('medschools');
  const { data: session } = useSession();
  const on = enabled && !!session;
  const lists = useQuery({ ...listsQuery(), enabled: on });
  const tracker = useQuery({ ...trackerQuery(), enabled: on });
  const schools = useQuery({ ...schoolsQuery(indexQuery({}, { programs })), enabled: on });
  if (!on) return null;
  const settled = (q: { data?: unknown; isError: boolean }) => q.data !== undefined || q.isError;
  const ready = settled(lists) && settled(tracker) && settled(schools);
  const slugs = memberSlugs(tracker.data, lists.data);
  const rows = yourSchools(slugs, schools.data?.schools);
  return (
    <TodayBlock
      id="medschools-today-yours"
      icon={<Bookmark aria-hidden="true" size={16} />}
      title={t('live-today-yours-title', { defaultValue: 'Your schools' })}
    >
      {!ready ? (
        <ul className="medapp-rows" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="medapp-today__item medapp-today__row">
              <span className="medapp-skeleton medapp-skeleton--disc" />
              <span className="medapp-skeleton h-3 w-32 max-w-full" />
            </li>
          ))}
        </ul>
      ) : rows.length > 0 ? (
        <ul className="medapp-rows">
          {rows.map((s) => (
            <SchoolRow key={s.slug} school={s} end={<LatestStatus latest={s.latest} />} />
          ))}
        </ul>
      ) : (
        <p className="medapp-today__none">
          {slugs.size === 0
            ? t('live-today-yours-empty', {
                defaultValue: 'Add schools to a list or your tracker to follow them here.',
              })
            : t('live-today-yours-none', { defaultValue: 'Nothing reported at your schools yet.' })}
        </p>
      )}
    </TodayBlock>
  );
}
