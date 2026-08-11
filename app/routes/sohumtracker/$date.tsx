import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DayDetail } from '@/components/sohumtracker/DayDetail';
import { SummaryCard } from '@/components/sohumtracker/SummaryCard';
import sohumtrackerCss from '@/components/sohumtracker/sohumtracker.css?url';
import { buildMeta } from '@/lib/seo';
import { getDaySnapshot } from '@/lib/sohumtracker/activity.server';
import { formatDayLong } from '@/lib/sohumtracker/dates';
// Client-safe on purpose: `head()` re-runs in the browser on every client-side
// navigation, so it can only call into modules that survive the client bundle.
import { describeDay } from '@/lib/sohumtracker/describe';

/**
 * `/sohumtracker/<YYYY-MM-DD>` — one day, permanently addressable.
 *
 * This route exists so a day can be *pasted*. Everything on it is also reachable
 * by clicking that date on `/sohumtracker`, but a click is not a link: the whole
 * value of "look what he did on Tuesday" is being able to send it, and have it
 * unfurl into the figures without the recipient opening anything.
 *
 * So the day's OWN card is built (`/api/og/sohumtracker?date=…`) and the day's own
 * description is the same sentence the card draws — both answer the one question
 * the paste is asking.
 *
 * A malformed or future date is a real 404 rather than an empty page; a valid
 * date with nothing recorded is NOT — a quiet Tuesday is a fact about him, and
 * the page says so.
 */
/**
 * Hand-rolled instead of a one-line zod schema. A route module's top-level code is
 * aggregated into the SHARED ENTRY CHUNK, so `import { z } from 'zod'` here charges
 * **every page on the site** 71 KB raw to validate one date string on one route. A
 * regex is the whole schema anyway.
 *
 * Throwing (rather than returning null) is deliberate and unchanged: this is a
 * server-function validator, and a malformed date should fail the call, which the
 * route renders as a 404.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value: string): string {
  if (typeof value !== 'string' || value.length > 10 || !DATE_RE.test(value)) {
    throw new Error('expected YYYY-MM-DD');
  }
  return value;
}

const fetchDay = createServerFn({ method: 'GET' })
  .validator((date: string) => parseDateParam(date))
  .handler(async ({ data }) => {
    const snapshot = await getDaySnapshot(data);
    // `getDaySnapshot` returns null only for a date that cannot exist or has not
    // happened; both are genuinely "no such page".
    if (!snapshot) throw notFound();
    return snapshot;
  });

export const Route = createFileRoute('/sohumtracker/$date')({
  // `loader` is declared BEFORE `head` on purpose: TanStack types `head`'s
  // `loaderData` from the loader property already present on the object
  // literal, so a `head` written above it sees `never` and every field read off
  // it is a type error.
  loader: ({ params }) => fetchDay({ data: params.date }),
  head: ({ params, loaderData }) => {
    const label = loaderData ? formatDayLong(loaderData.day.dateKey) : params.date;
    return {
      meta: [
        ...buildMeta({
          title: `${label} — Sohum's day | RMH Studios`,
          description: loaderData
            ? describeDay(loaderData.day)
            : 'One day of Discord activity: hours in voice, messages sent, games played.',
          path: `/sohumtracker/${params.date}`,
          // The day's own card, so the paste carries that day's figures rather
          // than the dossier's front page.
          image: `/api/og/sohumtracker?date=${encodeURIComponent(params.date)}`,
          imageAlt: `Activity report for ${label}: time in voice, messages sent and games played.`,
        }),
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'color-scheme', content: 'dark light' },
      ],
      links: [{ rel: 'stylesheet', href: sohumtrackerCss }],
    };
  },
  component: DayRoute,
});

function DayRoute() {
  const { t } = useTranslation('r-sohumtracker');
  const snapshot = Route.useLoaderData();
  const { day, week, month, prevKey, nextKey } = snapshot;

  return (
    <div className="stk">
      <div className="stk-shell">
        <header className="stk-header">
          <Link to="/sohumtracker" className="stk-btn stk-btn--ghost">
            <ChevronLeft aria-hidden size={16} />
            {t('day-back', { defaultValue: 'Back to the dossier' })}
          </Link>
          <div className="stk-header__actions">
            {prevKey ? (
              <Link
                to="/sohumtracker/$date"
                params={{ date: prevKey }}
                className="stk-btn stk-btn--ghost stk-btn--icon"
                aria-label={t('day-prev', { defaultValue: 'Previous day' })}
              >
                <ChevronLeft aria-hidden size={16} />
              </Link>
            ) : null}
            {nextKey ? (
              <Link
                to="/sohumtracker/$date"
                params={{ date: nextKey }}
                className="stk-btn stk-btn--ghost stk-btn--icon"
                aria-label={t('day-next', { defaultValue: 'Next day' })}
              >
                <ChevronRight aria-hidden size={16} />
              </Link>
            ) : null}
          </div>
        </header>

        {/* Narrower than the dossier's full width: this page is one day read
            top to bottom, and a 1180px-wide row of eighteen figures is a
            spreadsheet rather than a report. */}
        <section className="stk-section stk-column">
          {/* `showPermalink={false}`: on the day's own URL, the address bar is
              the permalink and a "copy link" button beside it is noise. */}
          <DayDetail day={day} showPermalink={false} />
        </section>

        {week || month ? (
          <section className="stk-section">
            <div className="stk-section__head">
              <h2 className="stk-section__title">
                {t('periods-heading', { defaultValue: 'The wider view' })}
              </h2>
            </div>
            <div className="stk-grid-2">
              <SummaryCard
                summary={week}
                emptyTitle={t('week-empty-title', { defaultValue: 'This week' })}
                emptyBody={t('week-empty-body', {
                  defaultValue: 'Not written up yet. It settles once the week has enough in it.',
                })}
              />
              <SummaryCard
                summary={month}
                emptyTitle={t('month-empty-title', { defaultValue: 'This month' })}
                emptyBody={t('month-empty-body', {
                  defaultValue: 'Not written up yet. It settles once the month has enough in it.',
                })}
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
