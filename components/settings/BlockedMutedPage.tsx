import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival, useArrivingKeys, ARRIVE } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { MuteDurationChoices } from '@/components/feed/MuteDurationMenu';
import type { AccountMuteDuration } from '@/lib/moderation/mute-expiry';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { toggleBlockApi, toggleMuteApi } from '@/lib/moderation/moderation.contract';
import {
  listBlockedMutedApi,
  type BlockedMutedPage as Page,
  type BlockedMutedRow,
} from '@/lib/moderation/blocked-muted.contract';
import { BLOCKED_MUTED_QUERY_MAX, type BlockedMutedTab } from '@/lib/moderation/blocked-muted-schema';

import { Handle } from '@/components/ui/handle';
const KEY = 'blocked-muted';

/**
 * /settings/blocked: two tabs, Blocked and Muted, each a paged list (50 at a time, newest first) with a name or handle
 * filter. Unblock confirms (it lets them follow and message again); Unmute is immediate with an Undo. Both send an
 * explicit intent, so a stale list can never flip the wrong way.
 */
export function BlockedMutedPage() {
  const { t, i18n } = useTranslation(['blocked-muted', 'timed-mutes']);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<BlockedMutedTab>('blocked');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [counts, setCounts] = useState<Page['counts'] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // "Extend" opens the duration menu under the button that was pressed (s10-10).
  const extendAnchor = useRef<HTMLElement | null>(null);
  const [extendRow, setExtendRow] = useState<BlockedMutedRow | null>(null);
  const commitSearch = useDebouncedCallback((value: string) => setQ(value.trim()), 250);

  const list = useInfiniteQuery({
    queryKey: [KEY, tab, q] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listBlockedMutedApi, {
        query: {
          tab,
          ...(q
            ? {
                q,
              }
            : {}),
          ...(pageParam
            ? {
                after: pageParam,
              }
            : {}),
        },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const pages = list.data?.pages;
  const items = pages?.flatMap((p) => p.items) ?? [];
  const latestCounts = pages?.[0]?.counts;
  // The counts ride on each list's first page; keep the last ones while another tab loads (adjusted while
  // rendering, no effect: React Query keeps the object's identity until the counts change).
  if (latestCounts && latestCounts !== counts) setCounts(latestCounts);
  const arrival = useArrival(!list.isPending);
  const isArriving = useArrivingKeys(items.map((r) => r.userId));
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  });

  const reload = () =>
    queryClient.invalidateQueries({
      queryKey: [KEY],
    });
  // The row (and its button) is gone after a removal; keep keyboard focus inside the list instead of losing it.
  const reloadAndRefocus = async () => {
    await reload();
    panelRef.current?.focus();
  };
  const withBusy = async (id: string, run: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(id));
    try {
      await run();
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(id);
        return next;
      });
    }
  };

  const nameOf = (row: BlockedMutedRow) =>
    row.deleted
      ? t('deleted-account', {
          defaultValue: 'Deleted account',
        })
      : (row.name ?? row.handle ?? '');

  const unblock = async (row: BlockedMutedRow) => {
    const name = nameOf(row);
    const ok = await confirm({
      title: t('unblock-title', {
        name,
        defaultValue: 'Unblock {{name}}?',
      }),
      description: t('unblock-description', {
        defaultValue: 'They will be able to follow and message you again.',
      }),
      confirmLabel: t('unblock', {
        defaultValue: 'Unblock',
      }),
      danger: true,
    });
    if (!ok) return;
    await withBusy(row.userId, async () => {
      try {
        await api(toggleBlockApi, {
          body: {
            targetUserId: row.userId,
            block: false,
          },
        });
      } catch {
        toast.error(
          t('unblock-failed', {
            defaultValue: "Couldn't unblock. Try again.",
          }),
        );
        return;
      }
      toast.success(
        t('unblocked', {
          name,
          defaultValue: '{{name}} unblocked.',
        }),
      );
      await reloadAndRefocus();
    });
  };

  const unmute = async (row: BlockedMutedRow) => {
    const name = nameOf(row);
    await withBusy(row.userId, async () => {
      try {
        await api(toggleMuteApi, {
          body: {
            targetUserId: row.userId,
            mute: false,
          },
        });
      } catch {
        toast.error(
          t('unmute-failed', {
            defaultValue: "Couldn't unmute. Try again.",
          }),
        );
        return;
      }
      toast(
        t('unmuted', {
          name,
          defaultValue: '{{name}} unmuted.',
        }),
        {
          action: {
            label: t('undo', {
              defaultValue: 'Undo',
            }),
            onClick: () => {
              void api(toggleMuteApi, {
                body: {
                  targetUserId: row.userId,
                  mute: true,
                },
              })
                .then(() => reload())
                .catch(() =>
                  toast.error(
                    t('undo-failed', {
                      defaultValue: "Couldn't undo. Mute them again from a post.",
                    }),
                  ),
                );
            },
          },
        },
      );
      await reloadAndRefocus();
    });
  };

  const extend = async (row: BlockedMutedRow, duration: AccountMuteDuration) => {
    await withBusy(row.userId, async () => {
      try {
        await api(toggleMuteApi, { body: { targetUserId: row.userId, mute: true, duration } });
      } catch {
        toast.error(
          t('extend-failed', {
            ns: 'timed-mutes',
            defaultValue: "Couldn't change the mute. Try again.",
          }),
        );
        return;
      }
      toast.success(
        t('extended', {
          ns: 'timed-mutes',
          name: nameOf(row),
          defaultValue: 'Mute for {{name}} updated.',
        }),
      );
      await reloadAndRefocus();
    });
  };

  const tabs = [
    {
      id: 'blocked',
      label: t('tab-blocked', {
        defaultValue: 'Blocked',
      }),
      ...(counts
        ? {
            count: counts.blocked,
          }
        : {}),
    },
    {
      id: 'muted',
      label: t('tab-muted', {
        defaultValue: 'Muted',
      }),
      ...(counts
        ? {
            count: counts.muted,
          }
        : {}),
    },
  ];
  const filtering = q !== '';

  return (
    <SettingsSection>
      <div className="flex flex-col gap-4">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as BlockedMutedTab)}
          idBase="blocked-muted"
          aria-label={t('tabs-label', {
            defaultValue: 'Blocked and muted accounts',
          })}
        />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="tabpanel"
          id={`blocked-muted-panel-${tab}`}
          aria-labelledby={`blocked-muted-tab-${tab}`}
        >
          <p className="sr-only" role="status" aria-live="polite">
            {list.isPending || !counts
              ? ''
              : t('count-live', {
                  count: tab === 'blocked' ? counts.blocked : counts.muted,
                  defaultValue_one: '{{count}} person in this list',
                  defaultValue_other: '{{count}} people in this list',
                })}
          </p>
          <SearchField
            value={input}
            maxLength={BLOCKED_MUTED_QUERY_MAX}
            onValueChange={(value) => {
              setInput(value);
              commitSearch(value);
            }}
            placeholder={t('search-placeholder', {
              defaultValue: 'Search by name or handle',
            })}
            aria-label={t('search-label', {
              defaultValue: 'Search by name or handle',
            })}
          />
          {list.isPending ? (
            <div
              role="status"
              aria-label={t('loading', {
                defaultValue: 'Loading the list',
              })}
              className="mt-2"
            >
              {[0, 1, 2].map((n) => (
                <div key={n} className="flex items-center gap-3 border-b border-site-border py-3">
                  <Skeleton className="size-10 rounded-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : list.isError ? (
            <EmptyState
              title={t('error-title', {
                defaultValue: 'Could not load the list.',
              })}
              description={t('error-description', {
                defaultValue: 'Check your connection and try again.',
              })}
              action={
                <Button onClick={() => void list.refetch()}>
                  {t('retry', {
                    defaultValue: 'Try again',
                  })}
                </Button>
              }
            />
          ) : items.length === 0 ? (
            filtering ? (
              <EmptyState
                title={t('no-match-title', {
                  defaultValue: 'No one matches.',
                })}
                description={t('no-match-description', {
                  defaultValue: 'Try a different name or handle.',
                })}
              />
            ) : tab === 'blocked' ? (
              <EmptyState
                title={t('empty-blocked-title', {
                  defaultValue: 'You have not blocked anyone.',
                })}
                description={t('empty-blocked-description', {
                  defaultValue: 'To block someone, open the menu on one of their posts and choose Block.',
                })}
              />
            ) : (
              <EmptyState
                title={t('empty-muted-title', {
                  defaultValue: 'You have not muted anyone.',
                })}
                description={t('empty-muted-description', {
                  defaultValue: 'To mute someone, open the menu on one of their posts and choose Mute.',
                })}
              />
            )
          ) : (
            <>
              <ul className={cn(arrival)}>
                {items.map((row) => {
                  const name = nameOf(row);
                  return (
                    <li
                      key={row.userId}
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3',
                        isArriving(row.userId) && ARRIVE,
                      )}
                    >
                      {row.deleted ? (
                        <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                          <UserAvatar src={null} alt="" size={40} fallbackName={name} />
                          <span className="t-body min-w-0 truncate font-semibold text-site-text-muted">{name}</span>
                        </div>
                      ) : (
                        <Link
                          to={`/u/${row.handle || row.userId}` as string}
                          className="flex min-w-0 flex-1 basis-48 items-center gap-3"
                        >
                          <UserAvatar src={row.image ?? undefined} alt="" size={40} fallbackName={name} />
                          <span className="min-w-0">
                            <span className="t-body block truncate font-semibold text-site-text">{name}</span>
                            {row.handle && (
                              <span className="t-meta block truncate">
                                <Handle handle={row.handle} />
                              </span>
                            )}
                          </span>
                        </Link>
                      )}
                      <span className="t-meta shrink-0">
                        {tab === 'blocked'
                          ? t('blocked-since', {
                              date: dateFormat.format(new Date(row.since)),
                              defaultValue: 'Blocked {{date}}',
                            })
                          : t('muted-since', {
                              date: dateFormat.format(new Date(row.since)),
                              defaultValue: 'Muted {{date}}',
                            })}
                      </span>
                      {tab === 'muted' && (
                        <span className="t-meta shrink-0">
                          {row.expiresAt
                            ? t('until', {
                                ns: 'timed-mutes',
                                date: dateFormat.format(new Date(row.expiresAt)),
                                defaultValue: 'until {{date}}',
                              })
                            : t('until-unmute', {
                                ns: 'timed-mutes',
                                defaultValue: 'until you unmute',
                              })}
                        </span>
                      )}
                      {tab === 'muted' && !row.deleted && (
                        <Button
                          size="sm"
                          disabled={busy.has(row.userId)}
                          onClick={(e) => {
                            extendAnchor.current = e.currentTarget;
                            setExtendRow(row);
                          }}
                          aria-haspopup="menu"
                          aria-label={t('extend-aria', {
                            ns: 'timed-mutes',
                            name,
                            defaultValue: 'Change how long {{name}} is muted',
                          })}
                        >
                          {t('extend', { ns: 'timed-mutes', defaultValue: 'Extend' })}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={busy.has(row.userId)}
                        onClick={() => void (tab === 'blocked' ? unblock(row) : unmute(row))}
                        aria-label={
                          tab === 'blocked'
                            ? t('unblock-aria', {
                                name,
                                defaultValue: 'Unblock {{name}}',
                              })
                            : t('unmute-aria', {
                                name,
                                defaultValue: 'Unmute {{name}}',
                              })
                        }
                      >
                        {tab === 'blocked'
                          ? t('unblock', {
                              defaultValue: 'Unblock',
                            })
                          : t('unmute', {
                              defaultValue: 'Unmute',
                            })}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {list.hasNextPage ? (
                <div className="py-4">
                  <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                    {t('load-more', {
                      defaultValue: 'Load more',
                    })}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      <MuteDurationChoices
        extend
        open={extendRow !== null}
        onClose={() => setExtendRow(null)}
        anchorRef={extendAnchor}
        onChoose={(duration) => {
          if (extendRow) void extend(extendRow, duration);
        }}
      />
    </SettingsSection>
  );
}
