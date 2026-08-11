import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DayDetail } from '@/components/sohumbum2/DayDetail';
import { SummaryCard } from '@/components/sohumbum2/SummaryCard';
import sohumbum2Css from '@/components/sohumbum2/sohumbum2.css?url';
import { buildMeta } from '@/lib/seo';
import { getDaySnapshot } from '@/lib/sohumbum2/activity.server';
import { formatDayLong } from '@/lib/sohumbum2/dates';
// Client-safe on purpose: `head()` re-runs in the browser on every client-side
// navigation, so it can only call into modules that survive the client bundle.
import { describeDay } from '@/lib/sohumbum2/describe';

/**
 * `/sohumbum2/<YYYY-MM-DD>` — one day, permanently addressable.
 *
 * This route exists so a day can be *pasted*. Everything on it is also reachable
 * by clicking that date on `/sohumbum2`, but a click is not a link: the whole
 * value of "look what he did on Tuesday" is being able to send it, and have it
 * unfurl into the figures without the recipient opening anything.
 *
 * So the day's OWN card is built (`/api/og/sohumbum2?date=…`) and the day's own
 * description is the same sentence the card draws — both answer the one question
 * the paste is asking.
 *
 * A malformed or future date is a real 404 rather than an empty page; a valid
 * date with nothing recorded is NOT — a quiet Tuesday is a fact about him, and
 * the page says so.
 */
const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .max(10);

const fetchDay = createServerFn({ method: 'GET' })
  .validator((date: string) => dateParam.parse(date))
  .handler(async ({ data }) => {
    const snapshot = await getDaySnapshot(data);
    // `getDaySnapshot` returns null only for a date that cannot exist or has not
    // happened; both are genuinely "no such page".
    if (!snapshot) throw notFound();
    return snapshot;
  });

export const Route = createFileRoute('/sohumbum2/$date')({
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
          path: `/sohumbum2/${params.date}`,
          // The day's own card, so the paste carries that day's figures rather
          // than the dossier's front page.
          image: `/api/og/sohumbum2?date=${encodeURIComponent(params.date)}`,
          imageAlt: `Activity report for ${label}: time in voice, messages sent and games played.`,
        }),
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'color-scheme', content: 'dark light' },
      ],
      links: [{ rel: 'stylesheet', href: sohumbum2Css }],
    };
  },
  component: DayRoute,
});

function DayRoute() {
  const { t } = useTranslation('r-sohumbum2');
  const snapshot = Route.useLoaderData();
  const { day, week, month, prevKey, nextKey } = snapshot;

  return (
    <div className="sb2">
      <div className="sb2-shell">
        <header className="sb2-header">
          <Link to="/sohumbum2" className="sb2-btn sb2-btn--ghost">
            <ChevronLeft aria-hidden size={16} />
            {t('day-back', { defaultValue: 'Back to the dossier' })}
          </Link>
          <div className="sb2-header__actions">
            {prevKey ? (
              <Link
                to="/sohumbum2/$date"
                params={{ date: prevKey }}
                className="sb2-btn sb2-btn--ghost sb2-btn--icon"
                aria-label={t('day-prev', { defaultValue: 'Previous day' })}
              >
                <ChevronLeft aria-hidden size={16} />
              </Link>
            ) : null}
            {nextKey ? (
              <Link
                to="/sohumbum2/$date"
                params={{ date: nextKey }}
                className="sb2-btn sb2-btn--ghost sb2-btn--icon"
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
        <section className="sb2-section sb2-column">
          {/* `showPermalink={false}`: on the day's own URL, the address bar is
              the permalink and a "copy link" button beside it is noise. */}
          <DayDetail day={day} showPermalink={false} />
        </section>

        {week || month ? (
          <section className="sb2-section">
            <div className="sb2-section__head">
              <h2 className="sb2-section__title">
                {t('periods-heading', { defaultValue: 'The wider view' })}
              </h2>
            </div>
            <div className="sb2-grid-2">
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
