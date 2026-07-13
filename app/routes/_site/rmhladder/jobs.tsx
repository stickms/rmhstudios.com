/**
 * RMH Ladder — Jobs route.
 *
 * URL-driven filters (validateSearch + loaderDeps) → server-fn loader calls
 * listJobs. Actions (Save/Apply/Ignore) call setJobAction via a POST server fn.
 * "Load more" appends rows client-side with an incrementing cursor.
 */

import { useState, useEffect, useRef } from 'react';
import { createFileRoute, Outlet, redirect, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
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
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { BriefcaseBusiness } from 'lucide-react';
import { SaveSearchDialog } from '@/components/rmhladder/SaveSearchDialog';
import { buildCanonical, buildMeta } from '@/lib/seo';

// ── Server functions ─────────────────────────────────────────────────────────

// Cast the Prisma client to the structural interfaces used by the query layer.
// The real client satisfies the interface at runtime; TypeScript's strict
// function-parameter variance makes a direct assignment fail.
const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

const fetchJobsSchema = z.object({
  preset: z.enum(['new', 'finance', 'consulting', 'tech', 'expiring', 'remote', 'saved', 'ignored']).optional(),
  q: z.string().max(200).optional(),
  cities: z.array(z.string()).max(50).optional(),
  programTypes: z.array(z.string()).max(50).optional(),
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
    const result = await listJobs(queriesPrisma, session?.user?.id ?? null, filters);
    return { ...result, isAuthenticated: Boolean(session?.user) };
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
  'new', 'finance', 'consulting', 'tech', 'expiring', 'remote', 'saved', 'ignored',
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

export const Route = createFileRoute('/_site/rmhladder/jobs')({
  head: () => ({
    meta: buildMeta({
      title: 'Browse Jobs | RMH Ladder',
      description: 'Search verified internships, new-grad programs, and early-career roles from official sources.',
      path: '/rmhladder/jobs',
    }),
    links: [buildCanonical('/rmhladder/jobs')],
  }),
  validateSearch: (search: Record<string, unknown>): ListJobsFilters => ({
    preset:       asPreset(search.preset),
    q:            typeof search.q === 'string' && search.q ? search.q : undefined,
    cities:       asStrings(search.cities),
    programTypes: asStrings(search.programTypes),
    sort:         asSort(search.sort),
  }),
  // Make the validated search params available to the loader as deps
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchJobs({ data: deps }),
  component: JobsPage,
});

// ── Page component ───────────────────────────────────────────────────────────

function JobsPage() {
  const showingJobDetail = useRouterState({
    select: (state) => /^\/rmhladder\/jobs\/[^/]+\/?$/.test(state.location.pathname),
  });
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

  if (showingJobDetail) return <Outlet />;

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
    // Applying is a pipeline state; saved/ignored remain independent list actions.
    setRows((prev) => {
      if ((action === 'ignored' && search.preset !== 'ignored') || (action === null && search.preset === 'ignored')) {
        return prev.filter((row) => (row.id as string) !== jobId);
      }
      return prev.map((r) => (r.id as string) === jobId
        ? action === 'applied'
          ? { ...r, applicationStatus: 'applied' }
          : { ...r, userAction: action }
        : r);
    });
    // Revalidate so fresh loader data is ready on next filter change
    await router.invalidate();
  }

  return (
    <div>
      {/* Filters */}
      <FilterChips search={search} onUpdate={updateFilter} showPersonalPresets={loaderData.isAuthenticated} />
      {loaderData.isAuthenticated && (
        <div className="mb-4 flex justify-end">
          <SaveSearchDialog filters={search} />
        </div>
      )}

      {/* Table or empty state */}
      {rows.length === 0 ? (
        <EmptyState
          icon={BriefcaseBusiness}
          title="No verified jobs match"
          description="Try removing a filter or choosing a broader program type."
        />
      ) : (
        <>
          <JobsTable
            rows={rows}
            onRowClick={(row) => void navigate({
              to: '/rmhladder/jobs/$jobId',
              params: { jobId: row.id as string },
            })}
            onAction={loaderData.isAuthenticated ? handleAction : undefined}
          />

          {nextCursor && (
            <Button
              type="button"
              variant="outline"
              className="mx-auto mt-6 flex"
              loading={loadingMore}
              loadingText="Loading…"
              onClick={() => void handleLoadMore()}
            >
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
