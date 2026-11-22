import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { listMyGroupMentions } from '@/lib/group-chat/mentions.queries';
import type { MyMentionRow } from '@/lib/group-chat/mentions.contract';

/**
 * "Your mentions" in the group info dialog (s07-05): the viewer's own mentions in this group, newest first. Each row
 * goes to the message: it scrolls to it when it is on screen, else it opens the group at that message.
 */
export function GroupMentionsList({
  groupId,
}: {
  groupId: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-mentions',
    );
  // Cursors of the pages loaded so far; page 0 has none. Each page is its own query, so no fetch runs in an effect.
  const [
    cursors,
    setCursors,
  ] =
    useState<
      (
        | string
        | null
      )[]
    >(
      [
        null,
      ],
    );
  return (
    <section aria-labelledby="group-mentions-heading">
      <h3
        id="group-mentions-heading"
        className="t-label pb-1"
      >
        {t(
          'your-mentions',
          {
            defaultValue:
              'Your mentions',
          },
        )}
      </h3>
      {cursors.map(
        (
          cursor,
          i,
        ) => (
          <MentionsPage
            key={
              cursor ??
              'first'
            }
            groupId={
              groupId
            }
            cursor={
              cursor
            }
            first={
              i ===
              0
            }
            isLast={
              i ===
              cursors.length -
                1
            }
            onMore={(
              next,
            ) =>
              setCursors(
                (
                  cur,
                ) => [
                  ...cur,
                  next,
                ],
              )
            }
          />
        ),
      )}
    </section>
  );
}

function MentionsPage({
  groupId,
  cursor,
  first,
  isLast,
  onMore,
}: {
  groupId: string;
  cursor:
    | string
    | null;
  first: boolean;
  isLast: boolean;
  onMore: (
    next: string,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-mentions',
    );
  const query =
    useQuery(
      {
        queryKey:
          [
            'group-mentions',
            groupId,
            cursor,
          ],
        queryFn:
          () =>
            listMyGroupMentions(
              groupId,
              cursor ??
                undefined,
            ),
      },
    );
  const arrival =
    useArrival(
      query.isSuccess,
    );
  if (
    query.isPending
  )
    return (
      <Skeleton className="h-12 w-full" />
    );
  if (
    query.isError
  )
    return (
      <div className="flex items-center gap-2 py-2">
        <p className="t-body text-site-text-muted">
          {t(
            'mentions-failed',
            {
              defaultValue:
                'Could not load your mentions.',
            },
          )}
        </p>
        <Button
          variant="default"
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
    );
  const {
    mentions,
    next,
  } =
    query.data;
  if (
    first &&
    mentions.length ===
      0
  )
    return (
      <p className="t-body py-2 text-site-text-muted">
        {t(
          'mentions-empty',
          {
            defaultValue:
              'No one has mentioned you here.',
          },
        )}
      </p>
    );
  return (
    <div
      className={
        arrival
      }
    >
      <ul>
        {mentions.map(
          (
            m,
          ) => (
            <MentionRow
              key={
                m.messageId
              }
              groupId={
                groupId
              }
              row={
                m
              }
            />
          ),
        )}
      </ul>
      {isLast &&
        next && (
          <Button
            variant="default"
            className="mt-2"
            onClick={() =>
              onMore(
                next,
              )
            }
          >
            {t(
              'show-more',
              {
                defaultValue:
                  'Show more',
              },
            )}
          </Button>
        )}
    </div>
  );
}

function MentionRow({
  groupId,
  row,
}: {
  groupId: string;
  row: MyMentionRow;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-mentions',
    );
  const who =
    row
      .sender
      .name ||
    (row
      .sender
      .handle
      ? `@${row.sender.handle}`
      : null);
  const anchor = `group-message-${row.messageId}`;
  return (
    <li className="border-b border-site-border last:border-b-0">
      <DialogClose
        asChild
      >
        <a
          href={`/groups/${groupId}#${anchor}`}
          className="block min-h-11 py-2 hover:bg-site-bg-subtle"
          onClick={(
            e,
          ) => {
            const el =
              document.getElementById(
                anchor,
              );
            if (
              !el
            )
              return;
            e.preventDefault();
            el.scrollIntoView(
              {
                block:
                  'center',
              },
            );
          }}
        >
          <span className="t-meta block">
            {who ??
              t(
                'member-fallback',
                {
                  defaultValue:
                    'Member',
                },
              )}
          </span>
          <span className="t-body line-clamp-2 break-words">
            {
              row.snippet
            }
          </span>
        </a>
      </DialogClose>
    </li>
  );
}
