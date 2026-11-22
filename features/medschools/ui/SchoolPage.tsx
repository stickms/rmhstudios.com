import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { TabItem } from '@/components/ui/tabs';
import { SCHOOL_TABS, type SchoolTab } from '../engine/public-read';
import type { MedEventType } from '../engine/types';
import { parseSchoolSearch, showParam } from '../engine/search';
import { schoolQuery } from '../medschools.queries';
import { ActivityTab } from './ActivityTab';
import { HistoryTab } from './HistoryTab';
import { InterviewsTab } from './InterviewsTab';
import { ProgramSelect } from './ProgramSelect';
import { ReportedNote } from './ReportedNote';
import { SchoolCrest } from './SchoolCrest';
import { SchoolFacts } from './SchoolFacts';
import { SkeletonSwap } from './skeletons';
import type { SchoolSearch, SchoolSearchPatch } from './school-search';

/** /rmh-medschool/$slug. The phase 5 tab goes in `SCHOOL_TABS` and the switch below; there is no placeholder. */
export function SchoolPage() {
  const { t } = useTranslation('medschools');
  const navigate = useNavigate();
  const { slug } = useParams({ strict: false }) as { slug: string };
  const search = parseSchoolSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const detailQuery = useQuery(schoolQuery(slug));
  const detail = detailQuery.data;

  const routeSearch = (m: Omit<SchoolSearch, 'show'> & { show: readonly MedEventType[] }) => ({
    tab: m.tab,
    program: m.program,
    type: m.type,
    show: showParam(m.show),
    ...(m.source ? { source: m.source } : {}),
    ...(m.cycle !== undefined ? { cycle: m.cycle } : {}),
  });
  const setSearch = (patch: SchoolSearchPatch) => {
    void navigate({
      to: '/rmh-medschool/$slug',
      params: { slug },
      // Defaults are stripped by the route's search middleware, so a default never reaches the URL.
      search: () => routeSearch({ ...search, ...patch }),
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
    <ProgramSelect
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
              <ReportedNote />
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
                    search={routeSearch({ ...search, tab: tab.id as SchoolTab })}
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
                  <InterviewsTab detail={detail} search={search} />
                )}
              </>
            )}
          </div>
        ) : null}
      </SkeletonSwap>
    </PageLayout>
  );
}
