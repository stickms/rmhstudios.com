import { useState } from 'react';
import { holdScroll } from './hold-scroll';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedSearch } from './controls/MedSearch';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { mineOfSearch, mineToSearch, type MineChoice } from '../engine/mine';
import { schoolProgramOf } from '../engine/programs';
import { pickFilter } from '../engine/saved-filters';
import { Q_MAX, SCHOOL_SEARCH_DEFAULTS, parseIndexSearch } from '../engine/search';
import { indexQuery, schoolsQuery } from '../medschools.queries';
import { MineSelect, MineSignedOutNote, useMineEmptyText } from './MineSelect';
import { PrefsNote } from './PrefsNote';
import { clearSavedFilters, saveFilters, useSavedFilters } from './useSavedFilters';
import { useMineFilter } from './useMineFilter';
import { useEffectiveView } from './useEffectiveView';
import { ProgramMultiSelect, StateMultiSelect } from './ProgramMultiSelect';
import { SaveToList } from './SaveToList';
import { SchoolCrest } from './SchoolCrest';
import { SkeletonSwap } from './skeletons';
import { useLiveSignal } from './useLiveSignal';
import { useMedLabels } from './labels';
import { LatestStatus } from './LatestStatus';
import { MedEmpty } from './MedEmpty';

/**
 * /med: the school index. A paper panel of rows (the redesign's list, D14). A school with no
 * reported figure prints nothing in the figure slot: ~200 "no data" lines were noise.
 */
export function IndexPage() {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const { sourceName } = useMedLabels();
  const navigate = useNavigate();
  const search = parseIndexSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const nf = new Intl.NumberFormat(locale);
  const [text, setText] = useState(search.q ?? '');

  // The URL where it speaks, then this device's saved filters, then the viewer's preferences (D13/D14).
  const { view, setSearch: setView } = useEffectiveView('index', search);
  const saved = useSavedFilters().page;
  const states = pickFilter(search.states, saved?.states, undefined, [] as string[]);
  const mine = useMineFilter(mineOfSearch(search), saved?.mine);
  const schools = useQuery(schoolsQuery(indexQuery({ q: search.q, states: states.value }, view)));
  // The live signal refetches the list in place (each row's newest status), at every width; the rail is separate.
  useLiveSignal();
  const mineEmpty = useMineEmptyText();

  const setSearch = (next: { q?: string | undefined; states?: string[] | undefined; mine?: MineChoice | null }) => {
    holdScroll();
    void navigate({
      to: '/med',
      // The preference key (`programs`) stays as the URL had it, and so does every key this change does not name: a
      // filter that came from this device is not frozen into the address by a search.
      search: ((prev: Record<string, unknown>) => {
        const out: Record<string, unknown> = { ...prev };
        if ('q' in next) out.q = next.q || undefined;
        // A comma list of sorted codes (`state=CA,NY`); none is every state.
        if ('states' in next) out.state = next.states?.length ? next.states.join(',') : undefined;
        if ('mine' in next) Object.assign(out, mineToSearch(next.mine ?? null));
        return out;
      }) as never,
      replace: true,
      resetScroll: false,
    });
  };
  const pushQuery = useDebouncedCallback((q: string) => setSearch({ q: q.trim() || undefined }), 250);
  // Changing a filter remembers it on this device; "all" forgets it.
  const setStates = (next: string[]) => {
    saveFilters('page', { states: next });
    setSearch({ states: next });
  };
  const setMine = (next: MineChoice | null) => {
    saveFilters('page', { mine: next });
    setSearch({ mine: next });
  };

  // "My schools" (D15, owner 2026-11-24): a client filter over the schools the public endpoint already returned, so
  // the public cache key never carries a user. A signed-out viewer of a `?list=` link sees every school and is told why.
  const listSlugs = mine.slugs;
  const rows = (schools.data?.schools ?? []).filter((s) => !listSlugs || listSlugs.has(s.slug));
  const fromDevice = view.fromDevice || states.from === 'device' || mine.fromDevice;

  return (
    <div className="medapp-index medapp-fill">
      <div className="medapp-filters">
        <div className="medapp-toolbar">
          <MedSearch
            containerClassName="medapp-toolbar__grow"
            aria-label={t('index-search-label', { defaultValue: 'Search schools' })}
            placeholder={t('index-search-placeholder', { defaultValue: 'Search schools' })}
            maxLength={Q_MAX}
            value={text}
            onValueChange={(v) => {
              setText(v);
              pushQuery(v);
            }}
          />
          <StateMultiSelect states={schools.data?.states ?? []} value={states.value} onChange={setStates} />
          <ProgramMultiSelect value={view.programs} onChange={(programs) => setView({ programs })} />
          {mine.signedIn ? <MineSelect value={mine.choice} lists={mine.lists} onChange={setMine} /> : null}
        </div>
        {mine.signedIn ? null : <MineSignedOutNote search={search} />}
        <PrefsNote fromPrefs={view.fromPrefs} fromDevice={fromDevice} onClearSaved={() => clearSavedFilters('page')} />
      </div>

      <div className="medapp-fill">
        {schools.isError ? (
          <MedEmpty
            title={t('index-load-failed', { defaultValue: 'Could not load the schools.' })}
            onRetry={() => void schools.refetch()}
          />
        ) : (
          <SkeletonSwap ready={!!schools.data} stale={schools.isPlaceholderData}>
            {schools.data && rows.length === 0 ? (
              <MedEmpty
                title={
                  mine.choice && listSlugs?.size === 0
                    ? mineEmpty(mine.choice)
                    : t('index-empty', { defaultValue: 'No schools match.' })
                }
              />
            ) : (
              <ul className="medapp-panel medapp-rows">
                {rows.map((s) => (
                  <li key={s.slug} className="medapp-row medapp-schoolrow">
                    <SchoolCrest slug={s.slug} name={s.name} size={40} />
                    <div className="medapp-row__body">
                      <p className="medapp-row__name">
                        <Link to="/med/$slug" params={{ slug: s.slug }} search={SCHOOL_SEARCH_DEFAULTS}>
                          {s.name}
                        </Link>
                      </p>
                      <p className="medapp-row__meta">
                        {t('index-school-meta', {
                          defaultValue: '{{degree}} · {{city}}, {{state}}',
                          degree: s.degree,
                          city: s.city,
                          state: s.state,
                        })}
                      </p>
                      {s.reported ? (
                        <p className="medapp-row__meta">
                          {t('index-reported', {
                            count: s.reported.count,
                            n: nf.format(s.reported.count),
                            defaultValue_one: '{{n}} reported invite, {{source}}',
                            defaultValue_other: '{{n}} reported invites, {{source}}',
                            defaultValue: '{{n}} reported invites, {{source}}',
                            source: sourceName(s.reported.source),
                          })}
                        </p>
                      ) : null}
                    </div>
                    {s.latest ? <LatestStatus latest={s.latest} /> : null}
                    <SaveToList
                      school={{ slug: s.slug, name: s.name }}
                      program={schoolProgramOf(view.programs, s.degree)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SkeletonSwap>
        )}
      </div>
    </div>
  );
}
