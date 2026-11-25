// Executes the remediations in remediations.ts. Server only.
//
// Every executor is idempotent enough to be safe to click twice, touches only what its
// name says, and returns one line for the admin and the audit log. The caller (the API
// route) has already checked admin auth, that the alarm exists and is firing, and that
// the action is registered for its id.

import { listJobs, listQueues, runJobAction } from '@/lib/admin/jobs.server';
import { runOutboxAction, summarizeOutbox } from '@/lib/admin/outbox-admin.server';
import type { RemediationAvailability, RemediationId } from '@/lib/oncall/remediations';

/** The repo whose deploy workflow is re-run. `GITHUB_REPOSITORY` is set in Actions; here it is optional config. */
function repository(env: NodeJS.ProcessEnv): string {
  const repo = (env.GITHUB_REPOSITORY ?? 'stickms/rmhstudios.com').trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : 'stickms/rmhstudios.com';
}

export function availability(env: NodeJS.ProcessEnv = process.env): Record<RemediationId, RemediationAvailability> {
  const hasToken = Boolean(env.ONCALL_GITHUB_TOKEN?.trim());
  return {
    'deploy.rerun': hasToken
      ? { available: true }
      : { available: false, reason: 'Set ONCALL_GITHUB_TOKEN (a token with Actions: write) on the web container.' },
    'outbox.requeue-dead': { available: true },
    'jobs.retry-failed': { available: true },
  };
}

export class RemediationError extends Error {}

/** Re-run the deploy workflow on main (workflow_dispatch). It builds, tests and ships the latest commit. */
export async function rerunDeploy(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const token = env.ONCALL_GITHUB_TOKEN?.trim();
  if (!token) throw new RemediationError('ONCALL_GITHUB_TOKEN is not set.');
  const res = await fetchImpl(
    `https://api.github.com/repos/${repository(env)}/actions/workflows/deploy.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'rmh-oncall-panel',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (res.status !== 204) {
    throw new RemediationError(
      `GitHub refused the dispatch (HTTP ${res.status}). Check the token's Actions: write scope.`,
    );
  }
  return 'Deploy workflow started on main. Watch #deploys.';
}

/** Requeue every dead outbox event, one topic at a time (each call is capped by the outbox console). */
export async function requeueDeadOutbox(adminId: string): Promise<string> {
  const topics = (await summarizeOutbox()).filter((t) => t.dead > 0);
  if (topics.length === 0) return 'No dead outbox events to requeue.';
  let affected = 0;
  for (const t of topics) {
    affected += (await runOutboxAction(adminId, 'requeue', { topic: t.topic, allDead: true })).affected;
  }
  return `Requeued ${affected} dead outbox event${affected === 1 ? '' : 's'} across ${topics.length} topic${topics.length === 1 ? '' : 's'}.`;
}

const MAX_QUEUES = 8;

/** Retry the newest failed jobs (up to 100 each) in every queue that has failures. */
export async function retryFailedJobs(adminId: string): Promise<string> {
  const queues = (await listQueues()).filter((q) => q.failed > 0).slice(0, MAX_QUEUES);
  if (queues.length === 0) return 'No failed jobs to retry.';
  let affected = 0;
  for (const q of queues) {
    const { jobs } = await listJobs(q.name, 'failed', undefined);
    const ids = jobs.slice(0, 100).map((j) => j.id);
    if (ids.length) affected += (await runJobAction(adminId, q.name, 'retry', ids)).affected;
  }
  return `Retried ${affected} failed job${affected === 1 ? '' : 's'} in ${queues.length} queue${queues.length === 1 ? '' : 's'}.`;
}

export async function runRemediation(id: RemediationId, adminId: string): Promise<string> {
  switch (id) {
    case 'deploy.rerun':
      return rerunDeploy();
    case 'outbox.requeue-dead':
      return requeueDeadOutbox(adminId);
    case 'jobs.retry-failed':
      return retryFailedJobs(adminId);
  }
}
