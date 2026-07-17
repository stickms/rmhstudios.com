import { DEFAULT_STALE_AFTER_MS, isScrapeStale } from './scheduler';

export interface LadderStatusData {
  now: Date;
  lastCompletedRun: {
    finishedAt: Date;
    discoveredCount: number;
    newCount: number;
    expiredCount: number;
    errorCount: number;
  } | null;
  activeJobs: number;
  expiredJobs: number;
  sourcesByStatus: Record<string, number>;
  resume: { ready: boolean; missing: string[] };
  staleAfterMs: number;
}

function ageLabel(from: Date, to: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round((mins / 60) * 10) / 10;
  return `${hours}h ago`;
}

/** Human-readable prod-truth report. Pure — the CLI supplies the data. */
export function formatLadderStatus(d: LadderStatusData): string {
  const lines: string[] = [];
  lines.push('rmhladder status');
  lines.push('================');

  const run = d.lastCompletedRun;
  const stale = isScrapeStale(
    run?.finishedAt ?? null,
    d.now,
    d.staleAfterMs || DEFAULT_STALE_AFTER_MS,
  );
  if (!run) {
    lines.push(`last completed run: none (no completed run) ${stale ? '[STALE]' : ''}`.trimEnd());
  } else {
    lines.push(
      `last completed run: ${run.finishedAt.toISOString()} (${ageLabel(run.finishedAt, d.now)})${stale ? ' [STALE]' : ''}`,
    );
    lines.push(
      `  discovered=${run.discoveredCount} new=${run.newCount} expired=${run.expiredCount} errors=${run.errorCount}`,
    );
  }

  lines.push(`active jobs: ${d.activeJobs}`);
  lines.push(`expired jobs: ${d.expiredJobs}`);

  const statuses = Object.keys(d.sourcesByStatus).sort();
  lines.push('sources by status:');
  if (statuses.length === 0) {
    lines.push('  (none)');
  } else {
    for (const s of statuses) lines.push(`  ${s}: ${d.sourcesByStatus[s]}`);
  }

  if (d.resume.ready) {
    lines.push('resume subsystem: READY');
  } else {
    lines.push(`resume subsystem: NOT READY — missing: ${d.resume.missing.join('; ')}`);
  }

  return lines.join('\n');
}
