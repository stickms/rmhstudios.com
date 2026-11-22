import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import {
  delistCommunityApi,
  getAdminCommunityApi,
  listAdminCommunitiesApi,
  relistCommunityApi,
} from '@/lib/admin/communities.contract';
import type { AdminCommunityRow, CommunityFilter } from '@/lib/admin/communities';
import { DELIST_REASON_MAX, DELIST_REASON_MIN } from '@/lib/communities/discovery';

/**
 * /admin/communities: communities on rules, most members first, with the filter tabs, a name or slug search, the
 * figures in `t-meta`, the out-of-discovery action (with a reason its moderators read) and a detail view of the
 * moderators, the last 20 mod-log entries and the open reports. Members and the community are never touched.
 */
export function CommunitiesAdmin({
  filter,
  onFilterChange,
}: {
  filter: CommunityFilter;
  onFilterChange: (next: CommunityFilter) => void;
}) {
  const { t } = useTranslation('admin-communities');
  const refusalText = useRefusalText();
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const query = { filter, ...(q ? { q } : {}) };
  const list = useInfiniteQuery({
    queryKey: [listAdminCommunitiesApi.path, query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listAdminCommunitiesApi, { query: { ...query, ...(pageParam ? { cursor: pageParam } : {}) }, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.communities) ?? [];
  const arrival = useArrival(!list.isPending);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    setQ(text.trim());
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [listAdminCommunitiesApi.path] });
    await queryClient.invalidateQueries({ queryKey: [getAdminCommunityApi.path] });
  };

  const takeOut = async (row: AdminCommunityRow) => {
    const reason = await prompt({
      title: t('delist-title', { defaultValue: 'Take this community out of discovery' }),
      label: t('delist-label', { defaultValue: 'Reason (its moderators can read it)' }),
      confirmLabel: t('delist-confirm', { defaultValue: 'Take out of discovery' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      validate: (v) => {
        const n = v.trim().length;
        return n < DELIST_REASON_MIN || n > DELIST_REASON_MAX
          ? t('delist-reason-length', {
              defaultValue: 'The reason is {{min}} to {{max}} characters.',
              min: DELIST_REASON_MIN,
              max: DELIST_REASON_MAX,
            })
          : null;
      },
    });
    if (reason === null) return;
    setBusy(row.id);
    try {
      await api(delistCommunityApi, { params: { slug: row.slug }, body: { reason: reason.trim() } });
      toast.success(t('delisted-toast', { defaultValue: 'The community is out of discovery.' }));
      await refresh();
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('change-failed', { defaultValue: 'That change did not save. Try again.' }),
      );
    } finally {
      setBusy(null);
    }
  };

  const bringBack = async (row: AdminCommunityRow) => {
    const ok = await confirm({
      title: t('relist-title', { defaultValue: 'Return this community to discovery?' }),
      description: t('relist-description', {
        defaultValue: 'It appears in the directory, Explore, the related rail, its game and the sitemap again.',
      }),
      confirmLabel: t('relist-confirm', { defaultValue: 'Return to discovery' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
    });
    if (!ok) return;
    setBusy(row.id);
    try {
      await api(relistCommunityApi, { params: { slug: row.slug } });
      toast.success(t('relisted-toast', { defaultValue: 'The community is back in discovery.' }));
      await refresh();
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('change-failed', { defaultValue: 'That change did not save. Try again.' }),
      );
    } finally {
      setBusy(null);
    }
  };

  const tabs = [
    { id: 'reports', label: t('filter-reports', { defaultValue: 'Reports open' }) },
    { id: 'quiet', label: t('filter-quiet', { defaultValue: 'No moderator action in 30 days' }) },
    { id: 'growing', label: t('filter-growing', { defaultValue: 'Growing fast' }) },
    { id: 'delisted', label: t('filter-delisted', { defaultValue: 'Out of discovery' }) },
    { id: 'all', label: t('filter-all', { defaultValue: 'All' }) },
  ];

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs}
        value={filter}
        onChange={(id) => onFilterChange(id as CommunityFilter)}
        aria-label={t('filter-aria', { defaultValue: 'Filter communities' })}
      />
      <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2" role="search">
        <SearchField
          value={text}
          onValueChange={(v) => {
            setText(v);
            if (v.trim() === '') setQ('');
          }}
          placeholder={t('search-placeholder', { defaultValue: 'Name or slug' })}
          aria-label={t('search-label', { defaultValue: 'Search communities by name or slug' })}
          containerClassName="min-w-0 flex-1 sm:max-w-xs"
          maxLength={60}
        />
        <Button type="submit" variant="default">
          {t('search-apply', { defaultValue: 'Search' })}
        </Button>
      </form>

      {list.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('loading', { defaultValue: 'Loading communities' })}>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError ? (
        <div role="alert" className="space-y-3 border-b border-site-border py-4">
          <p className="t-body text-site-danger">
            {t('load-failed', { defaultValue: 'The communities did not load.' })}
          </p>
          <Button variant="default" onClick={() => void list.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('empty-title', { defaultValue: 'No communities match' })}
          description={t('empty-description', { defaultValue: 'Change the filter or the search to see more.' })}
        />
      ) : (
        <div className={arrival}>
          <ul className="divide-y divide-site-border border-y border-site-border">
            {rows.map((row) => {
              const working = busy === row.id;
              return (
                <li key={row.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link to="/c/$slug" params={{ slug: row.slug }} className="t-heading min-w-0 break-words underline">
                      <bdi>{row.name}</bdi>
                    </Link>
                    <span className="t-meta text-site-text-muted" dir="ltr">
                      /c/{row.slug}
                    </span>
                    {row.isPrivate ? (
                      <span className="t-meta text-site-text-muted">{t('private', { defaultValue: 'Private' })}</span>
                    ) : null}
                    {row.delistedAt ? (
                      <span className="t-meta text-site-danger">
                        {t('row-out-of-discovery', { defaultValue: 'Out of discovery' })}
                      </span>
                    ) : null}
                  </div>
                  <p className="t-meta break-words text-site-text">
                    {t('row-members', { defaultValue: '{{n}} members', n: fmt.number(row.memberCount) })} ·{' '}
                    {t('row-posts', { defaultValue: '{{n}} posts in 7 days', n: fmt.number(row.postsThisWeek) })} ·{' '}
                    {t('row-reports', { defaultValue: '{{n}} open reports', n: fmt.number(row.openReports) })} ·{' '}
                    {t('row-queue', { defaultValue: '{{n}} in the mod queue', n: fmt.number(row.openModItems) })} ·{' '}
                    {row.lastModActionAt
                      ? t('row-last-action', {
                          defaultValue: 'last moderator action {{date}}',
                          date: fmt.date(row.lastModActionAt),
                        })
                      : t('row-no-action', { defaultValue: 'no moderator action yet' })}{' '}
                    ·{' '}
                    {t('row-growth', {
                      defaultValue: '{{now}} joined in 7 days, {{prev}} the week before',
                      now: fmt.number(row.joinsThisWeek),
                      prev: fmt.number(row.joinsPreviousWeek),
                    })}
                  </p>
                  {row.delistedAt ? (
                    <p className="t-meta break-words text-site-text-muted" dir="auto">
                      {t('row-delisted-note', {
                        defaultValue: 'Out of discovery since {{date}}: {{reason}}',
                        date: fmt.date(row.delistedAt),
                        reason: row.delistedReason ?? '',
                      })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {row.delistedAt ? (
                      <Button variant="default" disabled={working} onClick={() => void bringBack(row)}>
                        {t('relist', { defaultValue: 'Return to discovery' })}
                      </Button>
                    ) : (
                      <Button variant="default" disabled={working} onClick={() => void takeOut(row)}>
                        {t('delist', { defaultValue: 'Take out of discovery' })}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      aria-expanded={open === row.id}
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                    >
                      {open === row.id
                        ? t('hide-detail', { defaultValue: 'Hide detail' })
                        : t('show-detail', { defaultValue: 'Moderators and log' })}
                    </Button>
                  </div>
                  {open === row.id ? <Detail slug={row.slug} /> : null}
                </li>
              );
            })}
          </ul>
          {list.hasNextPage ? (
            <div className="pt-4">
              <Button variant="default" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {t('show-more', { defaultValue: 'Show more' })}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** One community: its moderators and their last action, the last 20 mod-log entries and its open reports. */
function Detail({ slug }: { slug: string }) {
  const { t } = useTranslation('admin-communities');
  const fmt = useLocaleFormat();
  const detail = useQuery({
    queryKey: [getAdminCommunityApi.path, slug],
    queryFn: ({ signal }) => api(getAdminCommunityApi, { params: { slug }, signal }),
  });
  const arrival = useArrival(!detail.isPending);
  if (detail.isPending)
    return <Skeleton className="h-12 w-full" aria-label={t('detail-loading', { defaultValue: 'Loading detail' })} />;
  if (detail.isError)
    return (
      <p role="alert" className="t-meta text-site-danger">
        {t('detail-failed', { defaultValue: 'The detail did not load.' })}
      </p>
    );
  const { moderators, log, reports } = detail.data;
  return (
    <div className={`space-y-4 border-t border-site-border pt-3 ${arrival}`}>
      <section aria-label={t('moderators-heading', { defaultValue: 'Moderators' })}>
        <h3 className="t-label">{t('moderators-heading', { defaultValue: 'Moderators' })}</h3>
        {moderators.length === 0 ? (
          <p className="t-meta text-site-text-muted">{t('moderators-none', { defaultValue: 'No moderators.' })}</p>
        ) : (
          <ul className="divide-y divide-site-border">
            {moderators.map((m) => (
              <li key={m.userId} className="py-1.5">
                <p className="t-meta break-words text-site-text">
                  <bdi>{m.name}</bdi> ·{' '}
                  {m.role === 'ADMIN'
                    ? t('role-owner', { defaultValue: 'Owner' })
                    : t('role-moderator', { defaultValue: 'Moderator' })}{' '}
                  ·{' '}
                  {m.lastActionAt
                    ? t('moderator-last-action', {
                        defaultValue: 'last action {{date}}',
                        date: fmt.date(m.lastActionAt),
                      })
                    : t('moderator-no-action', { defaultValue: 'no action yet' })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t('reports-heading', { defaultValue: 'Open reports' })}>
        <h3 className="t-label">{t('reports-heading', { defaultValue: 'Open reports' })}</h3>
        {reports.length === 0 ? (
          <p className="t-meta text-site-text-muted">{t('reports-none', { defaultValue: 'No open reports.' })}</p>
        ) : (
          <>
            <ul className="divide-y divide-site-border">
              {reports.map((r) => (
                <li key={r.id} className="py-1.5">
                  <p className="t-meta text-site-text">
                    <span dir="ltr">{r.reason}</span> · {fmt.dateTime(r.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            <p className="t-meta pt-1">
              <Link to="/admin/reports" className="underline">
                {t('reports-link', { defaultValue: 'Open the reports queue' })}
              </Link>
            </p>
          </>
        )}
      </section>
      <section aria-label={t('log-heading', { defaultValue: 'Moderation log' })}>
        <h3 className="t-label">{t('log-heading', { defaultValue: 'Moderation log' })}</h3>
        {log.length === 0 ? (
          <p className="t-meta text-site-text-muted">{t('log-none', { defaultValue: 'No moderation actions yet.' })}</p>
        ) : (
          <ul className="divide-y divide-site-border">
            {log.map((l) => (
              <li key={l.id} className="py-1.5">
                <p className="t-meta break-words text-site-text">
                  <span dir="ltr">{l.action}</span> · {fmt.dateTime(l.createdAt)}
                  {l.actorName ? (
                    <>
                      {' '}
                      · <bdi>{l.actorName}</bdi>
                    </>
                  ) : null}
                </p>
                {l.reason ? (
                  <p className="t-meta break-words text-site-text-muted" dir="auto">
                    {l.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
