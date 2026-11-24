import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { holdScroll } from './hold-scroll';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { useTranslation } from 'react-i18next';
import { CHARTED_TYPES, SCHOOL_TABS, type SchoolTab } from '../engine/public-read';
import { patchSearch, type ViewPatch } from '../engine/prefs';
import { parseSchoolSearch, showParam } from '../engine/search';
import { schoolQuery } from '../medschools.queries';
import { ActivityTab } from './ActivityTab';
import { AskPanel } from './ask/AskPanel';
import { MedEmpty } from './MedEmpty';
import { PrefsNote } from './PrefsNote';
import { useEffectiveView } from './useEffectiveView';
import { prefetchSchoolTabs } from './prefetch-tabs';
import { ForecastTab } from './ForecastTab';
import { HistoryTab } from './HistoryTab';
import { InterviewsTab } from './InterviewsTab';
import { ProgramToggles } from './ProgramToggles';
import { SecondariesTab } from './SecondariesTab';
import { SaveToList } from './SaveToList';
import { SchoolCrest } from './SchoolCrest';
import { SchoolFacts } from './SchoolFacts';
import { AdmissionsFacts } from './facts/AdmissionsFacts';
import { Curriculum } from './facts/Curriculum';
import { EnteringClass } from './facts/EnteringClass';
import { MdPhdProgram } from './facts/MdPhdProgram';
import { PageHead } from './shell/PageHead';
import { SkeletonSwap } from './skeletons';
import type { SchoolSearch, SchoolSearchPatch } from './school-search';

/** /med/$slug. A tab is an entry in `SCHOOL_TABS`, a label below and a branch of the switch at the end. */
/**
 * On a phone the section links are one line that scrolls sideways: bring the current one into that line's view when the
 * page opens on a later section (Facts, Secondaries). Moves only the row's own scroll, never the page.
 */
function showCurrentPill(nav: HTMLElement | null): void {
  const pill = nav?.querySelector<HTMLElement>('[aria-current="page"]');
  if (!nav || !pill || nav.scrollWidth <= nav.clientWidth) return;
  const end = pill.offsetLeft + pill.offsetWidth;
  if (pill.offsetLeft < nav.scrollLeft || end > nav.scrollLeft + nav.clientWidth) {
    nav.scrollLeft = Math.max(0, end - nav.clientWidth + 8);
  }
}

export function SchoolPage() {
  const { t } = useTranslation('medschools');
  const navigate = useNavigate();
  const { slug } = useParams({ strict: false }) as { slug: string };
  const parsed = parseSchoolSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const { data: session } = useSession();
  const detailQuery = useQuery(schoolQuery(slug));
  const detail = detailQuery.data;

  // The URL where it speaks, the viewer's preferences where it is silent. A school has its own degree.
  const { view, prefs } = useEffectiveView('school', parsed, detail ? { schoolDegree: detail.school.degree } : {});
  const search: SchoolSearch = {
    ...parsed,
    program: view.program,
    show: view.show,
  };

  // One background wave per school (and program) once the page has its school: the other tabs' public data, so a tab
  // switch renders from the cache. Not keyed on the tab: switching tabs neither restarts nor cancels it.
  const qc = useQueryClient();
  const ready = !!detail;
  useEffect(
    () => (ready ? prefetchSchoolTabs(qc, slug, search) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one wave per school and program, not per search change
    [ready, qc, slug, search.program],
  );

  const setSearch = (patch: SchoolSearchPatch) => {
    const { program, show, daily, ...rest } = patch;
    const viewPatch: ViewPatch = { ...(program ? { program } : {}), ...(show ? { show } : {}) };
    const own = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    holdScroll();
    void navigate({
      to: '/med/$slug',
      params: { slug },
      // Only the keys the viewer changed are rewritten; `tab` and `type` defaults are stripped by the route.
      search: ((prev: Record<string, unknown>) => ({
        ...patchSearch('school', prev, view, viewPatch, prefs),
        ...own,
        // The "by day" categories travel as a comma list in canonical order; all five is the default and is dropped.
        ...(daily ? { daily: daily.length < CHARTED_TYPES.length ? showParam(daily) : undefined } : {}),
      })) as never,
      replace: true,
      resetScroll: false,
    });
  };

  const tabLabel = (id: SchoolTab): string => {
    switch (id) {
      case 'activity':
        return t('school-tab-activity', { defaultValue: 'Activity' });
      case 'history':
        return t('school-tab-history', { defaultValue: 'History' });
      case 'forecast':
        return t('school-tab-forecast', { defaultValue: 'Forecast' });
      case 'interviews':
        return t('school-tab-interviews', { defaultValue: 'Interviews' });
      case 'secondaries':
        return t('school-tab-secondaries', { defaultValue: 'Secondaries' });
      case 'facts':
        return t('school-tab-facts', { defaultValue: 'Facts' });
    }
  };

  const programControl = detail ? (
    <ProgramToggles
      degree={detail.school.degree}
      value={search.program}
      onChange={(program) => setSearch({ program })}
    />
  ) : null;

  if (detailQuery.isError || (!detail && !detailQuery.isPending)) {
    return (
      <>
        <PageHead title={t('school-title-fallback', { defaultValue: 'Med school' })} />
        <MedEmpty
          title={t('school-load-failed', { defaultValue: 'Could not load this school.' })}
          onRetry={() => void detailQuery.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHead
        title={detail?.school.name ?? t('school-title-fallback', { defaultValue: 'Med school' })}
        crest={detail ? <SchoolCrest slug={slug} name={detail.school.name} size={76} /> : undefined}
        sub={
          detail
            ? t('school-place', {
                defaultValue: '{{degree}} · {{city}}, {{state}}',
                degree: detail.school.degree,
                city: detail.school.city,
                state: detail.school.state,
              })
            : undefined
        }
        actions={
          detail ? <SaveToList school={{ slug, name: detail.school.name }} program={search.program} /> : undefined
        }
      />
      <SkeletonSwap ready={!!detail}>
        {detail ? (
          <div className="medapp-school-body">
            <PrefsNote fromPrefs={view.fromPrefs} />
            <SchoolFacts school={detail.school} />
            {/* Links to the same page with another `tab`, so a nav with `aria-current`, not a tablist (as the shared
                `Tabs` renders its link mode). */}
            <nav
              ref={showCurrentPill}
              className="medapp-pills"
              aria-label={t('school-tabs-label', { defaultValue: 'School sections' })}
            >
              {SCHOOL_TABS.map((id) => (
                <Link
                  key={id}
                  to="/med/$slug"
                  params={{ slug }}
                  search={((prev: Record<string, unknown>) => ({ ...prev, tab: id })) as never}
                  replace
                  resetScroll={false}
                  activeOptions={{ exact: true, includeSearch: true }}
                  onClick={holdScroll}
                  aria-current={search.tab === id ? 'page' : undefined}
                  className="medapp-pill"
                >
                  {tabLabel(id)}
                </Link>
              ))}
            </nav>
            {/* At least a screen tall: switching to a shorter section, or one still loading, never shortens the page
                under the reader and pulls the scroll back up. */}
            <div className="medapp-tabbody">
              {search.tab === 'history' ? (
                <HistoryTab
                  slug={slug}
                  detail={detail}
                  search={search}
                  setSearch={setSearch}
                  programControl={programControl}
                />
              ) : search.tab === 'forecast' ? (
                <ForecastTab
                  slug={slug}
                  detail={detail}
                  search={search}
                  setSearch={setSearch}
                  programControl={programControl}
                />
              ) : search.tab === 'secondaries' ? (
                <SecondariesTab slug={slug} detail={detail} search={search} programControl={programControl} />
              ) : search.tab === 'facts' ? (
                <>
                  <EnteringClass slug={slug} schoolName={detail.school.shortName} degree={detail.school.degree} />
                  <Curriculum slug={slug} admitHref={detail.links.find((l) => l.source === 'ADMIT')?.href} />
                  <AdmissionsFacts slug={slug} degree={detail.school.degree} />
                  <MdPhdProgram slug={slug} degree={detail.school.degree} />
                </>
              ) : (
                <>
                  <div className="medapp-controls">{programControl}</div>
                  {search.tab === 'activity' ? (
                    <ActivityTab slug={slug} detail={detail} search={search} setSearch={setSearch} />
                  ) : (
                    <InterviewsTab slug={slug} detail={detail} search={search} setSearch={setSearch} />
                  )}
                </>
              )}
            </div>
            {session ? (
              <div className="medapp-panel medapp-panel--padded">
                <AskPanel slug={slug} schoolName={detail.school.name} heading="section" />
              </div>
            ) : null}
          </div>
        ) : null}
      </SkeletonSwap>
    </>
  );
}
