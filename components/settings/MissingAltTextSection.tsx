import { useState } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { EditAltTextDialog } from '@/components/feed/EditAltTextDialog';
import { formatDateShort } from '@/lib/core/format';
import { api } from '@/lib/contract/client';
import { listMissingAltTextApi } from '@/lib/feed/alt-text-edit.contract';
import {
  missingAltCount,
  thumbnailIndex,
  type MissingAltPage,
  type MissingAltRow,
} from '@/lib/feed/alt-text-edit';
import { useFeedStore } from '@/stores/feedStore';

const LIST_KEY =
  [
    'feed',
    'missing-alt-text',
  ] as const;

/**
 * Settings > Content: "Images without descriptions" (sprint 05 #16). The member's own posts with at least one image
 * that has no description, newest first, 20 a page; "Describe" opens the same dialog as the post menu. A post that is
 * fully described leaves the list at once. The section is absent when there is nothing to describe.
 */
export function MissingAltTextSection() {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'alt-text-editing',
    );
  const queryClient =
    useQueryClient();
  const [
    editing,
    setEditing,
  ] =
    useState<MissingAltRow | null>(
      null,
    );
  const [
    opener,
    setOpener,
  ] =
    useState<HTMLElement | null>(
      null,
    );

  const list =
    useInfiniteQuery(
      {
        queryKey:
          LIST_KEY,
        initialPageParam:
          undefined as
            | string
            | undefined,
        queryFn:
          ({
            pageParam,
          }) =>
            api(
              listMissingAltTextApi,
              {
                query:
                  {
                    after:
                      pageParam,
                  },
              },
            ),
        getNextPageParam:
          (
            last: MissingAltPage,
          ) =>
            last.nextCursor ??
            undefined,
      },
    );
  const pages =
    list
      .data
      ?.pages;
  const rows =
    pages?.flatMap(
      (
        p,
      ) =>
        p.rows,
    ) ??
    [];
  const first =
    pages?.[0];
  const arrival =
    useArrival(
      !list.isPending,
    );

  // Nothing to say while it loads, and nothing at all for a member with every image described.
  if (
    list.isPending
  )
    return null;
  if (
    !list.isError &&
    rows.length ===
      0 &&
    !list.hasNextPage
  )
    return null;

  const onSaved =
    (
      row: MissingAltRow,
      imageAlts: string[],
    ) => {
      const done =
        missingAltCount(
          row.imageUrls,
          imageAlts,
        ) ===
        0;
      queryClient.setQueryData<
        InfiniteData<
          MissingAltPage,
          | string
          | undefined
        >
      >(
        LIST_KEY,
        (
          old,
        ) => {
          if (
            !old
          )
            return old;
          return {
            ...old,
            pages:
              old.pages.map(
                (
                  p,
                  i,
                ) => ({
                  ...p,
                  rows: done
                    ? p.rows.filter(
                        (
                          r,
                        ) =>
                          r.id !==
                          row.id,
                      )
                    : p.rows.map(
                        (
                          r,
                        ) =>
                          r.id ===
                          row.id
                            ? {
                                ...r,
                                imageAlts,
                                missing:
                                  missingAltCount(
                                    r.imageUrls,
                                    imageAlts,
                                  ),
                              }
                            : r,
                      ),
                  total:
                    i ===
                      0 &&
                    done &&
                    p.total !==
                      null &&
                    !p.capped
                      ? Math.max(
                          0,
                          p.total -
                            1,
                        )
                      : p.total,
                }),
              ),
          };
        },
      );
      // Past the cap the shown number cannot be adjusted by hand.
      if (
        done &&
        first?.capped
      )
        void queryClient.invalidateQueries(
          {
            queryKey:
              LIST_KEY,
          },
        );
      // A copy of the post already in the feed store shows the new descriptions at once.
      useFeedStore
        .getState()
        .updateItem(
          row.id,
          {
            imageAlts,
          },
        );
    };

  let body: React.ReactNode;
  if (
    list.isError &&
    rows.length ===
      0
  ) {
    body =
      (
        <div
          className={
            arrival
          }
        >
          <p
            role="alert"
            className="t-body py-3 text-site-danger"
          >
            {t(
              'load-failed',
              {
                defaultValue:
                  'Could not load this list.',
              },
            )}
          </p>
          <Button
            onClick={() =>
              void list.refetch()
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
      );
  } else {
    body =
      (
        <div
          className={
            arrival
          }
        >
          <p className="t-label py-2">
            {t(
              'count',
              {
                n: first?.capped
                  ? '99+'
                  : (first?.total ??
                    rows.length),
                defaultValue:
                  'Posts to describe: {{n}}',
              },
            )}
          </p>
          <ul>
            {rows.map(
              (
                row,
              ) => {
                const line =
                  row.firstLine ||
                  t(
                    'untitled',
                    {
                      defaultValue:
                        'Post with images',
                    },
                  );
                return (
                  <li
                    key={
                      row.id
                    }
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-site-border py-3"
                  >
                    <img
                      src={
                        row
                          .imageUrls[
                          thumbnailIndex(
                            row,
                          )
                        ]
                      }
                      alt=""
                      className="size-12 shrink-0 rounded-site border border-site-border bg-site-bg-subtle object-cover"
                    />
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="t-body block truncate text-site-text">
                        {
                          line
                        }
                      </span>
                      <span className="t-meta block">
                        {formatDateShort(
                          row.createdAt,
                          i18n.language,
                        )}
                        {
                          ' · '
                        }
                        {t(
                          'missing',
                          {
                            missing:
                              row.missing,
                            total:
                              row
                                .imageUrls
                                .length,
                            defaultValue:
                              '{{missing}} of {{total}} images without a description',
                          },
                        )}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      aria-label={t(
                        'describe-aria',
                        {
                          post: line,
                          defaultValue:
                            'Describe the images in: {{post}}',
                        },
                      )}
                      onClick={(
                        e,
                      ) => {
                        setOpener(
                          e.currentTarget,
                        );
                        setEditing(
                          row,
                        );
                      }}
                    >
                      {t(
                        'describe',
                        {
                          defaultValue:
                            'Describe',
                        },
                      )}
                    </Button>
                  </li>
                );
              },
            )}
          </ul>
          {list.isFetchNextPageError && (
            <p
              role="alert"
              className="t-meta py-2 text-site-danger"
            >
              {t(
                'load-more-failed',
                {
                  defaultValue:
                    "Couldn't load more.",
                },
              )}
            </p>
          )}
          {list.hasNextPage && (
            <div className="py-4">
              <Button
                disabled={
                  list.isFetchingNextPage
                }
                onClick={() =>
                  void list.fetchNextPage()
                }
              >
                {list.isFetchingNextPage ? (
                  <Spinner />
                ) : (
                  t(
                    'load-more',
                    {
                      defaultValue:
                        'Load more',
                    },
                  )
                )}
              </Button>
            </div>
          )}
        </div>
      );
  }

  return (
    <SettingsSection
      title={t(
        'section-title',
        {
          defaultValue:
            'Images without descriptions',
        },
      )}
      description={t(
        'section-description',
        {
          defaultValue:
            'People who use screen readers rely on descriptions to follow your pictures.',
        },
      )}
    >
      {
        body
      }
      {editing && (
        <EditAltTextDialog
          open
          onOpenChange={(
            open,
          ) => {
            if (
              !open
            )
              setEditing(
                null,
              );
          }}
          postId={
            editing.id
          }
          imageUrls={
            editing.imageUrls
          }
          imageAlts={
            editing.imageAlts
          }
          restoreFocusTo={() =>
            opener
          }
          onSaved={(
            alts,
          ) =>
            onSaved(
              editing,
              alts,
            )
          }
        />
      )}
    </SettingsSection>
  );
}
