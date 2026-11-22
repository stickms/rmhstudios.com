import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { formatUtcDay } from '../engine/public-read';
import { parseIndexSearch } from '../engine/search';
import { schoolsQuery, todayQuery } from '../medschools.queries';
import { SchoolLink } from './SchoolLink';
import { DegreeProgramSelect } from './ProgramSelect';
import { ReportedNote } from './ReportedNote';
import { SkeletonSwap } from './skeletons';
import { useMedLabels } from './labels';

/** /rmh-medschool: the school index. Rows on rules (D14); nothing here is a primary action (R4). */
export function IndexPage() {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const { sourceName } = useMedLabels();
  const navigate = useNavigate();
  const search = parseIndexSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const [text, setText] = useState(search.q ?? '');

  const schools = useQuery(schoolsQuery(search));
  const today = useQuery(todayQuery(search.program));

  const setSearch = (next: Partial<typeof search> & { q?: string | undefined }) => {
    const merged = { ...search, ...next };
    void navigate({
      to: '/rmh-medschool',
      // `program` is left out when it is the default; the route's parser puts it back.
      search: {
        ...(merged.q ? { q: merged.q } : {}),
        ...(merged.degree ? { degree: merged.degree } : {}),
        ...(merged.state ? { state: merged.state } : {}),
        ...(merged.program !== 'ALL' ? { program: merged.program } : {}),
      } as typeof search,
      replace: true,
      resetScroll: false,
    });
  };
  const pushQuery = useDebouncedCallback((q: string) => setSearch({ q: q.trim() || undefined }), 250);

  const day = today.data?.date ?? null;
  const topRows = today.data?.schools ?? [];

  return (
    <PageLayout title={t('index-title', { defaultValue: 'RMH Med Schools' })}>
      <ReportedNote />

      {day && topRows.length > 0 ? (
        <section className="mt-6" aria-labelledby="medschools-latest-day">
          <h2 id="medschools-latest-day" className="t-heading m-0">
            {today.data?.isToday
              ? t('index-today-heading', { defaultValue: 'Interview invites reported today' })
              : t('index-day-heading', {
                  defaultValue: 'Interview invites reported on {{date}}',
                  date: formatUtcDay(day, locale),
                })}
          </h2>
          <ul className="m-0 list-none p-0">
            {topRows.map((r) => (
              <li key={r.slug} className="flex items-baseline justify-between gap-4 border-b border-site-border py-3">
                <SchoolLink slug={r.slug} className="t-body">
                  {r.shortName}
                </SchoolLink>
                <span className="t-meta">
                  {t('index-day-count', {
                    defaultValue: '{{n}}, {{source}}',
                    n: r.count,
                    source: sourceName(r.source),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchField
          containerClassName="min-w-48 flex-1"
          aria-label={t('index-search-label', { defaultValue: 'Search schools' })}
          placeholder={t('index-search-placeholder', { defaultValue: 'Search schools' })}
          value={text}
          onValueChange={(v) => {
            setText(v);
            pushQuery(v);
          }}
        />
        <DegreeProgramSelect
          value={{ degree: search.degree, program: search.program }}
          onChange={(v) =>
            setSearch({
              degree: v.degree,
              program: v.program === 'REG' || v.program === 'PHD' ? v.program : 'ALL',
            })
          }
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

      <div className="mt-4">
        {schools.isError ? (
          <EmptyState
            title={t('index-load-failed', { defaultValue: 'Could not load the schools.' })}
            action={<Button onClick={() => void schools.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
          />
        ) : (
          <SkeletonSwap ready={!!schools.data}>
            {schools.data && schools.data.schools.length === 0 ? (
              <EmptyState title={t('index-empty', { defaultValue: 'No schools match.' })} />
            ) : (
              <ul className="m-0 list-none p-0">
                {(schools.data?.schools ?? []).map((s) => (
                  <li
                    key={s.slug}
                    className="flex items-baseline justify-between gap-4 border-b border-site-border py-3"
                  >
                    <div className="min-w-0">
                      <SchoolLink slug={s.slug} className="t-body">
                        {s.name}
                      </SchoolLink>
                      <p className="t-meta m-0">
                        {t('index-school-meta', {
                          defaultValue: '{{degree}} · {{city}}, {{state}}',
                          degree: s.degree,
                          city: s.city,
                          state: s.state,
                        })}
                      </p>
                    </div>
                    <span className="t-meta shrink-0">
                      {s.reported
                        ? t('index-reported', {
                            defaultValue: '{{n}} reported invites, {{source}}',
                            n: s.reported.count,
                            source: sourceName(s.reported.source),
                          })
                        : t('index-not-reported', { defaultValue: 'No reported invites' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SkeletonSwap>
        )}
      </div>
    </PageLayout>
  );
}
