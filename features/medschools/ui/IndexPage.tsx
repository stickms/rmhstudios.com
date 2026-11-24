import { useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { schoolProgramOf } from '../engine/programs';
import { Q_MAX, SCHOOL_SEARCH_DEFAULTS, parseIndexSearch } from '../engine/search';
import { indexQuery, listsQuery, schoolsQuery } from '../medschools.queries';
import { useSession } from '@/components/session/session-context';
import { PrefsNote } from './PrefsNote';
import { useEffectiveView } from './useEffectiveView';
import { ProgramSetToggles } from './ProgramSetToggles';
import { SaveToList } from './SaveToList';
import { SchoolCrest } from './SchoolCrest';
import { SkeletonSwap } from './skeletons';
import { useMedLabels } from './labels';
import { PageHead } from './shell/PageHead';

/**
 * /rmh-medschool: the school index. A paper panel of rows (the redesign's list, D14). A school with no
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

  const setSearch = (next: { q?: string | undefined; state?: string | undefined; list?: string | undefined }) => {
    const merged = { ...search, ...next };
    void navigate({
      to: '/rmh-medschool',
      // The preference key (`programs`) stays as the URL had it; only the page's own keys are rebuilt.
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        q: merged.q || undefined,
        state: merged.state || undefined,
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
    <>
      <PageHead title={t('index-title', { defaultValue: 'RMH Med Schools' })} />
      <nav className="medapp-chips mb-4" aria-label={t('index-nav-label', { defaultValue: 'Med Schools' })}>
        <Link to="/rmh-medschool/live" className="medapp-chip">
          {t('index-live', { defaultValue: 'Live activity' })}
        </Link>
        {signedIn ? (
          <>
            <Link to="/rmh-medschool/tracker" className="medapp-chip">
              {t('index-my-tracker', { defaultValue: 'My tracker' })}
            </Link>
            <Link to="/rmh-medschool/ask" className="medapp-chip">
              {t('index-ask', { defaultValue: 'Ask' })}
            </Link>
            <Link to="/rmh-medschool/lists" className="medapp-chip">
              {t('index-my-lists', { defaultValue: 'My lists' })}
            </Link>
          </>
        ) : null}
        <Link to="/rmh-medschool/practice" className="medapp-chip">
          {t('index-practice', { defaultValue: 'Interview practice' })}
        </Link>
      </nav>

      <div className="medapp-toolbar">
        <SearchField
          containerClassName="w-full sm:w-auto sm:min-w-48 sm:flex-1"
          aria-label={t('index-search-label', { defaultValue: 'Search schools' })}
          placeholder={t('index-search-placeholder', { defaultValue: 'Search schools' })}
          maxLength={Q_MAX}
          value={text}
          onValueChange={(v) => {
            setText(v);
            pushQuery(v);
          }}
        />
        <Select
          controlSize="sm"
          aria-label={t('index-state-label', { defaultValue: 'State' })}
          value={search.state ?? ''}
          onChange={(e) => setSearch({ state: e.target.value || undefined })}
        >
          <option value="">{t('index-state-all', { defaultValue: 'All states' })}</option>
          {(schools.data?.states ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <ProgramSetToggles value={view.programs} onChange={(programs) => setView({ programs })} />
      {myLists.length > 0 ? (
        <div className="mt-3">
          <Select
            controlSize="sm"
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
          </Select>
        </div>
      ) : null}
      {search.list && !signedIn ? (
        <p className="medapp-note">
          {t('index-list-signed-out', {
            defaultValue: 'This link filters to a saved list. Sign in to see your lists; all schools are shown.',
          })}
        </p>
      ) : null}
      <PrefsNote fromPrefs={view.fromPrefs} />

      <div className="mt-4">
        {schools.isError ? (
          <div className="medapp-panel medapp-panel--padded">
            <p className="medapp-empty">{t('index-load-failed', { defaultValue: 'Could not load the schools.' })}</p>
            <button type="button" className="medapp-chip" onClick={() => void schools.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </button>
          </div>
        ) : (
          <SkeletonSwap ready={!!schools.data}>
            {schools.data && rows.length === 0 ? (
              <div className="medapp-panel">
                <p className="medapp-empty">{t('index-empty', { defaultValue: 'No schools match.' })}</p>
              </div>
            ) : (
              <ul className="medapp-panel medapp-rows">
                {rows.map((s) => (
                  <li key={s.slug} className="medapp-row items-center">
                    <SchoolCrest slug={s.slug} name={s.name} size={40} />
                    <div className="medapp-row__body">
                      <p className="medapp-row__name">
                        <Link to="/rmh-medschool/$slug" params={{ slug: s.slug }} search={SCHOOL_SEARCH_DEFAULTS}>
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
    </>
  );
}
