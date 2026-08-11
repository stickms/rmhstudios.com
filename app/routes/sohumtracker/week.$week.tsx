import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PeriodDetail } from '@/components/sohumtracker/PeriodDetail';
import sohumtrackerCss from '@/components/sohumtracker/sohumtracker.css?url';
import { buildMeta } from '@/lib/seo';
import { getPeriodSnapshot } from '@/lib/sohumtracker/activity.server';
// Client-safe on purpose: `head()` re-runs in the browser on every client-side
// navigation, so it can only call into modules that survive the client bundle.
import { describePeriod, periodLabel } from '@/lib/sohumtracker/describe';

/**
 * `/sohumtracker/week/<YYYY-Www>` — one ISO week, permanently addressable.
 *
 * The summarizer has written weekly write-ups since day one; until now the only
 * way to see one was to click a day inside it and read the panel beside it. That
 * made the week the one unit on this page that could be READ but not SENT, which
 * is backwards — a week is the most quotable span there is.
 *
 * ISO weeks, matching `isoWeekKey` on both sides of the wire (and
 * `watch_summary.go`, which writes the keys). A malformed key or one naming a
 * week that does not exist — `2026-W53` in a 52-week year — is a real 404; a
 * valid week with nothing in it is NOT, because a quiet week is a fact about him.
 */
const weekParam = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'expected YYYY-Www')
  .max(8);

const fetchWeek = createServerFn({ method: 'GET' })
  .validator((week: string) => weekParam.parse(week))
  .handler(async ({ data }) => {
    const snapshot = await getPeriodSnapshot('week', data);
    if (!snapshot) throw notFound();
    return snapshot;
  });

export const Route = createFileRoute('/sohumtracker/week/$week')({
  // `loader` before `head`: TanStack types `head`'s `loaderData` from the loader
  // property already present on the object literal — see the note in `$date.tsx`.
  loader: ({ params }) => fetchWeek({ data: params.week }),
  head: ({ params, loaderData }) => {
    const label = loaderData ? periodLabel('week', loaderData.periodKey) : params.week;
    return {
      meta: [
        ...buildMeta({
          title: `${label} — Sohum's week | RMH Studios`,
          description: loaderData
            ? describePeriod('week', loaderData.periodKey, loaderData.totals, loaderData.summary)
            : 'One week of Discord activity: hours signed in, hours in voice, messages sent.',
          path: `/sohumtracker/week/${params.week}`,
          image: `/api/og/sohumtracker?week=${encodeURIComponent(params.week)}`,
          imageAlt: `Activity report for ${label}: time signed in to Discord, time in voice and messages sent.`,
        }),
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'color-scheme', content: 'dark light' },
      ],
      links: [{ rel: 'stylesheet', href: sohumtrackerCss }],
    };
  },
  component: WeekRoute,
});

function WeekRoute() {
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
                to="/sohumtracker/week/$week"
                params={{ week: snapshot.prevKey }}
                className="stk-btn stk-btn--ghost stk-btn--icon"
                aria-label={t('week-prev', { defaultValue: 'Previous week' })}
              >
                <ChevronLeft aria-hidden size={16} />
              </Link>
            ) : null}
            {snapshot.nextKey ? (
              <Link
                to="/sohumtracker/week/$week"
                params={{ week: snapshot.nextKey }}
                className="stk-btn stk-btn--ghost stk-btn--icon"
                aria-label={t('week-next', { defaultValue: 'Next week' })}
              >
                <ChevronRight aria-hidden size={16} />
              </Link>
            ) : null}
          </div>
        </header>

        {/* Narrower than the dossier: this page is one period read top to
            bottom, not a dashboard. */}
        <section className="stk-section stk-column">
          <h1 className="stk-detail__title">{periodLabel('week', snapshot.periodKey)}</h1>
          <PeriodDetail
            period="week"
            days={snapshot.days}
            totals={snapshot.totals}
            summary={snapshot.summary}
          />
        </section>
      </div>
    </div>
  );
}
