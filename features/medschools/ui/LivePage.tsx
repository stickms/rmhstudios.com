import { useNavigate, useSearch } from '@tanstack/react-router';
import { holdScroll } from './hold-scroll';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedSelect } from './controls/MedSelect';
import { ARRIVE } from '@/components/ui/arrive';
import { mineOfSearch, mineToSearch, schoolsParam, type MineChoice } from '../engine/mine';
import { pickFilter } from '../engine/saved-filters';
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
import { MineSelect, MineSignedOutNote, useMineEmptyText } from './MineSelect';
import { clearSavedFilters, saveFilters, useSavedFilters } from './useSavedFilters';
import { useMineFilter } from './useMineFilter';

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
  // The URL where it speaks, then this device's saved filters (shared with the index), then the viewer's preferences.
  const { view, setSearch: setView } = useEffectiveView('live', search);
  const saved = useSavedFilters().page;
  const states = pickFilter(search.states, saved?.states, undefined, [] as string[]);
  const mine = useMineFilter(mineOfSearch(search), saved?.mine);
  const schoolDegree = schoolDegreeOf(schools.data?.schools, search.school);
  // "My schools" reaches the feed as the explicit public `schools=` list (sorted, capped): never a user.
  const filters = resolveLiveFilters(
    liveSearchOf({ ...search, states: states.value }, view, mine.slugs ? schoolsParam(mine.slugs) : undefined),
    schoolDegree,
  );
  const mineEmpty = useMineEmptyText();
  const fromDevice = view.fromDevice || states.from === 'device' || mine.fromDevice;

  const setSearch = (next: {
    type?: MedEventTypeId | undefined;
    school?: string | undefined;
    states?: string[] | undefined;
    mine?: MineChoice | null;
  }) => {
    holdScroll();
    void navigate({
      to: '/med/live',
      // The preference key (`programs`) stays as the URL had it, and so does every key this change does not name.
      search: ((prev: Record<string, unknown>) => {
        const out: Record<string, unknown> = { ...prev };
        if ('type' in next) out.type = next.type || undefined;
        if ('school' in next) out.school = next.school || undefined;
        if ('states' in next) out.state = next.states?.length ? next.states.join(',') : undefined;
        if ('mine' in next) Object.assign(out, mineToSearch(next.mine ?? null));
        return out;
      }) as never,
      replace: true,
      resetScroll: false,
    });
  };
  // Changing a filter remembers it on this device (the same set as the index); "all" forgets it.
  const setStates = (next: string[]) => {
    saveFilters('page', { states: next });
    setSearch({ states: next });
  };
  const setMine = (next: MineChoice | null) => {
    saveFilters('page', { mine: next });
    setSearch({ mine: next });
  };

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
                onChange: (school) => setSearch({ school }),
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
          <StateMultiSelect states={schools.data?.states ?? []} value={states.value} onChange={setStates} />
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
