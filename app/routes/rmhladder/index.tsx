/**
 * RMH Ladder — Overview.
 *
 * Four display-serif stats, the last-run ledger line, and two quick lists
 * (top matches by relevance, expiring soon). No charts by design.
 */

import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import {
  getOverview,
  listJobs,
  type QueriesPrisma,
  type JobRow,
} from '@/lib/rmhladder/server/queries';
import { RungMeter } from '@/components/rmhladder/RungMeter';
import { StatBlock } from '@/components/rmhladder/StatBlock';
import { timeAgo } from '@/components/rmhladder/time';

const queriesPrisma = prisma as unknown as QueriesPrisma;

const fetchOverview = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder' } });
  const userId = session.user.id;
  const [overview, top, expiring] = await Promise.all([
    getOverview(queriesPrisma, userId),
    listJobs(queriesPrisma, userId, { sort: 'relevance', take: 8 }),
    listJobs(queriesPrisma, userId, { preset: 'expiring', sort: 'deadline', take: 8 }),
  ]);
  return { overview, topRows: top.rows, expiringRows: expiring.rows };
});

export const Route = createFileRoute('/rmhladder/')({
  loader: () => fetchOverview(),
  component: OverviewPage,
});

function lastRunLine(lastRun: Record<string, unknown> | null): string {
  if (!lastRun) return 'NO RUNS YET — pnpm ladder:run';
  const ago = timeAgo(lastRun.startedAt as Date).toUpperCase();
  return `LAST RUN · ${ago} · ${lastRun.discoveredCount ?? 0} FOUND · ${lastRun.errorCount ?? 0} ERRORS`;
}

function QuickList({ title, rows, renderMeta }: {
  title: string;
  rows: JobRow[];
  renderMeta: (row: JobRow) => React.ReactNode;
}) {
  return (
    <section className="rl-quicklist">
      <h2 className="rl-eyebrow">{title}</h2>
      {rows.length === 0 ? (
        <p className="rl-quicklist__empty">Nothing here yet.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id as string} className="rl-quicklist__row rl-hairline">
              <Link to="/rmhladder/jobs" className="rl-quicklist__link">
                <span className="rl-quicklist__title">
                  {row.title as string}
                  <span className="rl-quicklist__company">
                    {(row.company as Record<string, unknown> | undefined)?.name as string}
                  </span>
                </span>
                {renderMeta(row)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OverviewPage() {
  const { overview, topRows, expiringRows } = Route.useLoaderData();

  return (
    <div>
      <div className="rl-page-header">
        <p className="rl-eyebrow">RMHLADDER · OVERVIEW</p>
        <h1 className="rl-display">Overview</h1>
      </div>

      <div className="rl-stats-grid">
        <StatBlock label="New this week" value={overview.newThisWeek} />
        <StatBlock label="Verified active" value={overview.verifiedActive} />
        <StatBlock label="Expiring soon" value={overview.expiringSoon} />
        <Link to="/rmhladder/review" className="rl-stat-link" aria-label="Open review queue">
          <StatBlock label="Open review" value={overview.openReviewTasks} />
        </Link>
      </div>

      <p className="rl-lastrun rl-mono">{lastRunLine(overview.lastRun)}</p>

      <div className="rl-quicklists">
        <QuickList
          title="Top matches"
          rows={topRows}
          renderMeta={(row) => (
            <span className="rl-quicklist__meta">
              <RungMeter score={row.finalRelevance} size="sm" />
              <span className="rl-mono">{row.finalRelevance}</span>
            </span>
          )}
        />
        <QuickList
          title="Expiring soon"
          rows={expiringRows}
          renderMeta={(row) => (
            <span className="rl-quicklist__meta rl-mono rl-expiring">
              ⚑ {row.applicationDeadline
                ? new Date(row.applicationDeadline as Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—'}
            </span>
          )}
        />
      </div>
    </div>
  );
}
