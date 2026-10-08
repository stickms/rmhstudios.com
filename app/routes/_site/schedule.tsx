import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Circle } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { buildMeta, buildCanonical } from '@/lib/seo';
import type { SlotKind } from '@/lib/schedule/slots';

/**
 * `/schedule` — what is on (L1).
 *
 * The platform's own editorial surface, and the answer to a question the
 * radial hub cannot give: it offers forty equally-weighted doors, and this
 * says which one is worth opening right now.
 */

interface Occurrence {
  slotId: string;
  kind: SlotKind;
  title: string;
  href: string | null;
  startsAt: string;
  endsAt: string;
}
interface GridView {
  from: string;
  days: number;
  next: Occurrence | null;
  byDay: { day: string; occurrences: Occurrence[] }[];
}

export const Route = createFileRoute('/_site/schedule')({
  head: () => ({
    meta: buildMeta({
      title: 'Schedule | RMH Studios',
      description:
        'Daily puzzle drops, tournaments, premieres, community events and the weekly company report — everything happening on RMH Studios this week.',
      path: '/schedule',
    }),
    links: [buildCanonical('/schedule')],
  }),
  component: SchedulePage,
});

/** A dot per kind, so the grid is scannable before it is read. */
const KIND_TINT: Record<string, string> = {
  'daily-puzzle': 'text-site-accent',
  tournament: 'text-site-warning',
  'community-event': 'text-site-success',
  premiere: 'text-site-accent',
  'featured-build': 'text-site-text-muted',
  'company-report': 'text-site-text-muted',
  season: 'text-site-warning',
  maintenance: 'text-site-text-muted',
};

function SchedulePage() {
  const { t, i18n } = useTranslation('site');
  const [grid, setGrid] = useState<GridView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/schedule?days=7')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: GridView) => setGrid(d))
      .catch(() => setFailed(true));
  }, []);

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' });

  const title = t('schedule-title', { defaultValue: "What's on" });

  return (
    <PageLayout
      title={title}
      breadcrumbs={[{ label: title }]}
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-site-text-muted">
          {t('schedule-subtitle', {
            defaultValue:
              'Puzzle drops, tournaments, premieres and events — the next seven days.',
          })}
        </p>

        {grid?.next && (
          <section className="glass-pane rounded-site p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-site-text-muted">
              {t('schedule-next', { defaultValue: 'Next up' })}
            </p>
            <p className="mt-1 text-base font-bold text-site-text">
              {grid.next.href ? (
                <Link to={grid.next.href} className="hover:underline">
                  {grid.next.title}
                </Link>
              ) : (
                grid.next.title
              )}
            </p>
            <p className="mt-1 text-sm text-site-text-muted">
              {dayLabel(grid.next.startsAt)} · {time(grid.next.startsAt)}
            </p>
          </section>
        )}

        {failed && (
          <p role="alert" className="text-sm text-site-text-muted">
            {t('schedule-error', { defaultValue: 'Could not load the schedule just now.' })}
          </p>
        )}

        {!grid && !failed && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-fill h-20 rounded-site" />
            ))}
          </div>
        )}

        {grid?.byDay.map((bucket) => (
          <section key={bucket.day} className="glass-fill rounded-site p-4">
            <h2 className="text-sm font-bold text-site-text">{dayLabel(bucket.day)}</h2>
            {bucket.occurrences.length === 0 ? (
              <p className="mt-2 text-sm text-site-text-muted">
                {t('schedule-quiet', { defaultValue: 'Nothing scheduled.' })}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {bucket.occurrences.map((o) => (
                  <li key={`${o.slotId}-${o.startsAt}`} className="flex items-baseline gap-3">
                    <Circle
                      className={`size-2 shrink-0 fill-current ${KIND_TINT[o.kind] ?? 'text-site-text-muted'}`}
                      aria-hidden
                    />
                    <span className="shrink-0 font-mono text-xs tabular-nums text-site-text-muted">
                      {time(o.startsAt)}
                    </span>
                    <span className="text-sm text-site-text">
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

        <p className="flex items-center gap-2 pt-2 text-xs text-site-text-muted">
          <CalendarClock className="size-3.5" aria-hidden />
          {t('schedule-timezone', {
            defaultValue: 'Times are shown in your device timezone.',
          })}
        </p>
      </div>
    </PageLayout>
  );
}
