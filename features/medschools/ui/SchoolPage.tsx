import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { TabItem } from '@/components/ui/tabs';
import { SCHOOL_TABS, type SchoolTab } from '../engine/public-read';
import { patchSearch, type ViewPatch } from '../engine/prefs';
import { parseSchoolSearch } from '../engine/search';
import { schoolQuery } from '../medschools.queries';
import { ActivityTab } from './ActivityTab';
import { PrefsNote } from './PrefsNote';
import { useEffectiveView } from './useEffectiveView';
import { HistoryTab } from './HistoryTab';
import { InterviewsTab } from './InterviewsTab';
import { ProgramToggles } from './ProgramToggles';
import { SaveToList } from './SaveToList';
import { SchoolCrest } from './SchoolCrest';
import { SchoolFacts } from './SchoolFacts';
import { SkeletonSwap } from './skeletons';
import type { SchoolSearch, SchoolSearchPatch } from './school-search';

/** /rmh-medschool/$slug. The phase 5 tab goes in `SCHOOL_TABS` and the switch below; there is no placeholder. */
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
    program: view.program === 'NONE' ? 'ALL' : view.program,
    show: view.show,
  };

  const setSearch = (patch: SchoolSearchPatch) => {
    const { program, show, ...rest } = patch;
    const viewPatch: ViewPatch = { ...(program ? { program } : {}), ...(show ? { show } : {}) };
    const own = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    void navigate({
      to: '/rmh-medschool/$slug',
      params: { slug },
      // Only the keys the viewer changed are rewritten; `tab` and `type` defaults are stripped by the route.
      search: ((prev: Record<string, unknown>) => ({
        ...patchSearch('school', prev, view, viewPatch, prefs),
        ...own,
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
      case 'interviews':
        return t('school-tab-interviews', { defaultValue: 'Interviews' });
    }
  };
  const tabs: TabItem[] = SCHOOL_TABS.map((id) => ({ id, label: tabLabel(id) }));

  const programControl = detail ? (
    <ProgramToggles
      degree={detail.school.degree}
      value={search.program}
      onChange={(program) => setSearch({ program })}
    />
  ) : null;

  if (detailQuery.isError || (!detail && !detailQuery.isPending)) {
    return (
      <PageLayout title={t('school-title-fallback', { defaultValue: 'Med school' })}>
        <EmptyState
          title={t('school-load-failed', { defaultValue: 'Could not load this school.' })}
          action={
            <Button onClick={() => void detailQuery.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>
          }
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={detail?.school.name ?? t('school-title-fallback', { defaultValue: 'Med school' })}
      breadcrumbs={[
        { label: t('index-title', { defaultValue: 'RMH Med Schools' }), to: '/rmh-medschool' },
        { label: detail?.school.shortName ?? slug },
      ]}
    >
      <SkeletonSwap ready={!!detail}>
        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="mb-2 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <SchoolCrest slug={slug} name={detail.school.name} size={40} />
                <p className="t-meta m-0">
                  {t('school-place', {
                    defaultValue: '{{degree}} · {{city}}, {{state}}',
                    degree: detail.school.degree,
                    city: detail.school.city,
                    state: detail.school.state,
                  })}
                </p>
              </div>
              <SchoolFacts school={detail.school} />
              {session ? (
                <p className="t-meta m-0 flex flex-wrap items-center gap-x-3">
                  <SaveToList school={{ slug, name: detail.school.name }} program={search.program} />
                  <Link to="/rmh-medschool/tracker" className="underline">
                    {t('school-my-tracker', { defaultValue: 'My tracker' })}
                  </Link>
                  <Link to="/rmh-medschool/lists" className="underline">
                    {t('school-my-lists', { defaultValue: 'My lists' })}
                  </Link>
                </p>
              ) : null}
              <PrefsNote fromPrefs={view.fromPrefs} />
            </div>
            <div>
              <PageTabs
                tabs={tabs}
                value={search.tab}
                aria-label={t('school-tabs-label', { defaultValue: 'School sections' })}
                renderTab={(tab, props) => (
                  <Link
                    to="/rmh-medschool/$slug"
                    params={{ slug }}
                    search={((prev: Record<string, unknown>) => ({ ...prev, tab: tab.id })) as never}
                    replace
                    resetScroll={false}
                    id={props.id}
                    aria-current={props['aria-current']}
                    className={`${props.className} min-h-11`}
                  >
                    {props.children}
                  </Link>
                )}
              />
            </div>
            {search.tab === 'history' ? (
              <HistoryTab
                slug={slug}
                detail={detail}
                search={search}
                setSearch={setSearch}
                programControl={programControl}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">{programControl}</div>
                {search.tab === 'activity' ? (
                  <ActivityTab slug={slug} detail={detail} search={search} setSearch={setSearch} />
                ) : (
                  <InterviewsTab slug={slug} detail={detail} search={search} setSearch={setSearch} />
                )}
              </>
            )}
          </div>
        ) : null}
      </SkeletonSwap>
    </PageLayout>
  );
}
