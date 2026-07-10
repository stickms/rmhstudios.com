/**
 * RMH Ladder — Jobs route.
 *
 * URL-driven filters (validateSearch + loaderDeps) → server-fn loader calls
 * listJobs. Actions (Save/Apply/Ignore) call setJobAction via a POST server fn.
 * "Load more" appends rows client-side with an incrementing cursor.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import {
  listJobs,
  type QueriesPrisma,
  type ListJobsFilters,
  type JobRow,
} from '@/lib/rmhladder/server/queries';
import {
  setJobAction,
  type ActionsPrisma,
  type JobActionValue,
} from '@/lib/rmhladder/server/actions';
import { FilterChips } from '@/components/rmhladder/FilterChips';
import { JobsTable } from '@/components/rmhladder/JobsTable';
import { JobDrawer } from '@/components/rmhladder/JobDrawer';

// ── Server functions ─────────────────────────────────────────────────────────

// Cast the Prisma client to the structural interfaces used by the query layer.
// The real client satisfies the interface at runtime; TypeScript's strict
// function-parameter variance makes a direct assignment fail.
const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

const fetchJobsSchema = z.object({
  preset: z.enum(['new', 'finance', 'consulting', 'tech', 'expiring', 'remote']).optional(),
  q: z.string().max(200).optional(),
  cities: z.array(z.string()).max(50).optional(),
  programTypes: z.array(z.string()).max(50).optional(),
  includeNonUS: z.boolean().optional(),
  sort: z.enum(['relevance', 'posted', 'deadline']).optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
  take: z.number().int().min(1).max(100).optional(),
});

const setJobActionSchema = z.object({
  jobId: z.string().min(1),
  action: z.enum(['saved', 'applied', 'ignored']).nullable(),
});

const fetchJobs = createServerFn({ method: 'GET' })
  .validator((input: unknown) => fetchJobsSchema.parse(input))
  .handler(async ({ data: filters }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/jobs' } });
    return listJobs(queriesPrisma, session.user.id, filters);
  });

const doSetJobAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setJobActionSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/jobs' } });
    return setJobAction(actionsPrisma, session.user.id, data.jobId, data.action);
  });

// ── Route definition ─────────────────────────────────────────────────────────

const VALID_PRESETS: ReadonlyArray<string> = [
  'new', 'finance', 'consulting', 'tech', 'expiring', 'remote',
];
const VALID_SORTS: ReadonlyArray<string> = ['relevance', 'posted', 'deadline'];

function asPreset(v: unknown): ListJobsFilters['preset'] {
  return typeof v === 'string' && VALID_PRESETS.includes(v)
    ? (v as NonNullable<ListJobsFilters['preset']>)
    : undefined;
}

function asSort(v: unknown): ListJobsFilters['sort'] {
  return typeof v === 'string' && VALID_SORTS.includes(v)
    ? (v as NonNullable<ListJobsFilters['sort']>)
    : undefined;
}

function asStrings(v: unknown): string[] | undefined {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return undefined;
}

export const Route = createFileRoute('/rmhladder/jobs')({
  validateSearch: (search: Record<string, unknown>): ListJobsFilters => ({
    preset:       asPreset(search.preset),
    q:            typeof search.q === 'string' && search.q ? search.q : undefined,
    cities:       asStrings(search.cities),
    programTypes: asStrings(search.programTypes),
    includeNonUS: search.includeNonUS === true || search.includeNonUS === 'true' || undefined,
    sort:         asSort(search.sort),
  }),
  // Make the validated search params available to the loader as deps
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchJobs({ data: deps }),
  component: JobsPage,
});

// ── Page component ───────────────────────────────────────────────────────────

function JobsPage() {
  const loaderData  = Route.useLoaderData();
  const search      = Route.useSearch();
  const navigate    = useNavigate({ from: '/rmhladder/jobs' });
  const router      = useRouter();

  // Accumulated rows — resets when loaderData changes (filter → loader reruns)
  const [rows, setRows]               = useState<JobRow[]>(() => loaderData.rows);
  const [nextCursor, setNextCursor]   = useState<string | null>(() => loaderData.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  // Sync state when loaderData changes (filters changed)
  const prevLoaderRef = useRef(loaderData);
  useEffect(() => {
    if (prevLoaderRef.current !== loaderData) {
      prevLoaderRef.current = loaderData;
      setRows(loaderData.rows);
      setNextCursor(loaderData.nextCursor);
    }
  }, [loaderData]);

  // Drawer state
  const [drawerJob, setDrawerJob] = useState<JobRow | null>(null);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleCloseDrawer = useCallback(() => {
    setDrawerJob(null);
  }, []);

  function updateFilter(patch: Partial<ListJobsFilters>) {
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    });
  }

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await fetchJobs({ data: { ...search, cursor: nextCursor } });
      setRows((prev) => [...prev, ...more.rows]);
      setNextCursor(more.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleAction(jobId: string, action: JobActionValue) {
    await doSetJobAction({ data: { jobId, action } });
    // Optimistic update — reflect new action in rows and drawer immediately
    if (drawerJob && (drawerJob.id as string) === jobId) {
      setDrawerJob({ ...drawerJob, userAction: action });
    }
    setRows((prev) =>
      prev.map((r) => ((r.id as string) === jobId ? { ...r, userAction: action } : r)),
    );
    // Revalidate so fresh loader data is ready on next filter change
    await router.invalidate();
  }

  const includeNonUS = search.includeNonUS === true;

  return (
    <div>
      {/* Page header */}
      <div className="rl-page-header">
        <p className="rl-eyebrow">RMHLADDER · JOBS</p>
        <h1 className="rl-display">Jobs</h1>
      </div>

      {/* Filters */}
      <FilterChips search={search} onUpdate={updateFilter} />

      {/* Table or empty state */}
      {rows.length === 0 ? (
        <div className="rl-empty-state">
          <p>
            No postings match. Loosen a filter, or run the pipeline:{' '}
            <code>pnpm ladder:run</code>
          </p>
        </div>
      ) : (
        <>
          <JobsTable
            rows={rows}
            includeNonUS={includeNonUS}
            onRowClick={(row) => setDrawerJob(row)}
            onAction={handleAction}
          />

          {nextCursor && (
            <button
              type="button"
              className="rl-load-more"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}

      {/* Detail drawer */}
      <JobDrawer
        job={drawerJob}
        onClose={handleCloseDrawer}
        onAction={handleAction}
      />
    </div>
  );
}
