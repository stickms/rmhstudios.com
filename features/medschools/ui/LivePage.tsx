import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ARRIVE, useArrivingKeys } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { mergeLiveHead } from '../engine/public-read';
import { parseLiveSearch } from '../engine/search';
import { getMedLiveApi, type LiveEventDto, type MedEventTypeId } from '../medschools.contract';
import { liveQuery, resolveLiveFilters, schoolDegreeOf, schoolsQuery, type LiveFilters } from '../medschools.queries';
import { DegreeProgramSelect } from './ProgramSelect';
import { ReportedNote } from './ReportedNote';
import { SkeletonSwap } from './skeletons';
import { LiveRow } from './LiveRow';
import { useMedLabels } from './labels';

const EVENT_TYPES: readonly MedEventTypeId[] = [
  'INTERVIEW',
  'SECONDARY',
  'WAITLIST',
  'REJECTION',
  'ACCEPTANCE',
  'WITHDRAWN',
  'HOLD',
];

/** /rmh-medschool/live: the latest reported events across schools, newest first. */
export function LivePage() {
  const { t } = useTranslation('medschools');
  const { eventLabel } = useMedLabels();
  const navigate = useNavigate();
  const search = parseLiveSearch(useSearch({ strict: false }) as Record<string, unknown>);

  const schools = useQuery(schoolsQuery({}));
  const schoolDegree = schoolDegreeOf(schools.data?.schools, search.school);
  const filters = resolveLiveFilters(search, schoolDegree);

  const setSearch = (next: Partial<typeof search>) => {
    const m = { ...search, ...next };
    void navigate({
      to: '/rmh-medschool/live',
      // `program` is left out when it is the default; the route's parser puts it back.
      search: {
        ...(m.type ? { type: m.type } : {}),
        ...(m.school ? { school: m.school } : {}),
        ...(m.degree ? { degree: m.degree } : {}),
        ...(m.program !== 'ALL' ? { program: m.program } : {}),
      } as typeof search,
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <PageLayout title={t('live-title', { defaultValue: 'Live reported events' })}>
      <ReportedNote />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Select
          controlSize="sm"
          aria-label={t('live-type-label', { defaultValue: 'Event' })}
          value={search.type ?? ''}
          onChange={(e) => setSearch({ type: (e.target.value || undefined) as MedEventTypeId | undefined })}
        >
          <option value="">{t('live-type-all', { defaultValue: 'All events' })}</option>
          {EVENT_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {eventLabel(ty)}
            </option>
          ))}
        </Select>
        <Select
          controlSize="sm"
          aria-label={t('live-school-label', { defaultValue: 'School' })}
          value={search.school ?? ''}
          onChange={(e) => setSearch({ school: e.target.value || undefined })}
        >
          <option value="">{t('live-school-all', { defaultValue: 'All schools' })}</option>
          {(schools.data?.schools ?? []).map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.shortName}
            </option>
          ))}
        </Select>
        <DegreeProgramSelect
          allowNone
          {...(schoolDegree ? { schoolDegree } : {})}
          value={{ degree: filters.degree, program: search.program }}
          onChange={(v) => setSearch({ degree: v.degree, program: v.program })}
        />
      </div>
      <div className="mt-4">
        {/* Keyed by the filters: a new filter set starts with its own rows and older pages. */}
        <LiveList key={JSON.stringify(filters)} filters={filters} />
      </div>
    </PageLayout>
  );
}

function LiveList({ filters }: { filters: LiveFilters }) {
  const { t } = useTranslation('medschools');
  const query = useQuery({
    ...liveQuery(filters),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const data = query.data;

  // Head: the newest page, which every refetch merges into by id so rows already shown (and their fade) stay put.
  const [head, setHead] = useState<LiveEventDto[]>(() => data?.events ?? []);
  const [seen, setSeen] = useState(data?.events);
  if (data && data.events !== seen) {
    setSeen(data.events);
    setHead((prev) => mergeLiveHead(prev, data.events).rows);
  }
  // Tail: "Show older" pages, appended after the head. `cursor` undefined means the head's own nextCursor applies.
  const [tail, setTail] = useState<{ rows: LiveEventDto[]; cursor: string | null | undefined }>({
    rows: [],
    cursor: undefined,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderFailed, setOlderFailed] = useState(false);
  const cursor = tail.cursor !== undefined ? tail.cursor : (data?.nextCursor ?? null);

  const headIds = new Set(head.map((r) => r.id));
  const rows = [...head, ...tail.rows.filter((r) => !headIds.has(r.id))];
  const arriving = useArrivingKeys(rows.map((r) => r.id));

  const showOlder = async () => {
    if (!cursor) return;
    setLoadingOlder(true);
    setOlderFailed(false);
    try {
      const page = await api(getMedLiveApi, { query: { ...filters, cursor } });
      setTail((prev) => ({ rows: [...prev.rows, ...page.events], cursor: page.nextCursor }));
    } catch {
      setOlderFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  if (query.isError && !data) {
    return (
      <EmptyState
        title={t('live-load-failed', { defaultValue: 'Could not load the live feed.' })}
        action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
      />
    );
  }
  return (
    <SkeletonSwap ready={!!data}>
      {rows.length === 0 ? (
        <EmptyState title={t('live-empty', { defaultValue: 'Nothing reported yet.' })} />
      ) : (
        <>
          <ul className="m-0 list-none p-0">
            {rows.map((r) => (
              <LiveRow key={r.id} event={r} className={arriving(r.id) ? ARRIVE : undefined} />
            ))}
          </ul>
          {cursor ? (
            <div className="mt-4">
              <Button loading={loadingOlder} onClick={() => void showOlder()}>
                {t('live-older', { defaultValue: 'Show older' })}
              </Button>
              {olderFailed ? (
                <p className="t-meta mt-2">
                  {t('live-older-failed', { defaultValue: 'Could not load older events.' })}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </SkeletonSwap>
  );
}
