import { useState } from 'react';
import { holdScroll } from './hold-scroll';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedSearch } from './controls/MedSearch';
import { MedSelect } from './controls/MedSelect';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { schoolProgramOf } from '../engine/programs';
import { Q_MAX, SCHOOL_SEARCH_DEFAULTS, parseIndexSearch } from '../engine/search';
import { indexQuery, listsQuery, schoolsQuery } from '../medschools.queries';
import { useSession } from '@/components/session/session-context';
import { PrefsNote } from './PrefsNote';
import { useEffectiveView } from './useEffectiveView';
import { ProgramMultiSelect, StateMultiSelect } from './ProgramMultiSelect';
import { SaveToList } from './SaveToList';
import { SchoolCrest } from './SchoolCrest';
import { SkeletonSwap } from './skeletons';
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

  // The URL where it speaks, the viewer's preferences where it is silent (D13/D14).
  const { view, setSearch: setView } = useEffectiveView('index', search);
  const schools = useQuery(schoolsQuery(indexQuery(search, view)));
  const { data: session } = useSession();
  const signedIn = !!session;
  const lists = useQuery({ ...listsQuery(), enabled: signedIn });
  const myLists = signedIn ? (lists.data?.lists ?? []) : [];

  const setSearch = (next: { q?: string | undefined; states?: string[] | undefined; list?: string | undefined }) => {
    const merged = { ...search, ...next };
    holdScroll();
    void navigate({
      to: '/med',
      // The preference key (`programs`) stays as the URL had it; only the page's own keys are rebuilt.
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        q: merged.q || undefined,
        // A comma list of sorted codes (`state=CA,NY`); none is every state.
        state: merged.states?.length ? merged.states.join(',') : undefined,
        list: merged.list || undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    });
  };
  const pushQuery = useDebouncedCallback((q: string) => setSearch({ q: q.trim() || undefined }), 250);

  // "Show my lists only" (D15): a client filter over the schools the public endpoint already returned, so the public
  // cache key does not change. A signed-out viewer of a `?list=` link sees the unfiltered index and is told why.
  const listSlugs = (() => {
    if (!search.list || !signedIn || myLists.length === 0) return null;
    const chosen = search.list === 'all' ? myLists : myLists.filter((l) => l.id === search.list);
    if (chosen.length === 0 && search.list !== 'all') return null;
    return new Set(chosen.flatMap((l) => l.items.map((i) => i.school.slug)));
  })();
  const rows = (schools.data?.schools ?? []).filter((s) => !listSlugs || listSlugs.has(s.slug));

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
          <StateMultiSelect
            states={schools.data?.states ?? []}
            value={search.states ?? []}
            onChange={(states) => setSearch({ states })}
          />
          <ProgramMultiSelect value={view.programs} onChange={(programs) => setView({ programs })} />
          {myLists.length > 0 ? (
            <MedSelect
              aria-label={t('index-list-label', { defaultValue: 'My lists' })}
              value={listSlugs || search.list === 'all' ? (search.list ?? '') : ''}
              onChange={(e) => setSearch({ list: e.target.value || undefined })}
            >
              <option value="">{t('index-list-none', { defaultValue: 'All schools' })}</option>
              <option value="all">{t('index-list-all', { defaultValue: 'All my lists' })}</option>
              {myLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </MedSelect>
          ) : null}
        </div>
        {search.list && !signedIn ? (
          <p className="medapp-note">
            {t('index-list-signed-out', {
              defaultValue: 'This link filters to a saved list. Sign in to see your lists; all schools are shown.',
            })}
          </p>
        ) : null}
        <PrefsNote fromPrefs={view.fromPrefs} />
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
              <MedEmpty title={t('index-empty', { defaultValue: 'No schools match.' })} />
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
