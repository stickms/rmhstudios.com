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
import {
  doCompanyActionSchema,
  fetchCompaniesSchema,
} from '@/lib/rmhladder/server-fn-schemas.server';
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
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

type AnyRow = Record<string, unknown>;

const fetchCompanies = createServerFn({ method: 'GET' })
  .validator((input: unknown) => fetchCompaniesSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/companies' } });
    const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
    if (!admin?.isAdmin) throw redirect({ to: '/rmhladder' });
    const [companies, settings] = await Promise.all([
      listCompanies(queriesPrisma, { q: data.q }),
      getSettings(queriesPrisma, session.user.id),
    ]);
    return { companies, watchlistCompanyIds: settings.watchlistCompanyIds };
  });

const doCompanyAction = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doCompanyActionSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/companies' } });
    const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
    if (!admin?.isAdmin) throw redirect({ to: '/rmhladder' });
    if (data.kind === 'enabled') return setCompanyEnabled(actionsPrisma, data.companyId, data.enabled);
    if (data.kind === 'priority') return setCompanyPriority(actionsPrisma, data.companyId, data.priorityLevel);
    return toggleWatchlist(actionsPrisma, session.user.id, data.companyId, data.on);
  });

interface CompaniesSearch {
  q?: string;
}

export const Route = createFileRoute('/_site/rmhladder/companies')({
  validateSearch: (search: Record<string, unknown>): CompaniesSearch => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchCompanies({ data: { q: deps.q } }),
  component: CompaniesPage,
});

const API_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workday', 'manual'] as const;

function CompaniesPage() {
  const { t } = useTranslation('site');
  const { companies, watchlistCompanyIds } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: '/rmhladder/companies' });
  const router = useRouter();

  // Local optimistic copies
  const [rows, setRows] = useState<AnyRow[]>(companies as AnyRow[]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set(watchlistCompanyIds));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  // How many rows are on screen. The loader hands back the whole catalog (344
  // companies today) and this page used to render every one. That was survivable
  // as a dense table; it is not as the phone card layout below, where each row
  // is seven labelled lines — 344 of them is a page tens of thousands of pixels
  // tall that has to lay out before anything is interactive. Search narrows the
  // list, and this reveals the rest a chunk at a time.
  const PAGE = 25;
  const [limit, setLimit] = useState(PAGE);

  const prevRef = useRef(companies);
  useEffect(() => {
    if (prevRef.current !== companies) {
      prevRef.current = companies;
      setRows(companies as AnyRow[]);
      setWatchlist(new Set(watchlistCompanyIds));
      setLimit(PAGE); // a new result set starts at the top again

    }
  }, [companies, watchlistCompanyIds]);

  // Debounced search box (mirrors jobs.tsx pattern)
  const [qInput, setQInput] = useState(search.q ?? '');
  const typingRef = useRef(false);
  useEffect(() => {
    if (!typingRef.current) return;
    const timer = setTimeout(() => {
      void navigate({ search: qInput ? { q: qInput } : {}, replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [qInput, navigate]);

  function patchRow(companyId: string, patch: AnyRow) {
    setRows((prev) => prev.map((r) => (r.id === companyId ? { ...r, ...patch } : r)));
  }

  async function handlePriority(companyId: string, next: number) {
    if (next < 1 || next > 5) return;
    const prev = rows.find((r) => r.id === companyId)?.priorityLevel as number | undefined;
    patchRow(companyId, { priorityLevel: next });
    setErrorLine(null);
    try {
      await doCompanyAction({ data: { kind: 'priority', companyId, priorityLevel: next } });
      await router.invalidate();
    } catch (err) {
      if (prev !== undefined) patchRow(companyId, { priorityLevel: prev });
      setErrorLine(err instanceof Error ? err.message : t('ladder.companies.priorityFailed', { defaultValue: 'Failed to update priority' }));
    }
  }

  async function handleEnabled(companyId: string, enabled: boolean) {
    const prev = rows.find((r) => r.id === companyId)?.enabled as boolean | undefined;
    patchRow(companyId, { enabled });
    setErrorLine(null);
    try {
      await doCompanyAction({ data: { kind: 'enabled', companyId, enabled } });
      await router.invalidate();
    } catch (err) {
      if (prev !== undefined) patchRow(companyId, { enabled: prev });
      setErrorLine(err instanceof Error ? err.message : t('ladder.companies.enabledFailed', { defaultValue: 'Failed to update enabled state' }));
    }
  }

  async function handleWatchlist(companyId: string, on: boolean) {
    const prevWatchlist = new Set(watchlist);
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (on) next.add(companyId);
      else next.delete(companyId);
      return next;
    });
    setErrorLine(null);
    try {
      await doCompanyAction({ data: { kind: 'watchlist', companyId, on } });
      await router.invalidate();
    } catch (err) {
      setWatchlist(prevWatchlist);
      setErrorLine(err instanceof Error ? err.message : t('ladder.companies.watchlistFailed', { defaultValue: 'Failed to update watchlist' }));
    }
  }

  return (
    <div className="space-y-4">
      {errorLine && (
        <p role="alert" className="text-sm text-site-danger">
          {errorLine}
        </p>
      )}

      <div className="rl-filter-bar">
        <Input
          type="search"
          className="sm:max-w-xs"
          placeholder={t('ladder.companies.search', { defaultValue: 'Search companies' })}
          aria-label={t('ladder.companies.search', { defaultValue: 'Search companies' })}
          value={qInput}
          onChange={(e) => {
            typingRef.current = true;
            setQInput(e.target.value);
          }}
        />
        <span className="text-sm text-site-text-muted">
          {t('ladder.companies.count', {
            defaultValue: '{{count}} companies',
            count: rows.length,
          })}
        </span>
      </div>

      <table className="rl-jobs-table rl-companies-table glass-fill rounded-site">
        <thead>
          <tr>
            <th scope="col">{t('ladder.companies.company', { defaultValue: 'Company' })}</th>
            <th scope="col">{t('ladder.companies.priority', { defaultValue: 'Priority' })}</th>
            <th scope="col">{t('ladder.companies.sources', { defaultValue: 'Sources' })}</th>
            <th scope="col">{t('ladder.companies.activeJobs', { defaultValue: 'Active jobs' })}</th>
            <th scope="col">{t('ladder.companies.enabled', { defaultValue: 'Enabled' })}</th>
            <th scope="col">{t('ladder.companies.watch', { defaultValue: 'Watch' })}</th>
            <th scope="col">
              <span className="rl-visually-hidden">
                {t('ladder.companies.details', { defaultValue: 'Details' })}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((c) => {
            const sources = (c.sources as AnyRow[] | undefined) ?? [];
            const byPlatform = new Map(sources.map((s) => [s.platform as string, s]));
            const isExpanded = expanded === c.id;
            const watched = watchlist.has(c.id as string);
            const priority = c.priorityLevel as number;
            const name = c.name as string;
            return [
              <tr key={c.id as string}>
                <td data-label={t('ladder.companies.company', { defaultValue: 'Company' })}>
                  <div className="rl-company-cell">
                    <span className="font-medium">{name}</span>
                    <span className="text-xs text-site-text-muted">{c.industry as string}</span>
                  </div>
                </td>
                <td data-label={t('ladder.companies.priority', { defaultValue: 'Priority' })}>
                  <div
                    className="rl-priority-stepper"
                    role="group"
                    aria-label={t('ladder.companies.priorityFor', {
                      defaultValue: 'Priority for {{name}}',
                      name,
                    })}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t('ladder.companies.higherPriority', { defaultValue: 'Higher priority' })}
                      disabled={priority <= 1}
                      onClick={() => void handlePriority(c.id as string, priority - 1)}
                    >
                      <Minus aria-hidden />
                    </Button>
                    <span className="rl-mono min-w-4 text-center">{priority}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={t('ladder.companies.lowerPriority', { defaultValue: 'Lower priority' })}
                      disabled={priority >= 5}
                      onClick={() => void handlePriority(c.id as string, priority + 1)}
                    >
                      <Plus aria-hidden />
                    </Button>
                  </div>
                </td>
                <td data-label={t('ladder.companies.sources', { defaultValue: 'Sources' })}>
                  <div className="rl-source-dots">
                    {API_PLATFORMS.map((p) => {
                      const src = byPlatform.get(p);
                      const status = src?.status as string | undefined;
                      const label = `${p}: ${status ?? 'none'}`;
                      return (
                        <Badge
                          key={p}
                          size="sm"
                          variant={status === 'active' ? 'success' : status === 'error' || status === 'blocked' ? 'danger' : 'outline'}
                          title={label}
                        >
                          {label}
                        </Badge>
                      );
                    })}
                  </div>
                </td>
                <td className="rl-mono" data-label={t('ladder.companies.activeJobs', { defaultValue: 'Active jobs' })}>
                  {(c.activeJobCount as number) ?? 0}
                </td>
                <td data-label={t('ladder.companies.enabled', { defaultValue: 'Enabled' })}>
                  <Switch
                    checked={c.enabled === true}
                    aria-label={
                      c.enabled
                        ? t('ladder.companies.disable', { defaultValue: 'Disable {{name}}', name })
                        : t('ladder.companies.enable', { defaultValue: 'Enable {{name}}', name })
                    }
                    onCheckedChange={(next) => void handleEnabled(c.id as string, next)}
                  />
                </td>
                <td data-label={t('ladder.companies.watch', { defaultValue: 'Watch' })}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-pressed={watched}
                    aria-label={
                      watched
                        ? t('ladder.companies.unwatch', {
                            defaultValue: 'Remove {{name}} from watchlist',
                            name,
                          })
                        : t('ladder.companies.addWatch', {
                            defaultValue: 'Add {{name}} to watchlist',
                            name,
                          })
                    }
                    onClick={() => void handleWatchlist(c.id as string, !watched)}
                  >
                    <Star
                      aria-hidden
                      className={watched ? 'fill-site-accent text-site-accent' : 'text-site-text-muted'}
                    />
                  </Button>
                </td>
                <td data-label={t('ladder.companies.details', { defaultValue: 'Details' })}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded(isExpanded ? null : (c.id as string))}
                  >
                    {isExpanded
                      ? t('ladder.companies.hide', { defaultValue: 'Hide' })
                      : t('ladder.companies.sources', { defaultValue: 'Sources' })}
                  </Button>
                </td>
              </tr>,
              isExpanded ? (
                <tr key={`${c.id as string}-sources`} className="rl-source-detail">
                  <td colSpan={7}>
                    <ul>
                      {sources.length === 0 && (
                        <li className="rl-mono">
                          {t('ladder.companies.noSources', { defaultValue: 'No sources configured.' })}
                        </li>
                      )}
                      {sources.map((s) => (
                        <li key={s.id as string} className="rl-mono">
                          {s.platform as string} · {(s.slug ?? s.url ?? '—') as string} ·{' '}
                          <Badge size="sm" variant="outline">{s.status as string}</Badge> ·{' '}
                          {s.lastSuccessAt
                            ? t('ladder.companies.okAgo', {
                                defaultValue: 'ok {{ago}}',
                                ago: timeAgo(s.lastSuccessAt as Date),
                              })
                            : t('ladder.companies.neverSucceeded', { defaultValue: 'never succeeded' })}
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

      {rows.length > limit && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setLimit((n) => n + PAGE)}
        >
          {t('ladder.companies.showMore', {
            defaultValue: 'Show more — {{remaining}} of {{total}} remaining',
            remaining: rows.length - limit,
            total: rows.length,
          })}
        </Button>
      )}
    </div>
  );
}
