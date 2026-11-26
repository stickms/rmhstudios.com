import { useCallback, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { GameNightBoard } from '@/components/competitive/GameNightBoard';
import { useSession } from '@/components/Providers';
import { Skeleton } from '@/components/ui/skeleton';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useArrival } from '@/components/ui/arrive';
import type { TabItem } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { myScheduleQuery, scheduleQuery } from '@/lib/schedule/schedule.queries';
import type { ScheduleGrid } from '@/lib/schedule/schedule.contract';
import { allDayKeyToDayIso, gridDayLabel, regroupByViewerDay, viewerDayKey } from '@/lib/schedule/slots';

/**
 * `/calendar` — what's on, and what you're coming to.
 *
 * The one page for the one Event model (2026-11-19 consolidation): it replaces
 * `/schedule` (the programming grid) and `/game-night` (the weekly rotation),
 * both of which now forward here. "What's on" is the public week — the
 * platform's slots, game nights, tournaments and every public community or
 * profile event; "Yours" is the member's own week — RSVPs, office hours, the
 * events their polls locked in, the slots they added to their feed.
 */

const CALENDAR_TABS = ['on', 'yours'] as const;
type CalendarTab = (typeof CALENDAR_TABS)[number];

export const Route = createFileRoute('/_site/calendar')({
  head: () => ({
    meta: buildMeta({
      title: 'Calendar | RMH Studios',
      description: 'Puzzle drops, game nights, tournaments, premieres and community events: everything on this week.',
      path: '/calendar',
    }),
    links: [buildCanonical('/calendar')],
  }),
  // `tab` is omitted for the default so a bare `to="/calendar"` stays valid.
  validateSearch: (search: Record<string, unknown>): { tab?: CalendarTab } =>
    CALENDAR_TABS.includes(search.tab as CalendarTab) ? { tab: search.tab as CalendarTab } : {},
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, scheduleQuery()),
  component: CalendarPage,
});

/** The time column of a whole-day entry (an RMHLadder follow-up or deadline): its day, not a made-up hour. */
function AllDayLabel() {
  const { t } = useTranslation('ladder-calendar');
  return <>{t('grid.allDay', { defaultValue: 'All day' })}</>;
}

const noSubscription = () => () => {};
/** The viewer's time zone; `'UTC'` on the server and during hydration, so the first client render matches the HTML. */
function useViewerTimeZone(): string {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    () => 'UTC',
  );
}

/**
 * One week as rows on rules, a day per section. A timed entry sits on the day it starts in the viewer's zone and a
 * whole-day entry on its own day key (s15-18, S13-09); each day is named from its key, so the heading is that day.
 */
function Week({ grid }: { grid: ScheduleGrid }) {
  const { t, i18n } = useTranslation('site');
  const timeZone = useViewerTimeZone();
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit', timeZone });
  const dayLabel = (iso: string) => gridDayLabel(iso, i18n.language);
  const days = regroupByViewerDay(grid.byDay, timeZone);
  const nextDay = (o: ScheduleGrid['byDay'][number]['occurrences'][number]) =>
    gridDayLabel(allDayKeyToDayIso(viewerDayKey(o, timeZone)), i18n.language);

  return (
    <>
      {grid.next && (
        <section className="border-b border-site-border pb-4">
          <p className="t-label">{t('schedule-next', { defaultValue: 'Next up' })}</p>
          <p dir="auto" className="t-heading mt-1 text-site-text">
            {grid.next.href ? (
              <Link to={grid.next.href} className="hover:underline">
                {grid.next.title}
              </Link>
            ) : (
              grid.next.title
            )}
          </p>
          <p className="t-meta mt-1">
            {nextDay(grid.next)}
            {grid.next.allDay ? '' : ` · ${time(grid.next.startsAt)}`}
          </p>
        </section>
      )}
      {days.map((bucket) => (
        <section key={bucket.day}>
          <h2 className="t-label">{dayLabel(bucket.day)}</h2>
          {bucket.occurrences.length === 0 ? (
            <p className="t-body mt-2 border-b border-site-border pb-3 text-site-text-muted">
              {t('schedule-quiet', { defaultValue: 'Nothing scheduled.' })}
            </p>
          ) : (
            <ul className="mt-1">
              {bucket.occurrences.map((o) => (
                <li
                  key={`${o.slotId}-${o.startsAt}`}
                  className="flex items-baseline gap-3 border-b border-site-border py-2.5"
                >
                  <span className="t-meta w-16 shrink-0 tabular-nums">
                    {o.allDay ? <AllDayLabel /> : time(o.startsAt)}
                  </span>
                  <span dir="auto" className="t-body min-w-0 flex-1 text-site-text">
                    {o.href ? (
                      <Link to={o.href} className="hover:underline">
                        {o.title}
                      </Link>
                    ) : (
                      o.title
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

function WeekSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-site" />
      ))}
    </div>
  );
}

function WhatsOn() {
  const { t } = useTranslation('site');
  const query = useQuery(scheduleQuery());
  const grid = query.data ?? null;
  const failed = query.isError;
  const arrival = useArrival(grid !== null || failed);

  return (
    <>
      {failed && (
        <p role="alert" className={cn('t-body text-site-text-muted', arrival)}>
          {t('schedule-error', { defaultValue: 'Could not load the schedule just now.' })}
        </p>
      )}
      {!grid && !failed && <WeekSkeleton />}
      {grid && (
        <div className={cn('space-y-[var(--site-section-gap)]', arrival)}>
          <Week grid={grid} />
        </div>
      )}
      <section id="game-night" className="space-y-3">
        <h2 className="t-heading text-site-text">{t('calendar-game-night', { defaultValue: 'Game night' })}</h2>
        <GameNightBoard />
      </section>
    </>
  );
}

function Yours() {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const signedIn = !!session;
  const query = useQuery(myScheduleQuery(signedIn));
  const grid = query.data ?? null;
  const failed = query.isError;
  const arrival = useArrival(grid !== null || failed);

  if (!signedIn) {
    return (
      <SignedOutPrompt
        icon={CalendarDays}
        callbackURL="/calendar?tab=yours"
        title={t('calendar-sign-in', { defaultValue: 'Sign in to see what you are coming to' })}
      />
    );
  }
  return (
    <>
      {failed && (
        <p role="alert" className={cn('t-body text-site-text-muted', arrival)}>
          {t('calendar-mine-error', { defaultValue: 'Could not load your calendar just now.' })}
        </p>
      )}
      {!grid && !failed && <WeekSkeleton />}
      {grid && (
        <div className={cn('space-y-[var(--site-section-gap)]', arrival)}>
          <Week grid={grid} />
        </div>
      )}
      <p className="t-body text-site-text-muted">
        {t('calendar-mine-more', {
          defaultValue: 'RSVP to events in Communities, find a time with a poll, or book office hours.',
        })}{' '}
        <Link to="/communities" search={{ tab: 'events' }} className="underline">
          {t('calendar-link-events', { defaultValue: 'Events' })}
        </Link>
        {' · '}
        <Link to="/when" className="underline">
          {t('calendar-link-when', { defaultValue: 'Find a time' })}
        </Link>
        {' · '}
        <Link to="/settings/notifications" hash="calendar" className="underline">
          {t('calendar-link-feed', { defaultValue: 'Calendar feed' })}
        </Link>
      </p>
    </>
  );
}

function CalendarPage() {
  const { t } = useTranslation('site');
  const { tab = 'on' } = Route.useSearch();
  const navigate = useNavigate();
  const title = t('calendar-title', { defaultValue: 'Calendar' });

  const tabs: TabItem[] = [
    { id: 'on', label: t('calendar-tab-on', { defaultValue: "What's on" }) },
    { id: 'yours', label: t('calendar-tab-yours', { defaultValue: 'Yours' }) },
  ];
  const setTab = useCallback(
    (next: string) => {
      void navigate({
        to: '/calendar',
        search: next === 'on' ? {} : { tab: next as CalendarTab },
        replace: true,
      });
    },
    [navigate],
  );

  return (
    <PageLayout
      title={title}
      breadcrumbs={[{ label: title }]}
      description={t('calendar-subtitle', {
        defaultValue: 'The next seven days, in your device timezone.',
      })}
    >
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="calendar"
        aria-label={t('calendar-sections', { defaultValue: 'Calendar sections' })}
      />
      <div
        role="tabpanel"
        id={`calendar-panel-${tab}`}
        aria-labelledby={`calendar-tab-${tab}`}
        className="max-w-2xl space-y-[var(--site-section-gap)] px-4 pt-4 pb-12"
      >
        {tab === 'yours' ? <Yours /> : <WhatsOn />}
      </div>
    </PageLayout>
  );
}
