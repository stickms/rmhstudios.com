import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { formatDateShort } from '@/lib/core/format';
import { api } from '@/lib/contract/client';
import { listRepostMutesApi, setRepostMuteApi } from '@/lib/feed/repost-mutes.contract';
import { REPOST_MUTE_SEARCH_THRESHOLD, type RepostMutePage, type RepostMuteRow } from '@/lib/feed/repost-mutes';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';

const listKey = (q: string) => ['feed', 'repost-mutes', q] as const;

/**
 * Settings > Content: "Reposts turned off" (sprint 05 #07). The people whose reposts the member left out of their
 * Following and For You timelines, newest first, each with a "Turn on" button. Searchable once there are more than
 * twenty. A person who blocked the member shows as unavailable with no details; the row can still be turned on.
 */
export function RepostMutesSection() {
  const { t, i18n } = useTranslation('repost-mutes');
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const search = useDebouncedCallback((value: string) => setQ(value.trim()), 250);

  const list = useInfiniteQuery({
    queryKey: listKey(q),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api(listRepostMutesApi, {
        query: {
          cursor: pageParam,
          q: q || undefined,
        },
      }),
    getNextPageParam: (last: RepostMutePage) => last.nextCursor ?? undefined,
  });
  const pages = list.data?.pages;
  const rows = pages?.flatMap((p) => p.rows) ?? [];
  const total = pages?.[0]?.total ?? 0;
  const arrival = useArrival(!list.isPending);
  const showSearch = total > REPOST_MUTE_SEARCH_THRESHOLD || q !== '' || input !== '';

  const turnOn = async (row: RepostMuteRow) => {
    setBusy((b) => new Set(b).add(row.userId));
    try {
      await api(setRepostMuteApi, {
        body: {
          targetUserId: row.userId,
          off: false,
        },
      });
      queryClient.setQueriesData<InfiniteData<RepostMutePage, string | undefined>>(
        {
          queryKey: ['feed', 'repost-mutes'],
        },
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((p) => ({
              ...p,
              rows: p.rows.filter((r) => r.userId !== row.userId),
              total: Math.max(0, p.total - 1),
            })),
          },
      );
      queryClient.setQueryData(['feed', 'repost-mute', row.userId], false);
      toast.success(
        t('turned-on', {
          name:
            row.name ||
            t('someone', {
              defaultValue: 'this member',
            }),
          defaultValue: 'Reposts from {{name}} are back on',
        }),
      );
    } catch (e) {
      toast.error(
        serverError(e) ||
          t('error', {
            defaultValue: 'Could not change reposts for this member',
          }),
      );
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(row.userId);
        return next;
      });
    }
  };

  let body: React.ReactNode;
  if (list.isPending) {
    body = (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  } else if (list.isError && rows.length === 0) {
    body = (
      <div className={arrival}>
        <p role="alert" className="t-body text-site-danger py-3">
          {t('load-failed', {
            defaultValue: 'Could not load this list.',
          })}
        </p>
        <Button onClick={() => void list.refetch()}>
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        className={arrival}
        title={
          q
            ? t('no-matches-title', {
                defaultValue: 'No one matches',
              })
            : t('empty-title', {
                defaultValue: 'No reposts turned off',
              })
        }
        description={
          q
            ? t('no-matches', {
                defaultValue: 'Nobody on this list matches that search.',
              })
            : t('empty', {
                defaultValue:
                  'Choose "Turn off reposts" on a post to leave one person\'s reposts out of your timelines.',
              })
        }
      />
    );
  } else {
    body = (
      <div className={arrival}>
        <ul>
          {rows.map((row) => {
            const name =
              row.name ||
              row.handle ||
              t('someone', {
                defaultValue: 'this member',
              });
            return (
              <li
                key={row.userId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3"
              >
                {row.unavailable ? (
                  <span className="t-body min-w-0 flex-1 basis-48 text-site-text-muted">
                    {t('unavailable', {
                      defaultValue: 'Unavailable',
                    })}
                  </span>
                ) : (
                  <Link
                    to={`/u/${row.handle || row.userId}` as string}
                    className="flex min-w-0 flex-1 basis-48 items-center gap-3"
                  >
                    <UserAvatar src={row.image ?? undefined} alt="" size={40} fallbackName={name} />
                    <span className="min-w-0">
                      <span className="t-body block truncate font-semibold text-site-text">{name}</span>
                      {row.handle && <span className="t-meta block truncate">@{row.handle}</span>}
                    </span>
                  </Link>
                )}
                <span className="t-meta shrink-0">
                  {t('since', {
                    date: formatDateShort(row.since, i18n.language),
                    defaultValue: 'Since {{date}}',
                  })}
                </span>
                <Button
                  size="sm"
                  disabled={busy.has(row.userId)}
                  aria-label={t('turn-on', {
                    name: row.unavailable
                      ? t('unavailable', {
                          defaultValue: 'Unavailable',
                        })
                      : name,
                    defaultValue: 'Turn on reposts from {{name}}',
                  })}
                  onClick={() => void turnOn(row)}
                >
                  {t('turn-on-action', {
                    defaultValue: 'Turn on',
                  })}
                </Button>
              </li>
            );
          })}
        </ul>
        {list.isFetchNextPageError && (
          <p role="alert" className="t-meta py-2 text-site-danger">
            {t('load-more-failed', {
              defaultValue: "Couldn't load more.",
            })}
          </p>
        )}
        {list.hasNextPage && (
          <div className="py-4">
            <Button disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {t('load-more', {
                defaultValue: 'Load more',
              })}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <SettingsSection
      title={t('title', {
        defaultValue: 'Reposts turned off',
      })}
      description={t('description', {
        defaultValue:
          'Their reposts are left out of your Following and For You timelines. Their own posts, quotes and replies stay, and the reposts stay on their profile.',
      })}
    >
      {showSearch && (
        <SearchField
          value={input}
          onValueChange={(v) => {
            setInput(v);
            search(v);
          }}
          aria-label={t('search', {
            defaultValue: 'Search this list',
          })}
          placeholder={t('search-placeholder', {
            defaultValue: 'Search by name or handle',
          })}
          containerClassName="mb-2 max-w-sm"
        />
      )}
      {body}
    </SettingsSection>
  );
}
