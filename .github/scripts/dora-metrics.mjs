/* eslint-disable no-console -- CI report */
/**
 * Delivery metrics from the deploy workflow's own history (no external service).
 *
 *   deploy frequency   successful production deploys per day
 *   lead time          merge commit → deploy workflow finished (median / p90)
 *   change failure     failed deploy runs ÷ finished runs (cancelled = superseded, excluded)
 *   time to restore    a failed run → the next successful one (median)
 *
 * "Finished" here means the CI/build/gate workflow, not the host release; the
 * host's own bake/rollback outcome is reported per release by release-webhook.
 */
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const minutes = (ms) => ms / 60_000;
function quantile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** @param runs deploy workflow runs, any order: {conclusion, head_commit:{timestamp}, updated_at} */
export function computeDora(runs, days) {
  const finished = runs
    .filter((run) => run.conclusion === 'success' || run.conclusion === 'failure')
    .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at));
  const successes = finished.filter((run) => run.conclusion === 'success');
  const failures = finished.filter((run) => run.conclusion === 'failure');
  const lead = successes
    .map((run) => Date.parse(run.updated_at) - Date.parse(run.head_commit?.timestamp ?? ''))
    .filter((ms) => Number.isFinite(ms) && ms >= 0)
    .sort((a, b) => a - b);
  const restore = [];
  let failedAt = null;
  for (const run of finished) {
    if (run.conclusion === 'failure') failedAt ??= Date.parse(run.updated_at);
    else if (failedAt !== null) {
      restore.push(Date.parse(run.updated_at) - failedAt);
      failedAt = null;
    }
  }
  restore.sort((a, b) => a - b);
  const fixed = (value) => (value === null ? null : Math.round(minutes(value) * 10) / 10);
  return {
    days,
    deploys: successes.length,
    deploysPerDay: Math.round((successes.length / days) * 100) / 100,
    leadTimeMedianMin: fixed(quantile(lead, 0.5)),
    leadTimeP90Min: fixed(quantile(lead, 0.9)),
    changeFailureRate: finished.length
      ? Math.round((failures.length / finished.length) * 1000) / 1000
      : null,
    timeToRestoreMedianMin: fixed(quantile(restore, 0.5)),
  };
}

export function renderMarkdown(metrics) {
  const show = (value, unit = '') => (value === null ? 'n/a' : `${value}${unit}`);
  return [
    `### Delivery metrics — last ${metrics.days} days`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Deploys | ${metrics.deploys} (${metrics.deploysPerDay}/day) |`,
    `| Lead time, merge → deployed (median / p90) | ${show(metrics.leadTimeMedianMin, ' min')} / ${show(metrics.leadTimeP90Min, ' min')} |`,
    `| Change failure rate | ${metrics.changeFailureRate === null ? 'n/a' : `${(metrics.changeFailureRate * 100).toFixed(1)}%`} |`,
    `| Time to restore (median) | ${show(metrics.timeToRestoreMedianMin, ' min')} |`,
    '',
  ].join('\n');
}

async function fetchRuns(days, env = process.env) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/deploy.yml/runs?branch=main&event=push&status=completed&created=%3E%3D${since}&per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      signal: globalThis.AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    const batch = (await response.json()).workflow_runs ?? [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  return runs;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const days = Math.min(365, Math.max(1, Number(process.env.DORA_DAYS) || 30));
  fetchRuns(days)
    .then((runs) => {
      const markdown = renderMarkdown(computeDora(runs, days));
      console.log(markdown);
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
