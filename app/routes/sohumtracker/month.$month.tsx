import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PeriodDetail } from '@/components/sohumtracker/PeriodDetail';
import sohumtrackerCss from '@/components/sohumtracker/sohumtracker.css?url';
import { buildMeta } from '@/lib/seo';
import { getPeriodSnapshot } from '@/lib/sohumtracker/activity.server';
// Client-safe on purpose — see the note in `week.$week.tsx`.
import { describePeriod, periodLabel } from '@/lib/sohumtracker/describe';

/**
 * `/sohumtracker/month/<YYYY-MM>` — one calendar month, permanently addressable.
 *
 * The sibling of the week permalink, and there for the same reason: the monthly
 * write-up already existed and had nowhere to live. A month in progress is
 * clamped to today by `getPeriodSnapshot`, so the 11th does not report three
 * weeks of zeroes as if he had gone quiet.
 */
const monthParam = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM')
  .max(7);

const fetchMonth = createServerFn({ method: 'GET' })
  .validator((month: string) => monthParam.parse(month))
  .handler(async ({ data }) => {
    const snapshot = await getPeriodSnapshot('month', data);
    if (!snapshot) throw notFound();
    return snapshot;
  });

export const Route = createFileRoute('/sohumtracker/month/$month')({
  // `loader` before `head` — see the note in `$date.tsx`.
  loader: ({ params }) => fetchMonth({ data: params.month }),
  head: ({ params, loaderData }) => {
    const label = loaderData ? periodLabel('month', loaderData.periodKey) : params.month;
    return {
      meta: [
        ...buildMeta({
          title: `${label} — Sohum's month | RMH Studios`,
          description: loaderData
            ? describePeriod('month', loaderData.periodKey, loaderData.totals, loaderData.summary)
            : 'One month of Discord activity: hours signed in, hours in voice, messages sent.',
          path: `/sohumtracker/month/${params.month}`,
          image: `/api/og/sohumtracker?month=${encodeURIComponent(params.month)}`,
          imageAlt: `Activity report for ${label}: time signed in to Discord, time in voice and messages sent.`,
        }),
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'color-scheme', content: 'dark light' },
      ],
      links: [{ rel: 'stylesheet', href: sohumtrackerCss }],
    };
  },
  component: MonthRoute,
});

function MonthRoute() {
  const { t } = useTranslation('r-sohumtracker');
  const snapshot = Route.useLoaderData();

  return (
    <div className="stk">
      <div className="stk-shell">
        <header className="stk-header">
          <Link to="/sohumtracker" className="stk-btn stk-btn--ghost">
            <ChevronLeft aria-hidden size={16} />
            {t('day-back', { defaultValue: 'Back to the dossier' })}
          </Link>
          <div className="stk-header__actions">
            {snapshot.prevKey ? (
              <Link
                to="/sohumtracker/month/$month"
                params={{ month: snapshot.prevKey }}
                className="stk-btn stk-btn--ghost stk-btn--icon"
                aria-label={t('month-prev', { defaultValue: 'Previous month' })}
              >
                <ChevronLeft aria-hidden size={16} />
              </Link>
            ) : null}
            {snapshot.nextKey ? (
              <Link
                to="/sohumtracker/month/$month"
                params={{ month: snapshot.nextKey }}
                className="stk-btn stk-btn--ghost stk-btn--icon"
                aria-label={t('month-next', { defaultValue: 'Next month' })}
              >
                <ChevronRight aria-hidden size={16} />
              </Link>
            ) : null}
          </div>
        </header>

        <section className="stk-section stk-column">
          <h1 className="stk-detail__title">{periodLabel('month', snapshot.periodKey)}</h1>
          <PeriodDetail
            period="month"
            days={snapshot.days}
            totals={snapshot.totals}
            summary={snapshot.summary}
          />
        </section>
      </div>
    </div>
  );
}
