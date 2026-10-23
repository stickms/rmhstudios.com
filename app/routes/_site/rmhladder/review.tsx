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
import {
  doResolveSchema,
  fetchTasksSchema,
} from '@/lib/rmhladder/server-fn-schemas.server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listReviewTasks, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import {
  resolveReviewTask,
  type ActionsPrisma,
  type ReviewResolution,
} from '@/lib/rmhladder/server/actions';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { timeAgo } from '@/components/rmhladder/time';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LiquidTabs } from '@/components/ui/liquid-tabs';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

type AnyRow = Record<string, unknown>;

const fetchTasks = createServerFn({ method: 'GET' })
  .validator((input: unknown) => fetchTasksSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/review' } });
    const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
    if (!admin?.isAdmin) throw redirect({ to: '/rmhladder' });
    const tasks = await listReviewTasks(queriesPrisma, { status: data.tab });
    return { tasks: data.tab === 'resolved' ? tasks.slice(0, 50) : tasks };
  });

const doResolve = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doResolveSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/review' } });
    const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
    if (!admin?.isAdmin) throw redirect({ to: '/rmhladder' });
    return resolveReviewTask(actionsPrisma, session.user.id, data.taskId, data.resolution);
  });

interface ReviewSearch {
  // optional so plain <Link to="/rmhladder/review"> stays valid; runtime default 'open'
  tab?: 'open' | 'resolved';
}

export const Route = createFileRoute('/_site/rmhladder/review')({
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
  const { t } = useTranslation('site');
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
  const visible = (tasks as AnyRow[]).filter((row) => tab !== 'open' || !removed.has(row.id as string));

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
      setErrorLine(
        t('ladder.review.resolveFailed', {
          defaultValue: 'Could not resolve: {{error}}',
          error: result.error ?? 'unknown error',
        }),
      );
      return;
    }
    await router.invalidate();
  }

  // Group open tasks by reason
  const groups = new Map<string, AnyRow[]>();
  for (const row of visible) {
    const key = row.reason as string;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return (
    <div className="space-y-4">
      <LiquidTabs
        tabs={[
          { id: 'open', label: t('ladder.review.open', { defaultValue: 'Open' }) },
          { id: 'resolved', label: t('ladder.review.resolved', { defaultValue: 'Resolved' }) },
        ]}
        value={tab}
        onChange={(id) => void navigate({ search: { tab: id === 'resolved' ? 'resolved' : undefined }, replace: true })}
        aria-label={t('ladder.review.tabs', { defaultValue: 'Review tabs' })}
      />

      {errorLine && (
        <p role="alert" className="text-sm text-site-danger">
          {errorLine}
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={
            tab === 'open'
              ? t('ladder.review.clear', { defaultValue: 'Queue is clear. Nothing needs a human right now.' })
              : t('ladder.review.nothingResolved', { defaultValue: 'Nothing resolved yet.' })
          }
        />
      ) : tab === 'resolved' ? (
        <ul className="glass-fill divide-y divide-site-border overflow-hidden rounded-site">
          {visible.map((task) => (
            <li key={task.id as string} className="flex flex-col gap-1 px-4 py-3">
              <span className="font-semibold text-site-text">{taskTitle(task)}</span>
              <span className="rl-mono text-site-text-muted">
                {REASON_LABELS[task.reason as string]} ·{' '}
                {t('ladder.review.resolvedAs', {
                  defaultValue: 'resolved {{resolution}}',
                  resolution: task.resolution as string,
                })}
                {task.resolvedAt ? ` · ${timeAgo(task.resolvedAt as Date)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        Array.from(groups.entries()).map(([reason, groupTasks]) => (
          <section key={reason} className="space-y-3">
            <h2 className="site-section-label">
              {REASON_LABELS[reason] ?? reason} · {groupTasks.length}
            </h2>
            <ul className="glass-fill divide-y divide-site-border overflow-hidden rounded-site">
              {groupTasks.map((task) => {
                const isSourceTask = !task.jobId;
                const resolutions = isSourceTask ? SOURCE_RESOLUTIONS : JOB_RESOLUTIONS;
                return (
                  <li
                    key={task.id as string}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-semibold text-site-text">{taskTitle(task)}</span>
                      <span className="text-sm text-site-text-muted">{taskContext(task)}</span>
                      <span className="rl-mono text-site-text-dim">
                        {t('ladder.review.opened', {
                          defaultValue: 'opened {{ago}}',
                          ago: timeAgo(task.createdAt as Date),
                        })}
                      </span>
                    </div>
                    <div
                      className="flex shrink-0 flex-wrap gap-2"
                      role="group"
                      aria-label={t('ladder.review.resolutions', { defaultValue: 'Resolutions' })}
                    >
                      {resolutions.map((r) => (
                        <Button
                          key={r.value}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => void handleResolve(task, r.value)}
                        >
                          {r.label}
                        </Button>
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
