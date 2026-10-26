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
import { useTranslation } from 'react-i18next';
import { timeAgo } from '@/components/rmhladder/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
  const { t } = useTranslation('site');
  const { stale, runs, openReviewTasks, resumeReadiness, alerts } = Route.useLoaderData();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const panel = 'glass-fill space-y-3 rounded-site p-5 sm:p-5';
  const rowCls = 'flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm';
  const hint = 'text-sm text-site-text-muted';

  return (
    <div className="space-y-4">
      <div>
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link to="/rmhladder/review">
            {t('ladder.health.reviewQueue', {
              defaultValue: 'Review queue · {{count}} open',
              count: openReviewTasks,
            })}
          </Link>
        </Button>
      </div>

      <section className={panel} aria-labelledby="rl-health-alerts">
        <h2 id="rl-health-alerts" className="site-section-label">
          {t('ladder.health.alerts', { defaultValue: 'Health alerts' })}
        </h2>
        {alerts.length === 0 ? (
          <p className={hint}>
            {t('ladder.health.healthy', { defaultValue: 'No active alerts — the pipeline is healthy.' })}
          </p>
        ) : (
          <ul className="divide-y divide-site-border">
            {alerts.map((a) => (
              <li key={a.code} className={rowCls}>
                <Badge variant={a.severity === 'high' ? 'danger' : 'warning'} size="sm">
                  {a.severity}
                </Badge>
                <span className="rl-mono">{a.code}</span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={panel} aria-labelledby="rl-health-resume">
        <h2 id="rl-health-resume" className="site-section-label">
          {t('ladder.health.resume', { defaultValue: 'Resume subsystem' })}
        </h2>
        {resumeReadiness.ready ? (
          <p className={hint}>
            {t('ladder.health.resumeReady', {
              defaultValue: 'Object storage and encryption key are configured.',
            })}
          </p>
        ) : (
          <ul className="divide-y divide-site-border">
            {resumeReadiness.missing.map((item) => (
              <li key={item} className={rowCls}>
                <span className="rl-mono">
                  {t('ladder.health.missing', { defaultValue: 'missing: {{item}}', item })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Silent sources — the page's thesis */}
      <section className={panel} aria-labelledby="rl-health-silent">
        <h2 id="rl-health-silent" className="site-section-label">
          {t('ladder.health.silent', { defaultValue: 'Silent for two scrape cycles (8h)' })}
        </h2>
        {(stale as AnyRow[]).length === 0 ? (
          <p className={hint}>
            {t('ladder.health.allOk', {
              defaultValue: 'Every active source has succeeded within the last eight hours.',
            })}
          </p>
        ) : (
          <ul className="divide-y divide-site-border">
            {(stale as AnyRow[]).map((s) => (
              <li key={s.id as string} className={rowCls}>
                <span className="min-w-44 font-semibold">
                  {((s.company as AnyRow | undefined)?.name as string) ?? (s.companyId as string)}
                </span>
                <Badge variant="outline" size="sm">{s.platform as string}</Badge>
                <span className="rl-mono">
                  {s.lastSuccessAt
                    ? t('ladder.health.lastOk', {
                        defaultValue: 'last ok {{ago}}',
                        ago: timeAgo(s.lastSuccessAt as Date),
                      })
                    : t('ladder.health.neverSucceeded', { defaultValue: 'never succeeded' })}
                </span>
                <span className="rl-mono">
                  {s.lastAttemptAt
                    ? t('ladder.health.lastTried', {
                        defaultValue: 'last tried {{ago}}',
                        ago: timeAgo(s.lastAttemptAt as Date),
                      })
                    : t('ladder.health.neverAttempted', { defaultValue: 'never attempted' })}
                </span>
                <span className="rl-mono">
                  {t('ladder.health.failures', {
                    defaultValue: '{{count}} consecutive failures',
                    defaultValue_one: '{{count}} consecutive failure',
                    count: Number(s.consecutiveFailures ?? 0),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Run ledger */}
      <section className="space-y-3" aria-labelledby="rl-health-runs">
        <h2 id="rl-health-runs" className="site-section-label">
          {t('ladder.health.runs', { defaultValue: 'Scrape runs' })}
        </h2>
        <table className="rl-jobs-table rl-runs-table glass-fill rounded-site">
          <thead>
            <tr>
              <th scope="col">{t('ladder.health.started', { defaultValue: 'Started' })}</th>
              <th scope="col">{t('ladder.health.duration', { defaultValue: 'Duration' })}</th>
              <th scope="col">{t('ladder.health.found', { defaultValue: 'Found' })}</th>
              <th scope="col">{t('ladder.health.new', { defaultValue: 'New' })}</th>
              <th scope="col">{t('ladder.health.verified', { defaultValue: 'Verified' })}</th>
              <th scope="col">{t('ladder.health.expired', { defaultValue: 'Expired' })}</th>
              <th scope="col">{t('ladder.health.errors', { defaultValue: 'Errors' })}</th>
              <th scope="col">{t('ladder.health.trigger', { defaultValue: 'Trigger' })}</th>
              <th scope="col">
                <span className="rl-visually-hidden">
                  {t('ladder.health.details', { defaultValue: 'Details' })}
                </span>
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
                    <Badge variant="outline" size="sm">{run.trigger as string}</Badge>
                  </td>
                  <td>
                    {errors.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-expanded={expanded}
                        onClick={() => setExpandedRun(expanded ? null : (run.id as string))}
                      >
                        {expanded
                          ? t('ladder.health.hideErrors', { defaultValue: 'Hide errors' })
                          : t('ladder.health.showErrors', {
                              defaultValue: '{{count}} errors',
                              defaultValue_one: '{{count}} error',
                              count: errors.length,
                            })}
                      </Button>
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
          <p className={hint}>
            {t('ladder.health.noRuns', { defaultValue: 'No runs recorded. Start one:' })}{' '}
            <code className="rl-mono">pnpm ladder:run</code>
          </p>
        )}
      </section>
    </div>
  );
}
