/** s03-14 — the Log tab: every moderation action of the community, newest first, with filters and a CSV export. */
import { useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { api, apiUrl } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { exportModLogApi, getModLogApi } from '@/lib/communities/modlog.contract';
import type { ModLogEntryDTO, ModLogGroup, ModLogUserDTO } from '@/lib/communities/modlog';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

type GroupFilter = 'all' | ModLogGroup;

const SETTING_FIELDS = ['verification', 'flairRequired', 'starThreshold', 'publicModLog', 'requireImageAlt'] as const;

/** The label of one changed setting, for the sentence "changed the community settings: …". */
function settingLabel(t: TFunction, field: string): string {
  switch (field) {
    case 'verification':
      return t('field-verification', {
        defaultValue: 'who can post',
      });
    case 'flairRequired':
      return t('field-flair-required', {
        defaultValue: 'flair required',
      });
    case 'starThreshold':
      return t('field-star-threshold', {
        defaultValue: 'hall of fame threshold',
      });
    case 'publicModLog':
      return t('field-public-log', {
        defaultValue: 'public moderation log',
      });
    case 'requireImageAlt':
      return t('field-require-image-alt', {
        defaultValue: 'images need a description',
      });
    default:
      return field;
  }
}

/** The sentence for one row, built from its action code (never stored as English). */
export function actionSentence(t: TFunction, e: ModLogEntryDTO): string {
  const actor =
    e.actor?.name ??
    e.actor?.handle ??
    t('deleted-member', {
      defaultValue: 'a deleted member',
    });
  const target = e.targetUser
    ? e.targetUser.handle
      ? `@${e.targetUser.handle}`
      : (e.targetUser.name ?? '')
    : t('deleted-member', {
        defaultValue: 'a deleted member',
      });
  const detailName = e.detail?.name;
  const named = typeof detailName === 'string' ? detailName : '';
  const comment = e.targetType === 'comment';
  switch (e.action) {
    case 'content_removed':
      return comment
        ? t('a-comment-removed', {
            actor,
            defaultValue: '{{actor}} removed a comment',
          })
        : t('a-post-removed', {
            actor,
            defaultValue: '{{actor}} removed a post',
          });
    case 'content_approved':
      return comment
        ? t('a-comment-approved', {
            actor,
            defaultValue: '{{actor}} approved a comment',
          })
        : t('a-post-approved', {
            actor,
            defaultValue: '{{actor}} approved a post',
          });
    case 'announcement_posted':
      return t('announcement-posted', {
        actor,
        defaultValue: '{{actor}} posted an announcement',
      });
    case 'announcement_removed':
      return t('announcement-removed', {
        actor,
        defaultValue: '{{actor}} removed an announcement',
      });
    case 'member_removed':
      return t('member-removed', {
        actor,
        target,
        defaultValue: '{{actor}} removed {{target}} from the community',
      });
    case 'member_banned':
      return t('member-banned', {
        actor,
        target,
        defaultValue: '{{actor}} banned {{target}}',
      });
    case 'note_deleted':
      return t('note-deleted', {
        actor,
        target,
        defaultValue: '{{actor}} deleted a note about {{target}}',
      });
    case 'member_timed_out':
      return t('member-timed-out', {
        actor,
        target,
        defaultValue: '{{actor}} timed out {{target}}',
      });
    case 'ban_lifted':
      return t('ban-lifted', {
        actor,
        target,
        defaultValue: '{{actor}} lifted the ban or timeout on {{target}}',
      });
    case 'member_role_changed':
      return e.detail?.role === 'MOD'
        ? t('member-made-mod', {
            actor,
            target,
            defaultValue: '{{actor}} made {{target}} a moderator',
          })
        : t('member-unmodded', {
            actor,
            target,
            defaultValue: '{{actor}} removed {{target}} as a moderator',
          });
    case 'ownership_transferred':
      return e.detail?.via === 'admin'
        ? t('ownership-assigned', {
            target,
            defaultValue: 'A site admin gave ownership to {{target}}',
          })
        : t('ownership-passed', {
            target,
            defaultValue: 'Ownership passed to {{target}}',
          });
    case 'join_request_approved':
      return t('request-approved', {
        actor,
        target,
        defaultValue: '{{actor}} approved the request of {{target}} to join',
      });
    case 'join_request_denied':
      return t('request-denied', {
        actor,
        target,
        defaultValue: '{{actor}} denied the request of {{target}} to join',
      });
    case 'invite_created':
      return t('invite-created', {
        actor,
        defaultValue: '{{actor}} created an invite link',
      });
    case 'invite_revoked':
      return t('invite-revoked', {
        actor,
        defaultValue: '{{actor}} revoked an invite link',
      });
    case 'settings_changed': {
      const changed = e.detail?.fields;
      const fields = Array.isArray(changed)
        ? changed.filter((f) => (SETTING_FIELDS as readonly string[]).includes(f))
        : [];
      return t('settings-changed', {
        actor,
        fields: fields.map((f) => settingLabel(t, f)).join(', '),
        defaultValue: '{{actor}} changed the community settings: {{fields}}',
      });
    }
    case 'flair_created':
      return t('flair-created', {
        actor,
        name: named,
        defaultValue: '{{actor}} created the flair {{name}}',
      });
    case 'flair_updated':
      return t('flair-updated', {
        actor,
        name: named,
        defaultValue: '{{actor}} changed the flair {{name}}',
      });
    case 'flair_deleted':
      return t('flair-deleted', {
        actor,
        name: named,
        defaultValue: '{{actor}} deleted the flair {{name}}',
      });
    case 'automod_created':
      return t('automod-created', {
        actor,
        name: named,
        defaultValue: '{{actor}} added the AutoMod rule {{name}}',
      });
    case 'automod_updated':
      return t('automod-updated', {
        actor,
        defaultValue: '{{actor}} changed an AutoMod rule',
      });
    case 'automod_deleted':
      return t('automod-deleted', {
        actor,
        name: named,
        defaultValue: '{{actor}} deleted the AutoMod rule {{name}}',
      });
    case 'onboarding_changed':
      return t('onboarding-changed', {
        actor,
        defaultValue: '{{actor}} changed the onboarding questions',
      });
    case 'sisters_changed':
      return t('sisters-changed', {
        actor,
        defaultValue: '{{actor}} changed the related communities',
      });
    case 'rules_changed':
      return t('rules-changed', {
        actor,
        defaultValue: '{{actor}} changed the community rules',
      });
    case 'census_closed':
      return t('census-closed', {
        actor,
        defaultValue: '{{actor}} closed a census',
      });
    case 'challenge_cancelled':
      return t('challenge-cancelled', {
        actor,
        defaultValue: '{{actor}} cancelled a challenge',
      });
    case 'recurring_created':
      return t('recurring-created', {
        ns: 'recurring-threads',
        actor,
        name: named,
        defaultValue: '{{actor}} added the recurring thread {{name}}',
      });
    case 'recurring_updated':
      return t('recurring-updated', {
        ns: 'recurring-threads',
        actor,
        name: named,
        defaultValue: '{{actor}} changed the recurring thread {{name}}',
      });
    case 'recurring_paused':
      return t('recurring-paused', {
        ns: 'recurring-threads',
        actor,
        name: named,
        defaultValue: '{{actor}} paused the recurring thread {{name}}',
      });
    case 'recurring_deleted':
      return t('recurring-deleted', {
        ns: 'recurring-threads',
        actor,
        name: named,
        defaultValue: '{{actor}} deleted the recurring thread {{name}}',
      });
  }
}

const userLabel = (u: ModLogUserDTO) => u.name ?? u.handle ?? u.id;

export function ModLog({ slug }: { slug: string }) {
  const fmt = useLocaleFormat();
  const { t } = useTranslation('community-modlog');
  const [group, setGroup] = useState<GroupFilter>('all');
  const [actor, setActor] = useState('');
  const query = useCallback(
    (cursor?: string) => ({
      scope: 'full' as const,
      ...(group !== 'all'
        ? {
            group,
          }
        : {}),
      ...(actor
        ? {
            actor,
          }
        : {}),
      ...(cursor
        ? {
            cursor,
          }
        : {}),
    }),
    [group, actor],
  );

  const list = useInfiniteQuery({
    queryKey: ['community-modlog', slug, group, actor],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await api(getModLogApi, {
        params: {
          slug,
        },
        query: query(pageParam),
      });
      if (page.scope !== 'full') throw new Error('unexpected scope');
      return page;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const entries = list.data ? list.data.pages.flatMap((p) => p.entries) : null;
  const moderators = list.data?.pages[0]?.moderators ?? [];
  const nextCursor = list.hasNextPage;
  const failed = list.isError;
  const loadingMore = list.isFetchingNextPage;
  const load = () => list.refetch();
  const loadMore = () => list.fetchNextPage();

  const arrival = useArrival(entries !== null);
  const arrivedKey = useArrivingKeys((entries ?? []).map((e) => e.id));

  const tabs: TabItem[] = [
    {
      id: 'all',
      label: t('group-all', {
        defaultValue: 'All',
      }),
    },
    {
      id: 'content',
      label: t('group-content', {
        defaultValue: 'Content',
      }),
    },
    {
      id: 'members',
      label: t('group-members', {
        defaultValue: 'Members',
      }),
    },
    {
      id: 'settings',
      label: t('group-settings', {
        defaultValue: 'Settings',
      }),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={tabs}
          value={group}
          onChange={(id) => setGroup(id as GroupFilter)}
          aria-label={t('filter-group', {
            defaultValue: 'Filter by kind of action',
          })}
        />
        <div className="flex items-center gap-2">
          <Select
            aria-label={t('filter-moderator', {
              defaultValue: 'Filter by moderator',
            })}
            controlSize="sm"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          >
            <option value="">
              {t('all-moderators', {
                defaultValue: 'All moderators',
              })}
            </option>
            {moderators.map((m) => (
              <option key={m.id} value={m.id}>
                {userLabel(m)}
              </option>
            ))}
          </Select>
          <Button asChild variant="default" size="sm">
            <a
              href={apiUrl(exportModLogApi, {
                params: {
                  slug,
                },
              })}
              download
            >
              <Download aria-hidden />
              {t('export', {
                defaultValue: 'Export CSV',
              })}
            </a>
          </Button>
        </div>
      </div>

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
          <Skeleton className="h-12" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          className={arrival}
          title={t('empty', {
            defaultValue: 'No actions yet',
          })}
          description={t('empty-hint', {
            defaultValue: 'Removals, member changes and settings changes show up here.',
          })}
        />
      ) : (
        <>
          <ul className={cn('flex flex-col', arrival)}>
            {entries.map((e) => (
              <li
                key={e.id}
                className={cn('flex flex-col gap-1 border-b border-site-border py-3', arrivedKey(e.id) && ARRIVE)}
              >
                <p className="t-body text-site-text">
                  {actionSentence(t, e)}
                  {e.targetUser?.handle &&
                  (e.action === 'member_removed' ||
                    e.action === 'member_banned' ||
                    e.action === 'member_timed_out' ||
                    e.action === 'ban_lifted' ||
                    e.action === 'note_deleted' ||
                    e.action === 'member_role_changed' ||
                    e.action === 'ownership_transferred' ||
                    e.action === 'join_request_approved' ||
                    e.action === 'join_request_denied') ? (
                    <>
                      {' '}
                      <Link to={`/u/${e.targetUser.handle}` as string} className="t-meta underline">
                        {t('view-profile', {
                          defaultValue: 'View profile',
                        })}
                      </Link>
                    </>
                  ) : null}
                </p>
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
                  <time dateTime={e.createdAt} title={fmt.dateTime(new Date(e.createdAt))}>
                    {fmt.relative(new Date(e.createdAt))}
                  </time>
                </p>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <div>
              <Button size="sm" onClick={() => void loadMore()} loading={loadingMore}>
                {t('load-more', {
                  defaultValue: 'Load more',
                })}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
