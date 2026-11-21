import { useState } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ARRIVE,
  useArrival,
  useArrivingKeys,
} from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import {
  clearConversationMuteApi,
  listMutedConversationsApi,
  type MutedConversation,
} from '@/lib/feed/conversation-controls.contract';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/stores/localeStore';

const QUERY_KEY =
  [
    'settings',
    'muted-conversations',
  ] as const;

/**
 * "Muted conversations" in `/settings/notifications`: the posts whose conversation the member muted (for a while, until
 * they turn it back on, or Mentions only), newest first, each with Unmute. Rows on rules, no boxes.
 */
export function MutedConversationsSection() {
  const {
    t,
  } =
    useTranslation(
      'conversation-controls',
    );
  const {
    data: session,
  } =
    useSession();
  const locale =
    useLocaleStore(
      (
        s,
      ) =>
        s.locale,
    );
  const queryClient =
    useQueryClient();
  const [
    pending,
    setPending,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );

  const query =
    useInfiniteQuery(
      {
        queryKey:
          QUERY_KEY,
        enabled:
          !!session?.user,
        retry: false,
        initialPageParam:
          undefined as
            | string
            | undefined,
        queryFn:
          ({
            pageParam,
          }) =>
            api(
              listMutedConversationsApi,
              {
                query:
                  pageParam
                    ? {
                        cursor:
                          pageParam,
                      }
                    : {},
              },
            ),
        getNextPageParam:
          (
            last,
          ) =>
            last.nextCursor ??
            undefined,
      },
    );
  const items =
    query.data?.pages.flatMap(
      (
        p,
      ) =>
        p.items,
    ) ??
    [];
  const arrival =
    useArrival(
      !query.isPending,
    );
  const isNew =
    useArrivingKeys(
      items.map(
        (
          i,
        ) =>
          i.rootId,
      ),
    );

  if (
    !session?.user
  )
    return null;

  const when =
    new Intl.DateTimeFormat(
      locale,
      {
        dateStyle:
          'medium',
        timeStyle:
          'short',
      },
    );
  const untilText =
    (
      c: MutedConversation,
    ) =>
      c.mode ===
      'mentions'
        ? t(
            'until-mentions',
            {
              defaultValue:
                'Mentions only',
            },
          )
        : c.indefinite
          ? t(
              'until-forever',
              {
                defaultValue:
                  'Muted until you turn it back on',
              },
            )
          : t(
              'until-date',
              {
                defaultValue:
                  'Muted until {{date}}',
                date: c.muteUntil
                  ? when.format(
                      new Date(
                        c.muteUntil,
                      ),
                    )
                  : '',
              },
            );

  const unmute =
    async (
      rootId: string,
    ) => {
      setPending(
        rootId,
      );
      try {
        await api(
          clearConversationMuteApi,
          {
            params:
              {
                id: rootId,
              },
          },
        );
        queryClient.setQueryData<
          typeof query.data
        >(
          QUERY_KEY,
          (
            old,
          ) =>
            old
              ? {
                  ...old,
                  pages:
                    old.pages.map(
                      (
                        p,
                      ) => ({
                        ...p,
                        items:
                          p.items.filter(
                            (
                              i,
                            ) =>
                              i.rootId !==
                              rootId,
                          ),
                      }),
                    ),
                }
              : old,
        );
        void queryClient.invalidateQueries(
          {
            queryKey:
              [
                'feed',
                'conversation-mute',
                rootId,
              ],
          },
        );
        toast.success(
          t(
            'toast-unmuted',
            {
              defaultValue:
                'Conversation unmuted.',
            },
          ),
        );
      } catch {
        toast.error(
          t(
            'error-unmute',
            {
              defaultValue:
                'Could not unmute this conversation.',
            },
          ),
        );
      } finally {
        setPending(
          null,
        );
      }
    };

  return (
    <SettingsSection
      className={
        arrival
      }
      title={t(
        'title',
        {
          defaultValue:
            'Muted conversations',
        },
      )}
      description={t(
        'desc',
        {
          defaultValue:
            'Posts whose replies, likes and reposts you stopped hearing about. Mute one from its menu.',
        },
      )}
    >
      {query.isPending ? (
        <div
          className="space-y-3 py-3"
          aria-busy="true"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p
            className="t-body text-site-text-muted"
            role="alert"
          >
            {t(
              'error-load',
              {
                defaultValue:
                  'Could not load your muted conversations.',
              },
            )}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void query.refetch()
            }
          >
            {t(
              'retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </Button>
        </div>
      ) : items.length ===
        0 ? (
        <p className="t-body py-3 text-site-text-muted">
          {t(
            'empty',
            {
              defaultValue:
                'You have not muted any conversations.',
            },
          )}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-site-border">
            {items.map(
              (
                c,
              ) => {
                const label =
                  c.post
                    ? c
                        .post
                        .text ||
                      t(
                        'post-no-text',
                        {
                          defaultValue:
                            'Post without text',
                        },
                      )
                    : t(
                        'post-unavailable',
                        {
                          defaultValue:
                            'This post is no longer available',
                        },
                      );
                return (
                  <li
                    key={
                      c.rootId
                    }
                    className={cn(
                      'flex flex-wrap items-center gap-x-4 gap-y-2 py-3',
                      isNew(
                        c.rootId,
                      ) &&
                        ARRIVE,
                    )}
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      {c.post ? (
                        <Link
                          to={
                            c
                              .post
                              .link as string
                          }
                          className="t-body block truncate text-site-text hover:underline"
                        >
                          {
                            label
                          }
                        </Link>
                      ) : (
                        <p className="t-body truncate text-site-text-muted">
                          {
                            label
                          }
                        </p>
                      )}
                      <p className="t-meta truncate">
                        {c
                          .post
                          ?.author
                          ? `${c.post.author} · `
                          : ''}
                        {untilText(
                          c,
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        pending ===
                        c.rootId
                      }
                      aria-label={t(
                        'unmute-post',
                        {
                          defaultValue:
                            'Unmute conversation: {{post}}',
                          post: label,
                        },
                      )}
                      onClick={() =>
                        void unmute(
                          c.rootId,
                        )
                      }
                    >
                      {t(
                        'unmute',
                        {
                          defaultValue:
                            'Unmute',
                        },
                      )}
                    </Button>
                  </li>
                );
              },
            )}
          </ul>
          {query.hasNextPage && (
            <div className="py-3">
              <Button
                type="button"
                size="sm"
                disabled={
                  query.isFetchingNextPage
                }
                onClick={() =>
                  void query.fetchNextPage()
                }
              >
                {t(
                  'load-more',
                  {
                    defaultValue:
                      'Load more',
                  },
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}
