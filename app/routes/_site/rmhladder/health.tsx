/**
 * RMH Ladder — System Health.
 *
 * Thesis first: sources that have gone silent (stale lastSuccessAt is the
 * only signal for a quietly-failing board). Then the scrape-run ledger.
 */

import { useState } from 'react';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import {
  getOverview,
  listRuns,
  listStaleSources,
  type QueriesPrisma,
} from '@/lib/rmhladder/server/queries';
import { resumeSubsystemReadiness } from '@/lib/rmhladder/resume/readiness.server';
import { detectLadderHealthAlerts, resolveAlertThresholds } from '@/lib/rmhladder/health-alerts';
import { timeAgo } from '@/components/rmhladder/time';

const queriesPrisma = prisma as unknown as QueriesPrisma;

const fetchHealth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/health' } });
  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!admin?.isAdmin) throw redirect({ to: '/rmhladder' });
  const resumeReadiness = resumeSubsystemReadiness();
  const [stale, runs, overview, openMassExpiryTasks] = await Promise.all([
    listStaleSources(queriesPrisma),
    listRuns(queriesPrisma, 20),
    getOverview(queriesPrisma, session.user.id, { includeAdminStats: true }),
    prisma.ladderReviewTask.count({ where: { reason: 'mass_expiry_suspected', status: 'open' } }),
  ]);

  // Derive last-completed-run signals from the already-fetched runs (sorted by startedAt desc).
  const lastCompletedRun = (runs as AnyRow[]).find((r) => r.finishedAt != null) ?? null;
  const lastCompletedRunAt = lastCompletedRun ? (lastCompletedRun.finishedAt as Date) : null;
  const latestRun = lastCompletedRun
    ? {
        errorCount: lastCompletedRun.errorCount as number,
        discoveredCount: lastCompletedRun.discoveredCount as number,
      }
    : null;

  const alerts = detectLadderHealthAlerts({
    now: new Date(),
    lastCompletedRunAt,
    latestRun,
    openMassExpiryTasks,
    resumeReady: resumeReadiness.ready,
    thresholds: resolveAlertThresholds(),
  });

  return { stale, runs, openReviewTasks: overview.openReviewTasks, resumeReadiness, alerts };
});

export const Route = createFileRoute('/_site/rmhladder/health')({
  loader: () => fetchHealth(),
  component: HealthPage,
});

type AnyRow = Record<string, unknown>;

function durationLabel(run: AnyRow): string {
  if (!run.startedAt || !run.finishedAt) return '—';
  const ms = new Date(run.finishedAt as Date).getTime() - new Date(run.startedAt as Date).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function HealthPage() {
  const { stale, runs, openReviewTasks, resumeReadiness, alerts } = Route.useLoaderData();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  return (
    <div>
      <Link to="/rmhladder/review" className="rl-chip rl-review-chip">
        Review queue · {openReviewTasks} open
      </Link>

      <section className="rl-stale-panel">
        <h2 className="rl-eyebrow">Health alerts</h2>
        {alerts.length === 0 ? (
          <p className="rl-quicklist__empty">No active alerts — the pipeline is healthy.</p>
        ) : (
          <ul>
            {alerts.map((a) => (
              <li key={a.code} className="rl-stale-row">
                <span className="rl-program-chip">{a.severity}</span>
                <span className="rl-mono">{a.code}</span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rl-stale-panel">
        <h2 className="rl-eyebrow">Resume subsystem</h2>
        {resumeReadiness.ready ? (
          <p className="rl-quicklist__empty">Object storage and encryption key are configured.</p>
        ) : (
          <ul>
            {resumeReadiness.missing.map((item) => (
              <li key={item} className="rl-stale-row">
                <span className="rl-mono">missing: {item}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Silent sources — the page's thesis */}
      <section className="rl-stale-panel">
        <h2 className="rl-eyebrow">Silent for two scrape cycles (8h)</h2>
        {(stale as AnyRow[]).length === 0 ? (
          <p className="rl-quicklist__empty">
            Every active source has succeeded within the last eight hours.
          </p>
        ) : (
          <ul>
            {(stale as AnyRow[]).map((s) => (
              <li key={s.id as string} className="rl-stale-row">
                <span className="rl-stale-row__company">
                  {((s.company as AnyRow | undefined)?.name as string) ?? (s.companyId as string)}
                </span>
                <span className="rl-program-chip">{s.platform as string}</span>
                <span className="rl-mono">
                  {s.lastSuccessAt
                    ? `last ok ${timeAgo(s.lastSuccessAt as Date)}`
                    : 'never succeeded'}
                </span>
                <span className="rl-mono">
                  {s.lastAttemptAt
                    ? `last tried ${timeAgo(s.lastAttemptAt as Date)}`
                    : 'never attempted'}
                </span>
                <span className="rl-mono">
                  {Number(s.consecutiveFailures ?? 0)} consecutive failure
                  {Number(s.consecutiveFailures ?? 0) === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Run ledger */}
      <section>
        <h2 className="rl-eyebrow">Scrape runs</h2>
        <table className="rl-jobs-table rl-runs-table">
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Duration</th>
              <th scope="col">Found</th>
              <th scope="col">New</th>
              <th scope="col">Verified</th>
              <th scope="col">Expired</th>
              <th scope="col">Errors</th>
              <th scope="col">Trigger</th>
              <th scope="col">
                <span className="rl-visually-hidden">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(runs as AnyRow[]).map((run) => {
              const errors = (run.errors as AnyRow[] | undefined) ?? [];
              const expanded = expandedRun === run.id;
              return [
                <tr key={run.id as string}>
                  <td className="rl-mono">{timeAgo(run.startedAt as Date)}</td>
                  <td className="rl-mono">{durationLabel(run)}</td>
                  <td className="rl-mono">{run.discoveredCount as number}</td>
                  <td className="rl-mono">{run.newCount as number}</td>
                  <td className="rl-mono">{run.verifiedCount as number}</td>
                  <td className="rl-mono">{run.expiredCount as number}</td>
                  <td className="rl-mono">{run.errorCount as number}</td>
                  <td>
                    <span className="rl-program-chip">{run.trigger as string}</span>
                  </td>
                  <td>
                    {errors.length > 0 && (
                      <button
                        type="button"
                        className="rl-chip"
                        aria-expanded={expanded}
                        onClick={() => setExpandedRun(expanded ? null : (run.id as string))}
                      >
                        {expanded
                          ? 'Hide errors'
                          : `${errors.length} error${errors.length > 1 ? 's' : ''}`}
                      </button>
                    )}
                  </td>
                </tr>,
                expanded ? (
                  <tr key={`${run.id as string}-errors`} className="rl-run-errors">
                    <td colSpan={9}>
                      <ul>
                        {errors.map((e) => (
                          <li key={e.id as string} className="rl-mono">
                            [{e.errorClass as string}] {e.message as string}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
        {(runs as AnyRow[]).length === 0 && (
          <p className="rl-quicklist__empty">
            No runs recorded. Start one: <code>pnpm ladder:run</code>
          </p>
        )}
      </section>
    </div>
  );
}
