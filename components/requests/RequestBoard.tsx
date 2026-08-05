'use client';

/**
 * The public request board (F22).
 *
 * `/roadmap` used to be a one-way broadcast and `Feedback` a queue nobody
 * outside the team could see, so a user had no way to tell whether their idea
 * was received, wanted by anyone else, or already answered. This is the other
 * half of the page: the same roadmap, plus what people are actually asking for
 * and what the team said back.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox, Plus, Search } from 'lucide-react';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { REQUEST_STATUSES, type RequestSort, type RequestStatus } from '@/lib/requests/status';
import type { FeatureRequestDTO, RequestBoardPage } from '@/lib/requests/schema';
import { RequestCard } from './RequestCard';
import { NewRequestDialog } from './NewRequestDialog';
import { useRequestStatusLabels } from './RequestStatusBadge';

const ALL = 'ALL';

interface RequestBoardProps {
  initial: RequestBoardPage;
  signedIn: boolean;
  isAdmin: boolean;
}

export function RequestBoard({ initial, signedIn, isAdmin }: RequestBoardProps) {
  const { t } = useTranslation('c-roadmap');
  const labels = useRequestStatusLabels();

  const [filter, setFilter] = useState<RequestStatus | typeof ALL>(ALL);
  const [sort, setSort] = useState<RequestSort>('top');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<RequestBoardPage>(initial);
  const [loading, setLoading] = useState(false);
  const [composing, setComposing] = useState(false);

  /**
   * The board refetches on filter/sort/search rather than filtering in memory:
   * the first page is 20 rows and the counts are per-status totals, so a client
   * filter would show "PLANNED (14)" above three cards.
   */
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ sort });
      if (filter !== ALL) params.set('status', filter);
      if (query.trim()) params.set('q', query.trim());
      setLoading(true);
      fetch(`/api/requests?${params.toString()}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<RequestBoardPage>) : Promise.reject()))
        .then(setPage)
        .catch(() => {
          /* aborted or offline — keep showing the last good page */
        })
        .finally(() => setLoading(false));
      // Debounced so typing in the search box is one request, not one per key.
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [filter, sort, query]);

  const applyVote = useCallback((requestId: string, voteCount: number, hasVoted: boolean) => {
    setPage((prev) => ({
      ...prev,
      requests: prev.requests.map((r) =>
        r.id === requestId ? { ...r, voteCount, hasVoted } : r,
      ),
    }));
  }, []);

  const applyChange = useCallback((next: FeatureRequestDTO) => {
    setPage((prev) => ({
      ...prev,
      requests: prev.requests.map((r) => (r.id === next.id ? { ...r, ...next } : r)),
    }));
  }, []);

  const tabs: LiquidTab[] = [
    {
      id: ALL,
      label: t('request-filter-all', { defaultValue: 'All' }),
      count: REQUEST_STATUSES.reduce((sum, s) => sum + (page.counts[s] ?? 0), 0),
    },
    ...REQUEST_STATUSES.map((status) => ({
      id: status,
      label: labels[status],
      count: page.counts[status] ?? 0,
    })),
  ];

  return (
    <section className="glass-pane mt-8 rounded-site p-4 sm:p-6" aria-labelledby="request-board">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="request-board" className="font-display text-xl font-bold text-site-text">
            {t('request-board-title', { defaultValue: 'Request board' })}
          </h2>
          <p className="mt-1 text-sm text-site-text-muted">
            {t('request-board-lede', {
              defaultValue:
                'Ask for something, vote on what others asked for, and see what we said back.',
            })}
          </p>
        </div>
        <Button variant="accent" size="sm" onClick={() => setComposing(true)} disabled={!signedIn}>
          <Plus aria-hidden />
          {t('request-new', { defaultValue: 'New request' })}
        </Button>
      </div>

      <LiquidTabs
        tabs={tabs}
        value={filter}
        onChange={(id) => setFilter(id as RequestStatus | typeof ALL)}
        aria-label={t('request-filter-label', { defaultValue: 'Filter requests by status' })}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-site-text-dim"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            placeholder={t('request-search-placeholder', {
              defaultValue: 'Search before you file…',
            })}
            aria-label={t('request-search-label', { defaultValue: 'Search requests' })}
          />
        </div>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as RequestSort)}
          controlSize="sm"
          aria-label={t('request-sort-label', { defaultValue: 'Sort requests' })}
        >
          <option value="top">{t('request-sort-top', { defaultValue: 'Most wanted' })}</option>
          <option value="new">{t('request-sort-new', { defaultValue: 'Newest' })}</option>
          <option value="status">{t('request-sort-status', { defaultValue: 'By status' })}</option>
        </Select>
      </div>

      <div className="mt-4 space-y-3">
        {loading && page.requests.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : page.requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('request-empty-title', { defaultValue: 'Nothing here yet' })}
            description={t('request-empty-description', {
              defaultValue: 'Be the first to ask for something in this category.',
            })}
          />
        ) : (
          page.requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              signedIn={signedIn}
              isAdmin={isAdmin}
              onChanged={applyChange}
              onVoted={applyVote}
            />
          ))
        )}
      </div>

      {!signedIn ? (
        <p className="mt-3 text-center text-xs text-site-text-dim">
          {t('request-sign-in-hint', { defaultValue: 'Sign in to file a request or vote.' })}
        </p>
      ) : null}

      <NewRequestDialog
        open={composing}
        onOpenChange={setComposing}
        onCreated={(created) =>
          setPage((prev) => ({ ...prev, requests: [created, ...prev.requests] }))
        }
      />
    </section>
  );
}
