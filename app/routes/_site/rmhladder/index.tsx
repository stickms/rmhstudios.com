/**
 * RMH Ladder — Overview.
 *
 * Four display-serif stats, the last-run ledger line, and two quick lists
 * (top matches by relevance, expiring soon). No charts by design.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ListX } from 'lucide-react';
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
import { EmptyState } from '@/components/ui/empty-state';
import { buildCanonical, buildMeta } from '@/lib/seo';

const queriesPrisma = prisma as unknown as QueriesPrisma;

const fetchOverview = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  const adminRow = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
    : null;
  const isAdmin = adminRow?.isAdmin === true;
  const [overview, top, expiring] = await Promise.all([
    getOverview(queriesPrisma, userId, { includeAdminStats: isAdmin }),
    listJobs(queriesPrisma, userId, { sort: 'relevance', take: 8 }),
    listJobs(queriesPrisma, userId, { preset: 'expiring', sort: 'deadline', take: 8 }),
  ]);
  return {
    overview,
    topRows: top.rows,
    expiringRows: expiring.rows,
    isAdmin,
    isAuthenticated: Boolean(userId),
  };
});

export const Route = createFileRoute('/_site/rmhladder/')({
  head: () => ({
    meta: buildMeta({
      title: 'RMH Ladder | Verified Early-Career Jobs',
      description:
        'Browse verified internships, new-grad programs, and early-career roles from official company sources.',
      path: '/rmhladder',
    }),
    links: [buildCanonical('/rmhladder')],
  }),
  loader: () => fetchOverview(),
  component: OverviewPage,
});

function useLastRunLine(lastRun: Record<string, unknown> | null): string {
  const { t } = useTranslation('site');
  if (!lastRun) {
    return t('ladder-awaiting-first-run', {
      defaultValue: 'AWAITING THE FIRST AUTOMATED UPDATE',
    });
  }
  return t('ladder-last-run', {
    defaultValue: 'LAST RUN · {{ago}} · {{found}} FOUND · {{errors}} ERRORS',
    ago: timeAgo(lastRun.startedAt as Date).toUpperCase(),
    found: lastRun.discoveredCount ?? 0,
    errors: lastRun.errorCount ?? 0,
  });
}

function QuickList({
  title,
  emptyTitle,
  emptyHint,
  rows,
  renderMeta,
}: {
  title: string;
  emptyTitle: string;
  emptyHint: string;
  rows: JobRow[];
  renderMeta: (row: JobRow) => React.ReactNode;
}) {
  return (
    <section className="rl-quicklist">
      <h2 className="rl-eyebrow">{title}</h2>
      {rows.length === 0 ? (
        // Canonical EmptyState, as /messages already uses — this was a bare
        // hardcoded `<p>Nothing here yet.</p>` that also skipped t().
        <EmptyState icon={ListX} title={emptyTitle} description={emptyHint} />
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id as string} className="rl-quicklist__row rl-hairline">
              <Link
                to="/rmhladder/jobs/$jobId"
                params={{ jobId: row.id as string }}
                className="rl-quicklist__link"
              >
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
  const { overview, topRows, expiringRows, isAdmin, isAuthenticated } = Route.useLoaderData();
  const { t } = useTranslation('site');
  const lastRun = useLastRunLine(overview.lastRun);

  return (
    <div>
      <div className="rl-stats-grid">
        <StatBlock
          label={t('ladder-stat-new', { defaultValue: 'New this week' })}
          value={overview.newThisWeek}
        />
        <StatBlock
          label={t('ladder-stat-verified', { defaultValue: 'Verified active' })}
          value={overview.verifiedActive}
        />
        <StatBlock
          label={t('ladder-stat-expiring', { defaultValue: 'Expiring soon' })}
          value={overview.expiringSoon}
        />
        {isAdmin ? (
          <Link
            to="/rmhladder/review"
            className="rl-stat-link"
            aria-label={t('ladder-open-review-queue', { defaultValue: 'Open review queue' })}
          >
            <StatBlock
              label={t('ladder-stat-review', { defaultValue: 'Open review' })}
              value={overview.openReviewTasks}
            />
          </Link>
        ) : isAuthenticated ? (
          <StatBlock
            label={t('ladder-stat-saved', { defaultValue: 'Saved jobs' })}
            value={overview.savedCount}
          />
        ) : null}
      </div>

      <p className="rl-lastrun rl-mono">{lastRun}</p>

      <div className="rl-quicklists">
        <QuickList
          title={
            isAuthenticated
              ? t('ladder-top-matches', { defaultValue: 'Top matches' })
              : t('ladder-top-opportunities', { defaultValue: 'Top opportunities' })
          }
          emptyTitle={t('ladder-no-matches', { defaultValue: 'No roles to show yet' })}
          emptyHint={t('ladder-no-matches-hint', {
            defaultValue: 'The next automated run will fill this in.',
          })}
          rows={topRows}
          renderMeta={(row) => (
            <span className="rl-quicklist__meta">
              <RungMeter score={row.finalRelevance} size="sm" />
              <span className="rl-mono">{row.finalRelevance}</span>
            </span>
          )}
        />
        <QuickList
          title={t('ladder-expiring-soon', { defaultValue: 'Expiring soon' })}
          emptyTitle={t('ladder-no-expiring', { defaultValue: 'Nothing expiring soon' })}
          emptyHint={t('ladder-no-expiring-hint', {
            defaultValue: 'Roles approaching their deadline will be listed here.',
          })}
          rows={expiringRows}
          renderMeta={(row) => (
            <span className="rl-quicklist__meta rl-mono rl-expiring">
              ⚑{' '}
              {row.applicationDeadline
                ? new Date(row.applicationDeadline as Date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                : '—'}
            </span>
          )}
        />
      </div>
    </div>
  );
}
