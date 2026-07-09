/**
 * RMH Ladder — Companies.
 *
 * All seeded firms with per-platform source status dots, priority stepper,
 * enabled toggle, watchlist star, and expandable source detail.
 */

import { useEffect, useRef, useState } from 'react';
import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listCompanies, getSettings, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import {
  setCompanyEnabled,
  setCompanyPriority,
  toggleWatchlist,
  type ActionsPrisma,
} from '@/lib/rmhladder/server/actions';
import { timeAgo } from '@/components/rmhladder/time';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

type AnyRow = Record<string, unknown>;

const fetchCompanies = createServerFn({ method: 'GET' })
  .validator((input: { q?: string }) => input)
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/companies' } });
    const [companies, settings] = await Promise.all([
      listCompanies(queriesPrisma, { q: data.q }),
      getSettings(queriesPrisma, session.user.id),
    ]);
    return { companies, watchlistCompanyIds: settings.watchlistCompanyIds };
  });

const doCompanyAction = createServerFn({ method: 'POST' })
  .validator(
    (input:
      | { kind: 'enabled'; companyId: string; enabled: boolean }
      | { kind: 'priority'; companyId: string; priorityLevel: number }
      | { kind: 'watchlist'; companyId: string; on: boolean }) => input,
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/companies' } });
    if (data.kind === 'enabled') return setCompanyEnabled(actionsPrisma, data.companyId, data.enabled);
    if (data.kind === 'priority') return setCompanyPriority(actionsPrisma, data.companyId, data.priorityLevel);
    return toggleWatchlist(actionsPrisma, session.user.id, data.companyId, data.on);
  });

interface CompaniesSearch {
  q?: string;
}

export const Route = createFileRoute('/rmhladder/companies')({
  validateSearch: (search: Record<string, unknown>): CompaniesSearch => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchCompanies({ data: { q: deps.q } }),
  component: CompaniesPage,
});

const API_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'manual'] as const;

function dotTone(platform: string, status: string | undefined): string {
  if (!status) return 'rl-dot--absent';
  if (status === 'active') return platform === 'manual' ? 'rl-dot--brass' : 'rl-dot--ledger';
  if (status === 'error' || status === 'blocked') return 'rl-dot--signal';
  return 'rl-dot--slate';
}

function CompaniesPage() {
  const { companies, watchlistCompanyIds } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/rmhladder/companies' });
  const router = useRouter();

  // Local optimistic copies
  const [rows, setRows] = useState<AnyRow[]>(companies as AnyRow[]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set(watchlistCompanyIds));
  const [expanded, setExpanded] = useState<string | null>(null);

  const prevRef = useRef(companies);
  useEffect(() => {
    if (prevRef.current !== companies) {
      prevRef.current = companies;
      setRows(companies as AnyRow[]);
      setWatchlist(new Set(watchlistCompanyIds));
    }
  }, [companies, watchlistCompanyIds]);

  // Debounced search box (mirrors jobs.tsx pattern)
  const [qInput, setQInput] = useState(search.q ?? '');
  const typingRef = useRef(false);
  useEffect(() => {
    if (!typingRef.current) return;
    const t = setTimeout(() => {
      void navigate({ search: qInput ? { q: qInput } : {}, replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, navigate]);

  function patchRow(companyId: string, patch: AnyRow) {
    setRows((prev) => prev.map((r) => (r.id === companyId ? { ...r, ...patch } : r)));
  }

  async function handlePriority(companyId: string, next: number) {
    if (next < 1 || next > 5) return;
    patchRow(companyId, { priorityLevel: next });
    await doCompanyAction({ data: { kind: 'priority', companyId, priorityLevel: next } });
    await router.invalidate();
  }

  async function handleEnabled(companyId: string, enabled: boolean) {
    patchRow(companyId, { enabled });
    await doCompanyAction({ data: { kind: 'enabled', companyId, enabled } });
    await router.invalidate();
  }

  async function handleWatchlist(companyId: string, on: boolean) {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (on) next.add(companyId);
      else next.delete(companyId);
      return next;
    });
    await doCompanyAction({ data: { kind: 'watchlist', companyId, on } });
    await router.invalidate();
  }

  return (
    <div>
      <div className="rl-page-header">
        <p className="rl-eyebrow">RMHLADDER · COMPANIES</p>
        <h1 className="rl-display">Companies</h1>
      </div>

      <div className="rl-filter-bar">
        <input
          type="search"
          className="rl-search-box"
          placeholder="Search companies"
          aria-label="Search companies"
          value={qInput}
          onChange={(e) => {
            typingRef.current = true;
            setQInput(e.target.value);
          }}
        />
        <span className="rl-eyebrow">{rows.length} companies</span>
      </div>

      <table className="rl-jobs-table rl-companies-table">
        <thead>
          <tr>
            <th scope="col">Company</th>
            <th scope="col">Priority</th>
            <th scope="col">Sources</th>
            <th scope="col">Active jobs</th>
            <th scope="col">Enabled</th>
            <th scope="col">Watch</th>
            <th scope="col"><span className="rl-visually-hidden">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const sources = (c.sources as AnyRow[] | undefined) ?? [];
            const byPlatform = new Map(sources.map((s) => [s.platform as string, s]));
            const isExpanded = expanded === c.id;
            const watched = watchlist.has(c.id as string);
            const priority = c.priorityLevel as number;
            return [
              <tr key={c.id as string}>
                <td>
                  <div className="rl-company-cell">
                    <span>{c.name as string}</span>
                    <span className="rl-eyebrow">{c.industry as string}</span>
                  </div>
                </td>
                <td>
                  <div className="rl-priority-stepper" role="group" aria-label={`Priority for ${c.name as string}`}>
                    <button
                      type="button"
                      className="rl-chip"
                      aria-label="Higher priority"
                      disabled={priority <= 1}
                      onClick={() => void handlePriority(c.id as string, priority - 1)}
                    >
                      −
                    </button>
                    <span className="rl-mono">{priority}</span>
                    <button
                      type="button"
                      className="rl-chip"
                      aria-label="Lower priority"
                      disabled={priority >= 5}
                      onClick={() => void handlePriority(c.id as string, priority + 1)}
                    >
                      +
                    </button>
                  </div>
                </td>
                <td>
                  <div className="rl-source-dots">
                    {API_PLATFORMS.map((p) => {
                      const src = byPlatform.get(p);
                      const status = src?.status as string | undefined;
                      return (
                        <span
                          key={p}
                          className={`rl-dot ${dotTone(p, status)}`}
                          title={`${p}: ${status ?? 'none'}`}
                          aria-label={`${p}: ${status ?? 'no source'}`}
                        />
                      );
                    })}
                  </div>
                </td>
                <td className="rl-mono">{(c.activeJobCount as number) ?? 0}</td>
                <td>
                  <button
                    type="button"
                    className="rl-toggle"
                    role="switch"
                    aria-checked={c.enabled === true}
                    aria-label={`${c.enabled ? 'Disable' : 'Enable'} ${c.name as string}`}
                    onClick={() => void handleEnabled(c.id as string, !(c.enabled === true))}
                  >
                    {c.enabled ? 'On' : 'Off'}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className={`rl-star${watched ? ' rl-star--on' : ''}`}
                    aria-pressed={watched}
                    aria-label={`${watched ? 'Remove' : 'Add'} ${c.name as string} ${watched ? 'from' : 'to'} watchlist`}
                    onClick={() => void handleWatchlist(c.id as string, !watched)}
                  >
                    {watched ? '★' : '☆'}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="rl-chip"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : (c.id as string))}
                  >
                    {isExpanded ? 'Hide' : 'Sources'}
                  </button>
                </td>
              </tr>,
              isExpanded ? (
                <tr key={`${c.id as string}-sources`} className="rl-source-detail">
                  <td colSpan={7}>
                    <ul>
                      {sources.length === 0 && <li className="rl-mono">No sources configured.</li>}
                      {sources.map((s) => (
                        <li key={s.id as string} className="rl-mono">
                          {s.platform as string} · {(s.slug ?? s.url ?? '—') as string} ·{' '}
                          <span className="rl-program-chip">{s.status as string}</span> ·{' '}
                          {s.lastSuccessAt ? `ok ${timeAgo(s.lastSuccessAt as Date)}` : 'never succeeded'}
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
    </div>
  );
}
