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
import { timeAgo } from '@/components/rmhladder/time';

const queriesPrisma = prisma as unknown as QueriesPrisma;

const fetchHealth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/health' } });
  const [stale, runs, overview] = await Promise.all([
    listStaleSources(queriesPrisma),
    listRuns(queriesPrisma, 20),
    getOverview(queriesPrisma, session.user.id),
  ]);
  return { stale, runs, openReviewTasks: overview.openReviewTasks };
});

export const Route = createFileRoute('/rmhladder/health')({
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
  const { stale, runs, openReviewTasks } = Route.useLoaderData();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  return (
    <div>
      <div className="rl-page-header">
        <p className="rl-eyebrow">RMHLADDER · HEALTH</p>
        <h1 className="rl-display">System Health</h1>
      </div>

      <Link to="/rmhladder/review" className="rl-chip rl-review-chip">
        Review queue · {openReviewTasks} open
      </Link>

      {/* Silent sources — the page's thesis */}
      <section className="rl-stale-panel">
        <h2 className="rl-eyebrow">Silent ≥ 48h</h2>
        {(stale as AnyRow[]).length === 0 ? (
          <p className="rl-quicklist__empty">Every active source has reported within 48 hours.</p>
        ) : (
          <ul>
            {(stale as AnyRow[]).map((s) => (
              <li key={s.id as string} className="rl-stale-row">
                <span className="rl-stale-row__company">
                  {((s.company as AnyRow | undefined)?.name as string) ?? (s.companyId as string)}
                </span>
                <span className="rl-program-chip">{s.platform as string}</span>
                <span className="rl-mono">
                  {s.lastSuccessAt ? `last ok ${timeAgo(s.lastSuccessAt as Date)}` : 'never succeeded'}
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
              <th scope="col"><span className="rl-visually-hidden">Details</span></th>
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
                  <td><span className="rl-program-chip">{run.trigger as string}</span></td>
                  <td>
                    {errors.length > 0 && (
                      <button
                        type="button"
                        className="rl-chip"
                        aria-expanded={expanded}
                        onClick={() => setExpandedRun(expanded ? null : (run.id as string))}
                      >
                        {expanded ? 'Hide errors' : `${errors.length} error${errors.length > 1 ? 's' : ''}`}
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
          <p className="rl-quicklist__empty">No runs recorded. Start one: <code>pnpm ladder:run</code></p>
        )}
      </section>
    </div>
  );
}
