import { useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedSelect } from './controls/MedSelect';
import { ARRIVE } from '@/components/ui/arrive';
import { schoolsParam } from '../engine/mine';
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
import { useSchoolListFilters } from './useSchoolListFilters';
import { SkeletonSwap } from './skeletons';
import { LiveRow } from './LiveRow';
import { useMedLabels } from './labels';
import { PageHead } from './shell/PageHead';
import { MedEmpty } from './MedEmpty';
import { MedButton } from './controls/MedButton';
import { MineSelect, MineSignedOutNote, useMineEmptyText } from './MineSelect';
import { clearSavedFilters } from './useSavedFilters';

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
  const search = parseLiveSearch(useSearch({ strict: false }) as Record<string, unknown>);

  const schools = useQuery(schoolsQuery({}));
  const { view, setView, states, mine, fromDevice, setSearch, setStates, setMine } = useSchoolListFilters('live', search);
  const schoolDegree = schoolDegreeOf(schools.data?.schools, search.school);
  // "My schools" reaches the feed as the explicit public `schools=` list (sorted, capped): never a user.
  const filters = resolveLiveFilters(
    liveSearchOf({ ...search, states }, view, mine.slugs ? schoolsParam(mine.slugs) : undefined),
    schoolDegree,
  );
  const mineEmpty = useMineEmptyText();

  // One column at the index's 16px rhythm (owner 2026-11-24): title, filters and list read as one block.
  return (
    <div className="medapp-index medapp-fill">
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
          {mine.signedIn ? (
            <MineSelect
              value={mine.choice}
              lists={mine.lists}
              onChange={setMine}
              schools={{
                options: schools.data?.schools ?? [],
                value: search.school,
                onChange: (school) => setSearch({ school: school || undefined }),
              }}
            />
          ) : (
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
          )}
          <StateMultiSelect states={schools.data?.states ?? []} value={states} onChange={setStates} />
          <ProgramMultiSelect value={view.programs} onChange={(programs) => setView({ programs })} />
        </div>
        {mine.signedIn ? null : <MineSignedOutNote search={search} />}
        <PrefsNote fromPrefs={view.fromPrefs} fromDevice={fromDevice} onClearSaved={() => clearSavedFilters('page')} />
      </div>
      {/* One feed across filter changes: the old rows stay, dimmed, until the new filter's first page replaces them. */}
      <div className="medapp-fill">
        {mine.choice && mine.slugs?.size === 0 ? (
          <MedEmpty title={mineEmpty(mine.choice)} />
        ) : (
          <LiveList filters={filters} />
        )}
      </div>
    </div>
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
