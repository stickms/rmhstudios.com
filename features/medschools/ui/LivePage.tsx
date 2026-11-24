import { useNavigate, useSearch } from '@tanstack/react-router';
import { holdScroll } from './hold-scroll';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedSelect } from './controls/MedSelect';
import { ARRIVE } from '@/components/ui/arrive';
import { parseLiveSearch } from '../engine/search';
import type { MedEventTypeId } from '../medschools.contract';
import {
  liveSearchOf,
  resolveLiveFilters,
  schoolDegreeOf,
  schoolsQuery,
  type LiveFilters,
} from '../medschools.queries';
import { ProgramMultiSelect, StateMultiSelect } from './ProgramMultiSelect';
import { useLiveFeed } from './useLiveFeed';
import { PrefsNote } from './PrefsNote';
import { useEffectiveView } from './useEffectiveView';
import { SkeletonSwap } from './skeletons';
import { LiveRow } from './LiveRow';
import { useMedLabels } from './labels';
import { PageHead } from './shell/PageHead';
import { MedEmpty } from './MedEmpty';
import { MedButton } from './controls/MedButton';

const EVENT_TYPES: readonly MedEventTypeId[] = [
  'INTERVIEW',
  'SECONDARY',
  'WAITLIST',
  'REJECTION',
  'ACCEPTANCE',
  'WITHDRAWN',
  'HOLD',
];

/** /med/live: the latest reported events across schools, newest first. */
export function LivePage() {
  const { t } = useTranslation('medschools');
  const { eventLabel } = useMedLabels();
  const navigate = useNavigate();
  const search = parseLiveSearch(useSearch({ strict: false }) as Record<string, unknown>);

  const schools = useQuery(schoolsQuery({}));
  // The URL where it speaks, the viewer's preferences where it is silent (D13/D14).
  const { view, setSearch: setView } = useEffectiveView('live', search);
  const schoolDegree = schoolDegreeOf(schools.data?.schools, search.school);
  const filters = resolveLiveFilters(liveSearchOf(search, view), schoolDegree);

  const setSearch = (next: {
    type?: MedEventTypeId | undefined;
    school?: string | undefined;
    states?: string[] | undefined;
  }) => {
    const m = { ...search, ...next };
    holdScroll();
    void navigate({
      to: '/med/live',
      // The preference key (`programs`) stays as the URL had them; only the page's own keys are rebuilt.
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        type: m.type || undefined,
        school: m.school || undefined,
        state: m.states?.length ? m.states.join(',') : undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <>
      <PageHead title={t('live-title', { defaultValue: 'Live reported events' })} />
      <div className="medapp-filters">
        <div className="medapp-toolbar">
          <MedSelect
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
          </MedSelect>
          <MedSelect
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
          </MedSelect>
          <StateMultiSelect
            states={schools.data?.states ?? []}
            value={search.states ?? []}
            onChange={(states) => setSearch({ states })}
          />
          <ProgramMultiSelect value={view.programs} onChange={(programs) => setView({ programs })} />
        </div>
        <PrefsNote fromPrefs={view.fromPrefs} />
      </div>
      {/* One feed across filter changes: the old rows stay, dimmed, until the new filter's first page replaces them. */}
      <div className="medapp-fill">
        <LiveList filters={filters} />
      </div>
    </>
  );
}

function LiveList({ filters }: { filters: LiveFilters }) {
  const { t } = useTranslation('medschools');
  const { query, data, rows, arriving, cursor, loadingOlder, olderFailed, showOlder, stale } = useLiveFeed(filters);

  if (query.isError && !data) {
    return (
      <MedEmpty
        title={t('live-load-failed', { defaultValue: 'Could not load the live feed.' })}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <SkeletonSwap ready={!!data} stale={stale}>
      {rows.length === 0 ? (
        <MedEmpty title={t('live-empty', { defaultValue: 'Nothing reported yet.' })} />
      ) : (
        <>
          <div className="medapp-panel">
            <ul className="medapp-rows">
              {rows.map((r) => (
                <LiveRow key={r.id} event={r} className={arriving(r.id) ? ARRIVE : undefined} />
              ))}
            </ul>
          </div>
          {cursor ? (
            <div className="medapp-stack mt-4 items-start">
              <MedButton loading={loadingOlder} onClick={() => void showOlder()}>
                {t('live-older', { defaultValue: 'Show older' })}
              </MedButton>
              {olderFailed ? (
                <p className="medapp-note">
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
