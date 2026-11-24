import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
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
import { ProgramSetToggles } from './ProgramSetToggles';
import { useLiveFeed } from './useLiveFeed';
import { PrefsNote } from './PrefsNote';
import { useEffectiveView } from './useEffectiveView';
import { SkeletonSwap } from './skeletons';
import { LiveRow } from './LiveRow';
import { useMedLabels } from './labels';
import { PageHead } from './shell/PageHead';

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
  // The URL where it speaks, the viewer's preferences where it is silent (D13/D14).
  const { view, setSearch: setView } = useEffectiveView('live', search);
  const schoolDegree = schoolDegreeOf(schools.data?.schools, search.school);
  const filters = resolveLiveFilters(liveSearchOf(search, view), schoolDegree);

  const setSearch = (next: { type?: MedEventTypeId | undefined; school?: string | undefined }) => {
    const m = { ...search, ...next };
    void navigate({
      to: '/rmh-medschool/live',
      // The preference key (`programs`) stays as the URL had them; only the page's own keys are rebuilt.
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        type: m.type || undefined,
        school: m.school || undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <>
      <PageHead title={t('live-title', { defaultValue: 'Live reported events' })} />
      <div className="medapp-toolbar">
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
      </div>
      <ProgramSetToggles value={view.programs} onChange={(programs) => setView({ programs })} />
      <PrefsNote fromPrefs={view.fromPrefs} />
      <div className="mt-4">
        {/* Keyed by the filters: a new filter set starts with its own rows and older pages. */}
        <LiveList key={JSON.stringify(filters)} filters={filters} />
      </div>
    </>
  );
}

function LiveList({ filters }: { filters: LiveFilters }) {
  const { t } = useTranslation('medschools');
  const { query, data, rows, arriving, cursor, loadingOlder, olderFailed, showOlder } = useLiveFeed(filters);

  if (query.isError && !data) {
    return (
      <div className="medapp-panel medapp-panel--padded">
        <p className="medapp-empty">{t('live-load-failed', { defaultValue: 'Could not load the live feed.' })}</p>
        <button type="button" className="medapp-chip" onClick={() => void query.refetch()}>
          {t('retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    );
  }
  return (
    <SkeletonSwap ready={!!data}>
      {rows.length === 0 ? (
        <div className="medapp-panel">
          <p className="medapp-empty">{t('live-empty', { defaultValue: 'Nothing reported yet.' })}</p>
        </div>
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
            <div className="mt-4">
              <button
                type="button"
                className="medapp-chip"
                aria-busy={loadingOlder}
                disabled={loadingOlder}
                onClick={() => void showOlder()}
              >
                {t('live-older', { defaultValue: 'Show older' })}
              </button>
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
