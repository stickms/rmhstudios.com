/**
 * s08-09 — the Recurring tab in the mod tools: the community's thread templates as rows on rules (title, cadence in
 * words, the next post in the reader's locale, the last post, status) with Post now, Pause or Resume, Edit and
 * Delete, and a form dialog to add one. Moderators only; members never see a template.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { RecurringThreadDialog } from '@/components/communities/RecurringThreadDialog';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import {
  deleteRecurringApi,
  listRecurringApi,
  postRecurringNowApi,
  updateRecurringApi,
} from '@/lib/communities/recurring.contract';
import type { RecurringThreadDTO } from '@/lib/communities/recurring';
import type { FlairDTO } from '@/lib/communities/plus';

export function ModRecurring({ slug, flairs }: { slug: string; flairs: FlairDTO[] }) {
  const { t } = useTranslation('recurring-threads');
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const listOptions = apiQuery(listRecurringApi, {
    params: {
      slug,
    },
  });
  const listQuery = useQuery({
    ...listOptions,
    retry: false,
  });
  const rows = listQuery.data ? listQuery.data.threads : listQuery.isError ? [] : null;
  const maxActive = listQuery.data?.maxActive ?? 5;
  const arrival = useArrival(rows !== null);
  // `undefined` = closed, `null` = a new thread, a row = editing it.
  const [editing, setEditing] = useState<RecurringThreadDTO | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: listOptions.queryKey,
    });
  const fail = (err: unknown) =>
    toast.error(
      serverError(err) ||
        t('action-failed', {
          defaultValue: 'Could not save that',
        }),
    );

  const weekdayName = (d: number) =>
    new Intl.DateTimeFormat(fmt.locale, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2024, 0, 7 + d)));

  const cadenceText = (r: RecurringThreadDTO) =>
    r.cadence === 'weekly'
      ? t('cadence-weekly', {
          weekday: weekdayName(r.weekday ?? 0),
          time: r.time,
          zone: r.timeZone,
          defaultValue: 'Every {{weekday}} at {{time}} ({{zone}})',
        })
      : t('cadence-monthly', {
          day: r.dayOfMonth ?? 1,
          time: r.time,
          zone: r.timeZone,
          defaultValue: 'On day {{day}} of every month at {{time}} ({{zone}})',
        });

  const statusText = (r: RecurringThreadDTO) => {
    if (r.active)
      return t('status-active', {
        defaultValue: 'Active',
      });
    switch (r.pausedReason) {
      case 'author_not_moderator':
        return t('paused-author', {
          defaultValue: 'Paused: the author is no longer a moderator. Save it to post as you.',
        });
      case 'author_sanctioned':
        return t('paused-sanctioned', {
          defaultValue: 'Paused: the author cannot post here right now',
        });
      case 'community_gone':
        return t('paused-community', {
          defaultValue: 'Paused: the community is not available',
        });
      case 'gate_refused':
        return t('paused-refused', {
          defaultValue: 'Paused: the community rules refused the post',
        });
      case 'held_by_automod':
        return t('paused-automod', {
          defaultValue: 'Paused: AutoMod would have held the post',
        });
      case 'publish_failed':
        return t('paused-failed', {
          defaultValue: 'Paused: posting failed several times',
        });
      default:
        return t('paused-manual', {
          defaultValue: 'Paused',
        });
    }
  };

  const setActive = async (r: RecurringThreadDTO, active: boolean) => {
    setBusy(r.id);
    try {
      await api(updateRecurringApi, {
        params: {
          slug,
          id: r.id,
        },
        body: {
          active,
        },
      });
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const postNow = async (r: RecurringThreadDTO) => {
    const ok = await confirm({
      title: t('now-confirm', {
        defaultValue: 'Post this thread now?',
      }),
      description: t('now-confirm-hint', {
        defaultValue: 'It is posted at once. The schedule does not change.',
      }),
      confirmLabel: t('now', {
        defaultValue: 'Post now',
      }),
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await api(postRecurringNowApi, {
        params: {
          slug,
          id: r.id,
        },
      });
      toast.success(
        t('now-done', {
          defaultValue: 'Posted',
        }),
      );
    } catch (err) {
      fail(err);
    } finally {
      await refresh();
      setBusy(null);
    }
  };

  const remove = async (r: RecurringThreadDTO) => {
    const ok = await confirm({
      title: t('delete-confirm', {
        defaultValue: 'Delete this recurring thread?',
      }),
      description: t('delete-confirm-hint', {
        defaultValue: 'It stops posting. Posts it already made stay. The deletion is logged.',
      }),
      confirmLabel: t('delete', {
        defaultValue: 'Delete',
      }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteRecurringApi, {
        params: {
          slug,
          id: r.id,
        },
      });
      await refresh();
    } catch (err) {
      fail(err);
    }
  };

  const activeCount = rows ? rows.filter((r) => r.active).length : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="t-meta">
          {t('hint', {
            max: maxActive,
            defaultValue:
              'Threads that post themselves, weekly or monthly. Up to {{max}} can be active. Only moderators see this list.',
          })}
        </p>
        <Button
          variant="default"
          size="sm"
          onClick={() => setEditing(null)}
          disabled={rows === null || listQuery.isError}
        >
          {t('add', {
            defaultValue: 'New thread',
          })}
        </Button>
      </div>

      {rows === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : listQuery.isError ? (
        <p className="t-body text-site-danger" role="alert">
          {t('load-failed', {
            defaultValue: 'Could not load the recurring threads.',
          })}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('empty', {
            defaultValue: 'No recurring threads',
          })}
          description={t('empty-hint', {
            defaultValue: 'Set up a weekly showcase or a monthly check-in and it posts itself.',
          })}
        />
      ) : (
        <ul className={cn('flex flex-col', arrival)}>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 border-b border-site-border py-3">
              <p className="t-body font-medium text-site-text break-words">{r.title}</p>
              <p className="t-meta">{cadenceText(r)}</p>
              <p className="t-meta">
                {r.active
                  ? t('next', {
                      date: fmt.dateTime(r.nextAt),
                      defaultValue: 'Next post: {{date}}',
                    })
                  : statusText(r)}
                {r.active && ' · '}
                {r.active && statusText(r)}
              </p>
              {r.lastPostedAt && (
                <p className="t-meta">
                  {t('last', {
                    date: fmt.dateTime(r.lastPostedAt),
                    defaultValue: 'Last post: {{date}}',
                  })}
                  {r.lastPostId && r.author?.handle && (
                    <>
                      {' · '}
                      <a className="underline" href={`/u/${r.author.handle}/post/${r.lastPostId}`}>
                        {t('last-open', {
                          defaultValue: 'Open',
                        })}
                      </a>
                    </>
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => void postNow(r)} disabled={busy === r.id}>
                  {t('now', {
                    defaultValue: 'Post now',
                  })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void setActive(r, !r.active)}
                  disabled={busy === r.id || (!r.active && activeCount >= maxActive)}
                >
                  {r.active
                    ? t('pause', {
                        defaultValue: 'Pause',
                      })
                    : t('resume', {
                        defaultValue: 'Resume',
                      })}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>
                  {t('edit', {
                    defaultValue: 'Edit',
                  })}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(r)}>
                  {t('delete', {
                    defaultValue: 'Delete',
                  })}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <RecurringThreadDialog
          slug={slug}
          thread={editing}
          flairs={flairs}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
