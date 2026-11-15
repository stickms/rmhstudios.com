import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Swords } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FINISH_STATUSES,
  PLAY_STATUSES,
  type PlayStatus,
} from '@/lib/arcade/backlog';
import {
  clearBacklogApi,
  getBacklogApi,
  getRivalApi,
  setBacklogApi,
  type BacklogView as BacklogData,
  type RivalView as RivalData,
} from '@/lib/arcade/arcade.contract';
import { api } from '@/lib/contract/client';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

function formatMinutes(
  m: number,
): string {
  return m >=
    60
    ? `${Math.floor(m / 60)}h ${m % 60}m`
    : `${m}m`;
}

/**
 * Backlog status (E2) and auto rival (E11) for one game. Fetched after paint
 * into a reserved-height card so nothing shifts when it fills in.
 */
export function GameTracker({
  gameId,
  signedIn,
}: {
  gameId: string;
  signedIn: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'f-arcade',
    );
  const [
    data,
    setData,
  ] =
    useState<BacklogData | null>(
      null,
    );
  const [
    rival,
    setRival,
  ] =
    useState<RivalData | null>(
      null,
    );
  const arrival =
    useArrival(
      data !==
        null,
    );
  const rivalArrival =
    useArrival(
      rival !==
        null,
    );
  const [
    hours,
    setHours,
  ] =
    useState(
      '',
    );

  useEffect(() => {
    let live = true;
    api(
      getBacklogApi,
      {
        query:
          {
            gameId,
          },
        retries: 0,
      },
    )
      .then(
        (
          d,
        ) => {
          if (
            !live
          )
            return;
          setData(
            d,
          );
          if (
            d
              .mine
              ?.finishMinutes
          )
            setHours(
              String(
                Math.round(
                  (d
                    .mine
                    .finishMinutes /
                    60) *
                    10,
                ) /
                  10,
              ),
            );
        },
      )
      .catch(
        () => {},
      );
    if (
      signedIn
    ) {
      api(
        getRivalApi,
        {
          query:
            {
              gameId,
            },
          retries: 0,
        },
      )
        .then(
          (
            d,
          ) =>
            live &&
            setRival(
              d,
            ),
        )
        .catch(
          () => {},
        );
    }
    return () => {
      live = false;
    };
  }, [
    gameId,
    signedIn,
  ]);

  const save =
    useCallback(
      async (
        status:
          | PlayStatus
          | '',
        hoursText: string,
      ) => {
        const minutes =
          Math.round(
            Number(
              hoursText,
            ) *
              60,
          );
        const finishMinutes =
          (
            FINISH_STATUSES as readonly string[]
          ).includes(
            status,
          ) &&
          minutes >
            0
            ? minutes
            : null;
        try {
          if (
            status
          )
            await api(
              setBacklogApi,
              {
                body: {
                  gameId,
                  status,
                  finishMinutes,
                },
              },
            );
          else
            await api(
              clearBacklogApi,
              {
                query:
                  {
                    gameId,
                  },
              },
            );
        } catch {
          toast.error(
            t(
              'save-failed',
              {
                defaultValue:
                  'Could not save that.',
              },
            ),
          );
          return;
        }
        setData(
          (
            d,
          ) =>
            d
              ? {
                  ...d,
                  mine: status
                    ? {
                        status,
                        finishMinutes,
                      }
                    : null,
                }
              : d,
        );
      },
      [
        gameId,
        t,
      ],
    );

  const labels: Record<
    PlayStatus,
    string
  > =
    {
      want: t(
        'status-want',
        {
          defaultValue:
            'Want to play',
        },
      ),
      playing:
        t(
          'status-playing',
          {
            defaultValue:
              'Playing',
          },
        ),
      finished:
        t(
          'status-finished',
          {
            defaultValue:
              'Finished',
          },
        ),
      completed:
        t(
          'status-completed',
          {
            defaultValue:
              '100% complete',
          },
        ),
      dropped:
        t(
          'status-dropped',
          {
            defaultValue:
              'Dropped',
          },
        ),
    };
  const status =
    data
      ?.mine
      ?.status ??
    '';
  const median =
    data
      ?.stats
      .medianMinutes;

  return (
    <Card className="min-h-28 gap-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        {signedIn ? (
          <label className="flex min-w-44 flex-1 flex-col gap-2 text-xs text-site-text-muted">
            {t(
              'your-status',
              {
                defaultValue:
                  'Your status',
              },
            )}
            <Select
              value={
                status
              }
              disabled={
                !data
              }
              onChange={(
                e,
              ) => {
                const next =
                  e
                    .target
                    .value as
                    | PlayStatus
                    | '';
                void save(
                  next,
                  hours,
                );
              }}
            >
              <option value="">
                {t(
                  'status-none',
                  {
                    defaultValue:
                      'Not tracked',
                  },
                )}
              </option>
              {PLAY_STATUSES.map(
                (
                  s,
                ) => (
                  <option
                    key={
                      s
                    }
                    value={
                      s
                    }
                  >
                    {
                      labels[
                        s
                      ]
                    }
                  </option>
                ),
              )}
            </Select>
          </label>
        ) : null}
        {signedIn &&
        status &&
        (
          FINISH_STATUSES as readonly string[]
        ).includes(
          status,
        ) ? (
          <label className="flex w-36 flex-col gap-2 text-xs text-site-text-muted">
            {t(
              'hours-label',
              {
                defaultValue:
                  'Hours to finish',
              },
            )}
            <span className="flex gap-2">
              <Input
                inputMode="decimal"
                value={
                  hours
                }
                onChange={(
                  e,
                ) =>
                  setHours(
                    e.target.value
                      .replace(
                        /[^0-9.]/g,
                        '',
                      )
                      .slice(
                        0,
                        5,
                      ),
                  )
                }
              />
              <Button
                size="sm"
                variant="default"
                onClick={() =>
                  void save(
                    status as PlayStatus,
                    hours,
                  )
                }
              >
                {t(
                  'save',
                  {
                    defaultValue:
                      'Save',
                  },
                )}
              </Button>
            </span>
          </label>
        ) : null}
      </div>
      <p
        className={cn(
          'text-sm text-site-text-muted',
          arrival,
        )}
      >
        {median
          ? t(
              'median-line',
              {
                defaultValue:
                  'Median time to finish: {{time}} ({{count}} players)',
                time: formatMinutes(
                  median,
                ),
                count:
                  data
                    ?.stats
                    .count ??
                  0,
              },
            )
          : t(
              'median-none',
              {
                defaultValue:
                  'No completion times yet.',
              },
            )}
      </p>
      {rival?.rival ? (
        <p
          className={cn(
            'flex items-center gap-2 text-sm text-site-text',
            rivalArrival,
          )}
        >
          <Swords
            className="h-4 w-4 shrink-0 text-site-accent"
            aria-hidden
          />
          {rival.state ===
          'behind'
            ? t(
                'rival-behind',
                {
                  defaultValue:
                    "You're ahead of {{name}}. We'll tell you if they pass you.",
                  name: rival
                    .rival
                    .name,
                },
              )
            : t(
                'rival-ahead',
                {
                  defaultValue:
                    'Your rival: {{name}} (#{{rank}}) is {{gap}} points ahead.',
                  name: rival
                    .rival
                    .name,
                  rank: rival
                    .rival
                    .rank,
                  gap: Math.abs(
                    rival
                      .rival
                      .score -
                      (rival.myScore ??
                        0),
                  ).toLocaleString(),
                },
              )}
        </p>
      ) : null}
    </Card>
  );
}
