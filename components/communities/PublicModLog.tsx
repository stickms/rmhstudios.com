/**
 * s03-14 — the public moderation log: a "Moderation log" link on the community page that opens
 * the content decisions (removals and approvals) with their rule and reason. The server sends
 * nothing else: no moderator, no member, no bans or role changes.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { getModLogApi } from '@/lib/communities/modlog.contract';
import type { PublicModLogEntryDTO } from '@/lib/communities/modlog';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

export function PublicModLog({
  slug,
  communityName,
  className,
}: {
  slug: string;
  communityName: string;
  className?: string | undefined;
}) {
  const fmt = useLocaleFormat();
  const { t } = useTranslation('community-modlog');
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<PublicModLogEntryDTO[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const arrival = useArrival(entries !== null);
  const arrivedKey = useArrivingKeys((entries ?? []).map((e) => e.id));

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const page = await api(getModLogApi, {
        params: {
          slug,
        },
        query: {
          scope: 'public',
          ...(cursor
            ? {
                cursor,
              }
            : {}),
        },
      });
      if (page.scope !== 'public') throw new Error('unexpected scope');
      return page;
    },
    [slug],
  );

  const load = useCallback(async () => {
    setFailed(false);
    setEntries(null);
    try {
      const page = await fetchPage();
      setEntries(page.entries);
      setNextCursor(page.nextCursor);
    } catch {
      setFailed(true);
    }
  }, [fetchPage]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      setEntries((prev) => [...(prev ?? []), ...page.entries]);
      setNextCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const sentence = (e: PublicModLogEntryDTO) => {
    if (e.action === 'post_pinned') {
      return t('public-post-pinned', { ns: 'community-pins', defaultValue: 'Post pinned' });
    }
    if (e.action === 'post_unpinned') {
      return t('public-post-unpinned', { ns: 'community-pins', defaultValue: 'Post unpinned' });
    }
    if (e.action === 'pins_reordered') {
      return t('public-pins-reordered', { ns: 'community-pins', defaultValue: 'Pinned posts reordered' });
    }
    if (e.action === 'event_hosted') {
      return t('public-event-hosted', { ns: 'community-events', defaultValue: 'A moderator hosted an event' });
    }
    if (e.action === 'event_cancelled') {
      return t('public-event-cancelled', { ns: 'community-events', defaultValue: 'A moderator cancelled an event' });
    }
    if (e.action === 'read_along_started') {
      return t('public-started', { ns: 'read-alongs', defaultValue: 'A moderator started a read-along' });
    }
    if (e.action === 'read_along_cancelled') {
      return t('public-cancelled', { ns: 'read-alongs', defaultValue: 'A moderator cancelled a read-along' });
    }
    if (e.action === 'content_removed') {
      return e.targetType === 'comment'
        ? t('public-comment-removed', {
            defaultValue: 'A moderator removed a comment',
          })
        : t('public-post-removed', {
            defaultValue: 'A moderator removed a post',
          });
    }
    return e.targetType === 'comment'
      ? t('public-comment-approved', {
          defaultValue: 'A moderator approved a comment',
        })
      : t('public-post-approved', {
          defaultValue: 'A moderator approved a post',
        });
  };

  return (
    <section
      aria-label={t('public-label', {
        defaultValue: 'Moderation log',
      })}
      className={cn('border-b border-site-border px-4 py-3', className)}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        {t('public-link', {
          defaultValue: 'Moderation log',
        })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('public-title', {
                name: communityName,
                defaultValue: 'Moderation log of {{name}}',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('public-intro', {
                defaultValue:
                  'Content the moderators removed or approved, with the rule and the reason. Moderators and members are not named.',
              })}
            </DialogDescription>
          </DialogHeader>
          {failed ? (
            <div className="flex flex-col items-start gap-2">
              <p className="t-body text-site-text-muted">
                {t('load-error', {
                  defaultValue: "Couldn't load the moderation log.",
                })}
              </p>
              <Button size="sm" onClick={() => void load()}>
                {t('retry', {
                  defaultValue: 'Try again',
                })}
              </Button>
            </div>
          ) : entries === null ? (
            <div className="flex flex-col gap-2" aria-hidden>
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              className={arrival}
              title={t('public-empty', {
                defaultValue: 'Nothing yet',
              })}
            />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <ul className={cn('flex flex-col', arrival)}>
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className={cn('flex flex-col gap-1 border-b border-site-border py-3', arrivedKey(e.id) && ARRIVE)}
                  >
                    <p className="t-body text-site-text">{sentence(e)}</p>
                    {e.ruleTitle ? (
                      <p className="t-meta">
                        {t('rule', {
                          title: e.ruleTitle,
                          defaultValue: 'Rule: {{title}}',
                        })}
                      </p>
                    ) : null}
                    {e.reason ? (
                      <p className="t-meta">
                        {t('reason', {
                          reason: e.reason,
                          defaultValue: 'Reason: {{reason}}',
                        })}
                      </p>
                    ) : null}
                    <p className="t-meta">
                      <time dateTime={e.createdAt}>{fmt.relative(new Date(e.createdAt))}</time>
                    </p>
                  </li>
                ))}
              </ul>
              {nextCursor ? (
                <div className="pt-3">
                  <Button size="sm" onClick={() => void loadMore()} loading={loadingMore}>
                    {t('load-more', {
                      defaultValue: 'Load more',
                    })}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
