/**
 * RMH Ladder — Review Queue.
 *
 * Open tasks grouped by reason with one-click resolutions; source-level
 * tasks (no job) only offer task-only resolutions. Resolved tab for history.
 */

import { useState, useEffect, useRef } from 'react';
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listReviewTasks, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import {
  resolveReviewTask,
  type ActionsPrisma,
  type ReviewResolution,
} from '@/lib/rmhladder/server/actions';
import { timeAgo } from '@/components/rmhladder/time';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

type AnyRow = Record<string, unknown>;

const fetchTasksSchema = z.object({
  tab: z.enum(['open', 'resolved']),
});

const doResolveSchema = z.object({
  taskId: z.string().min(1),
  resolution: z.enum(['verify', 'expire', 'duplicate', 'non_us', 'ignore']),
});

const fetchTasks = createServerFn({ method: 'GET' })
  .validator((input: unknown) => fetchTasksSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/review' } });
    const tasks = await listReviewTasks(queriesPrisma, { status: data.tab });
    return { tasks: data.tab === 'resolved' ? tasks.slice(0, 50) : tasks };
  });

const doResolve = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doResolveSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/review' } });
    return resolveReviewTask(actionsPrisma, session.user.id, data.taskId, data.resolution);
  });

interface ReviewSearch {
  // optional so plain <Link to="/rmhladder/review"> stays valid; runtime default 'open'
  tab?: 'open' | 'resolved';
}

export const Route = createFileRoute('/rmhladder/review')({
  validateSearch: (search: Record<string, unknown>): ReviewSearch => ({
    tab: search.tab === 'resolved' ? 'resolved' : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchTasks({ data: { tab: deps.tab ?? 'open' } }),
  component: ReviewPage,
});

const REASON_LABELS: Record<string, string> = {
  broken_link: 'Broken link',
  blocked: 'Blocked',
  js_required: 'JS required',
  possible_duplicate: 'Possible duplicate',
  ambiguous_early_career: 'Ambiguous early-career',
  ambiguous_us_location: 'Ambiguous US location',
  low_confidence: 'Low confidence',
  aggregator_unconfirmed: 'Aggregator unconfirmed',
  mass_expiry_suspected: 'Mass expiry suspected',
};

const JOB_RESOLUTIONS: Array<{ value: ReviewResolution; label: string }> = [
  { value: 'verify', label: 'Verify' },
  { value: 'expire', label: 'Expire' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'non_us', label: 'Non-US' },
  { value: 'ignore', label: 'Ignore' },
];
const SOURCE_RESOLUTIONS = JOB_RESOLUTIONS.filter(
  (r) => r.value === 'duplicate' || r.value === 'ignore',
);

function taskContext(task: AnyRow): string {
  const job = task.job as AnyRow | undefined;
  if (job) {
    const verifications = job.verifications as AnyRow[] | undefined;
    const evidence = verifications?.[0]?.evidence as string | undefined;
    if (evidence) return evidence;
  }
  return REASON_LABELS[task.reason as string] ?? (task.reason as string);
}

function taskTitle(task: AnyRow): string {
  const job = task.job as AnyRow | undefined;
  if (job) {
    const company = (job.company as AnyRow | undefined)?.name as string | undefined;
    return company ? `${job.title as string} — ${company}` : (job.title as string);
  }
  const source = task.source as AnyRow | undefined;
  return source ? `Source: ${source.platform as string} (${(source.slug ?? source.url) as string})` : 'Source task';
}

function ReviewPage() {
  const { tasks } = Route.useLoaderData();
  const tab = Route.useSearch().tab ?? 'open';
  const navigate = useNavigate({ from: '/rmhladder/review' });
  const router = useRouter();

  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [errorLine, setErrorLine] = useState<string | null>(null);

  // Clear the optimistic-removal set when the loader refreshes (new loaderData identity)
  const prevTasksRef = useRef(tasks);
  useEffect(() => {
    if (prevTasksRef.current !== tasks) {
      prevTasksRef.current = tasks;
      setRemoved(new Set());
    }
  }, [tasks]);

  // Apply optimistic removal only on the open tab; resolved tab shows all loaded rows
  const visible = (tasks as AnyRow[]).filter((t) => tab !== 'open' || !removed.has(t.id as string));

  async function handleResolve(task: AnyRow, resolution: ReviewResolution) {
    const id = task.id as string;
    setErrorLine(null);
    setRemoved((prev) => new Set(prev).add(id)); // optimistic
    const result = await doResolve({ data: { taskId: id, resolution } });
    if (!result.ok) {
      setRemoved((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setErrorLine(`Could not resolve: ${result.error ?? 'unknown error'}`);
      return;
    }
    await router.invalidate();
  }

  // Group open tasks by reason
  const groups = new Map<string, AnyRow[]>();
  for (const t of visible) {
    const key = t.reason as string;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div>
      <div className="rl-page-header">
        <p className="rl-eyebrow">RMHLADDER · REVIEW</p>
        <h1 className="rl-display">Review Queue</h1>
      </div>

      <div className="rl-filter-bar" role="tablist" aria-label="Review tabs">
        {(['open', 'resolved'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`rl-chip${tab === t ? ' rl-chip--active' : ''}`}
            onClick={() => void navigate({ search: { tab: t }, replace: true })}
          >
            {t === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {errorLine && <p className="rl-review-error rl-mono">{errorLine}</p>}

      {visible.length === 0 ? (
        <div className="rl-empty-state">
          <p>{tab === 'open' ? 'Queue is clear. Nothing needs a human right now.' : 'Nothing resolved yet.'}</p>
        </div>
      ) : tab === 'resolved' ? (
        <ul className="rl-review-list">
          {visible.map((task) => (
            <li key={task.id as string} className="rl-review-row rl-hairline">
              <div className="rl-review-row__main">
                <span className="rl-review-row__title">{taskTitle(task)}</span>
                <span className="rl-mono rl-review-row__meta">
                  {REASON_LABELS[task.reason as string]} · resolved {task.resolution as string}
                  {task.resolvedAt ? ` · ${timeAgo(task.resolvedAt as Date)}` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        Array.from(groups.entries()).map(([reason, groupTasks]) => (
          <section key={reason} className="rl-review-group">
            <h2 className="rl-eyebrow">
              {REASON_LABELS[reason] ?? reason} · {groupTasks.length}
            </h2>
            <ul className="rl-review-list">
              {groupTasks.map((task) => {
                const isSourceTask = !task.jobId;
                const resolutions = isSourceTask ? SOURCE_RESOLUTIONS : JOB_RESOLUTIONS;
                return (
                  <li key={task.id as string} className="rl-review-row rl-hairline">
                    <div className="rl-review-row__main">
                      <span className="rl-review-row__title">{taskTitle(task)}</span>
                      <span className="rl-review-row__context">{taskContext(task)}</span>
                      <span className="rl-mono rl-review-row__meta">
                        opened {timeAgo(task.createdAt as Date)}
                      </span>
                    </div>
                    <div className="rl-review-row__actions" role="group" aria-label="Resolutions">
                      {resolutions.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          className="rl-chip"
                          onClick={() => void handleResolve(task, r.value)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
