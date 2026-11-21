/**
 * The daily leaderboard: today or yesterday, everyone or the people you follow. Top 50 as rows on
 * rules, and the viewer's own row below when it falls outside them. Rank and speed are text, so
 * nothing depends on colour.
 */
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rmhTypeDailyBoardQuery } from '@/lib/rmhtype/rmhtype.queries';
import {
  isoDay,
  shiftDay,
  type DailyBoard as Board,
  type DailyBoardRow,
  type DailyScope,
} from '@/lib/rmhtype/daily';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

type Which =
  | 'today'
  | 'yesterday';

function Row({
  row,
  mine,
  you,
}: {
  row: DailyBoardRow;
  mine: boolean;
  you: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-daily',
    );
  return (
    <li
      aria-current={
        mine
          ? 'true'
          : undefined
      }
      className={cn(
        'grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-app-border py-2.5 text-sm',
        mine &&
          'font-semibold',
      )}
    >
      <span className="font-mono text-app-text-muted">
        {
          row.rank
        }
      </span>
      <span className="truncate">
        {mine &&
        !row.name
          ? you
          : row.name}
      </span>
      <span className="font-mono text-app-text-muted">
        {t(
          'board-score',
          {
            wpm: Math.round(
              row.wpm,
            ),
            accuracy:
              Math.round(
                row.accuracy,
              ),
            defaultValue:
              '{{wpm}} wpm · {{accuracy}}%',
          },
        )}
      </span>
    </li>
  );
}

export function DailyBoard({
  today,
  refreshKey,
}: {
  today: string;
  refreshKey: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-daily',
    );
  const [
    which,
    setWhich,
  ] =
    useState<Which>(
      'today',
    );
  const [
    scope,
    setScope,
  ] =
    useState<DailyScope>(
      'global',
    );
  const day =
    which ===
    'today'
      ? today
      : shiftDay(
          today,
          -1,
        );

  const boardQuery =
    useQuery(
      rmhTypeDailyBoardQuery(
        day,
        scope,
      ),
    );
  const board: Board | null =
    boardQuery.data ??
    null;
  const failed =
    boardQuery.isError;
  const load =
    boardQuery.refetch;
  const arrival =
    useArrival(
      board !==
        null,
    );

  // `refreshKey` changes when the member's own result lands, so the board shows it.
  const firstKey =
    useRef(
      refreshKey,
    );
  useEffect(() => {
    if (
      refreshKey ===
      firstKey.current
    )
      return;
    firstKey.current =
      refreshKey;
    void load();
  }, [
    load,
    refreshKey,
  ]);

  const you =
    t(
      'board-you',
      {
        defaultValue:
          'You',
      },
    );
  const inTop =
    board?.me
      ? board.rows.some(
          (
            r,
          ) =>
            r.userId ===
            board
              .me
              ?.userId,
        )
      : false;

  return (
    <section
      aria-labelledby="daily-board-title"
      className="space-y-4"
    >
      <h2
        id="daily-board-title"
        className="text-lg font-semibold"
      >
        {t(
          'board-title',
          {
            defaultValue:
              'Leaderboard',
          },
        )}
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          aria-label={t(
            'board-day-label',
            {
              defaultValue:
                'Day',
            },
          )}
          value={
            which
          }
          onChange={(
            id,
          ) =>
            setWhich(
              id as Which,
            )
          }
          tabs={[
            {
              id: 'today',
              label:
                t(
                  'board-today',
                  {
                    defaultValue:
                      'Today',
                  },
                ),
            },
            {
              id: 'yesterday',
              label:
                t(
                  'board-yesterday',
                  {
                    defaultValue:
                      'Yesterday',
                  },
                ),
            },
          ]}
        />
        <Tabs
          aria-label={t(
            'board-scope-label',
            {
              defaultValue:
                'Who',
            },
          )}
          value={
            scope
          }
          onChange={(
            id,
          ) =>
            setScope(
              id as DailyScope,
            )
          }
          tabs={[
            {
              id: 'global',
              label:
                t(
                  'board-everyone',
                  {
                    defaultValue:
                      'Everyone',
                  },
                ),
            },
            {
              id: 'friends',
              label:
                t(
                  'board-friends',
                  {
                    defaultValue:
                      'Friends',
                  },
                ),
            },
          ]}
        />
      </div>
      <p className="font-mono text-xs text-app-text-muted">
        {isoDay(
          day,
        )}
      </p>

      {failed ? (
        <div
          role="alert"
          className="space-y-2"
        >
          <p className="text-app-danger">
            {t(
              'board-failed',
              {
                defaultValue:
                  'Could not load the leaderboard.',
              },
            )}
          </p>
          <Button
            variant="default"
            onClick={() =>
              void load()
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
      ) : board ===
        null ? (
        <div
          aria-busy="true"
          className="space-y-2"
        >
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : board
          .rows
          .length ===
        0 ? (
        <p
          className={cn(
            'text-app-text-muted',
            arrival,
          )}
        >
          {scope ===
          'friends'
            ? t(
                'board-empty-friends',
                {
                  defaultValue:
                    'None of your friends have a score for this day yet.',
                },
              )
            : t(
                'board-empty',
                {
                  defaultValue:
                    'No scores for this day yet.',
                },
              )}
        </p>
      ) : (
        <ol
          className={cn(
            arrival,
          )}
        >
          {board.rows.map(
            (
              row,
            ) => (
              <Row
                key={
                  row.userId
                }
                row={
                  row
                }
                mine={
                  row.userId ===
                  board
                    .me
                    ?.userId
                }
                you={
                  you
                }
              />
            ),
          )}
          {board.me &&
          !inTop ? (
            <Row
              row={
                board.me
              }
              mine
              you={
                you
              }
            />
          ) : null}
        </ol>
      )}
    </section>
  );
}
