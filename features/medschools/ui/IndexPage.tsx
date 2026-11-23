import { useState } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
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
import { Q_MAX, SCHOOL_SEARCH_DEFAULTS, parseIndexSearch } from '../engine/search';
import { schoolsQuery, todayQuery } from '../medschools.queries';
import { DegreeProgramSelect } from './ProgramSelect';
import { SchoolCrest } from './SchoolCrest';
import { ReportedNote } from './ReportedNote';
import { SkeletonSwap } from './skeletons';
import { useMedLabels } from './labels';

/**
 * /rmh-medschool: the school index. Rows on rules (D14); nothing here is a primary action (R4). A school with no
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

  const schools = useQuery(schoolsQuery(search));
  const today = useQuery(todayQuery(search.program, search.degree));

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
              <li key={r.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-site-border py-3">
                <SchoolCrest slug={r.slug} name={r.shortName} size={24} />
                <div className="min-w-44 flex-1">
                  <Link
                    to="/rmh-medschool/$slug"
                    params={{ slug: r.slug }}
                    search={SCHOOL_SEARCH_DEFAULTS}
                    className="t-body"
                  >
                    {r.shortName}
                  </Link>
                  <p className="t-meta m-0">
                    {t('index-today-place', {
                      defaultValue: '{{city}}, {{state}}',
                      city: r.city,
                      state: r.state,
                    })}
                  </p>
                </div>
                <span className="t-meta ps-9 sm:ps-0">
                  {t('index-day-invites', {
                    count: r.count,
                    n: nf.format(r.count),
                    defaultValue_one: '{{n}} invite · {{source}}',
                    defaultValue_other: '{{n}} invites · {{source}}',
                    defaultValue: '{{n}} invites · {{source}}',
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
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-site-border py-3"
                  >
                    <SchoolCrest slug={s.slug} name={s.name} size={24} />
                    <div className="min-w-44 flex-1">
                      <Link
                        to="/rmh-medschool/$slug"
                        params={{ slug: s.slug }}
                        search={SCHOOL_SEARCH_DEFAULTS}
                        className="t-body"
                      >
                        {s.name}
                      </Link>
                      <p className="t-meta m-0">
                        {t('index-school-meta', {
                          defaultValue: '{{degree}} · {{city}}, {{state}}',
                          degree: s.degree,
                          city: s.city,
                          state: s.state,
                        })}
                      </p>
                    </div>
                    {s.reported ? (
                      <span className="t-meta ps-9 sm:ps-0">
                        {t('index-reported', {
                          count: s.reported.count,
                          n: nf.format(s.reported.count),
                          defaultValue_one: '{{n}} reported invite, {{source}}',
                          defaultValue_other: '{{n}} reported invites, {{source}}',
                          defaultValue: '{{n}} reported invites, {{source}}',
                          source: sourceName(s.reported.source),
                        })}
                      </span>
                    ) : null}
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
