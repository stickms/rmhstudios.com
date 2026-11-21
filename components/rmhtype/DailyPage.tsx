/**
 * RMHType daily challenge: one passage a day for everyone, one scored attempt, the board and the
 * streak. The server owns the clock (`lib/rmhtype/daily.server.ts`): Start reveals the text and
 * stamps the start, a reload resumes the same clock, and Finish sends keystroke counts only. After
 * a finished or missed attempt the passage can be practiced, unscored. The `/rmhtype` layout gates
 * on sign-in.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RMHTYPE_DAILY_KEY,
  finishDailyRun,
  rmhTypeDailyQuery,
  startDailyRun,
} from '@/lib/rmhtype/rmhtype.queries';
import { HttpError } from '@/lib/http';
import {
  DAILY_WINDOW_MS,
  isoDay,
  type DailyState,
} from '@/lib/rmhtype/daily';
import { formatDailyResult } from '@/lib/rmhtype/result-text';
import type { TypingRunResult } from '@/lib/rmhtype/typing-run';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import { DailyBoard } from '@/components/rmhtype/daily/DailyBoard';
import { DailyTyper } from '@/components/rmhtype/daily/DailyTyper';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';

type Phase =
  | 'loading'
  | 'error'
  | 'ready';

export default function DailyPage() {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-daily',
    );
  const queryClient =
    useQueryClient();
  const [
    state,
    setState,
  ] =
    useState<DailyState | null>(
      null,
    );
  const [
    phase,
    setPhase,
  ] =
    useState<Phase>(
      'loading',
    );
  const [
    starting,
    setStarting,
  ] =
    useState(
      false,
    );
  const [
    startFailed,
    setStartFailed,
  ] =
    useState(
      false,
    );
  const [
    sending,
    setSending,
  ] =
    useState(
      false,
    );
  const [
    sendFailed,
    setSendFailed,
  ] =
    useState(
      false,
    );
  // The server closed the attempt without a score because it judged the report implausible.
  const [
    rejected,
    setRejected,
  ] =
    useState(
      false,
    );
  const [
    report,
    setReport,
  ] =
    useState<{
      correct: number;
      total: number;
    } | null>(
      null,
    );
  const [
    practice,
    setPractice,
  ] =
    useState<
      | 'idle'
      | 'typing'
      | 'done'
    >(
      'idle',
    );
  const [
    practiceResult,
    setPracticeResult,
  ] =
    useState<TypingRunResult | null>(
      null,
    );
  // Server time minus this machine's, so the clock text follows the server, not the local clock.
  const skew =
    useRef(
      0,
    );
  const arrival =
    useArrival(
      phase ===
        'ready',
    );

  const accept =
    useCallback(
      (
        next: DailyState,
      ) => {
        skew.current =
          Date.parse(
            next.serverNow,
          ) -
          Date.now();
        setState(
          next,
        );
        setPhase(
          'ready',
        );
        // The landing's Daily entry reads the same query, so it is current when the member goes back.
        queryClient.setQueryData(
          RMHTYPE_DAILY_KEY,
          next,
        );
      },
      [
        queryClient,
      ],
    );

  // Today's state is a React Query (redesign audit B4); the page's own phases start from its first answer.
  const daily =
    useQuery(
      rmhTypeDailyQuery(),
    );
  const firstAnswer =
    useRef(
      false,
    );
  useEffect(() => {
    if (
      firstAnswer.current
    )
      return;
    if (
      daily.data
    ) {
      firstAnswer.current = true;
      accept(
        daily.data,
      );
    } else if (
      daily.isError
    ) {
      firstAnswer.current = true;
      setPhase(
        'error',
      );
    }
  }, [
    daily.data,
    daily.isError,
    accept,
  ]);

  const refetchDaily =
    daily.refetch;
  const load =
    useCallback(async () => {
      setPhase(
        'loading',
      );
      const next =
        await refetchDaily();
      if (
        next.data &&
        !next.isError
      )
        accept(
          next.data,
        );
      else
        setPhase(
          'error',
        );
    }, [
      accept,
      refetchDaily,
    ]);

  const start =
    useCallback(async () => {
      setStarting(
        true,
      );
      setStartFailed(
        false,
      );
      try {
        accept(
          await startDailyRun(),
        );
      } catch {
        setStartFailed(
          true,
        );
      } finally {
        setStarting(
          false,
        );
      }
    }, [
      accept,
    ]);

  const send =
    useCallback(
      async (counts: {
        correct: number;
        total: number;
      }) => {
        if (
          !state
        )
          return;
        setSending(
          true,
        );
        setSendFailed(
          false,
        );
        try {
          accept(
            await finishDailyRun(
              {
                  day: state.day,
                  ...counts,
                },
            ),
          );
          setReport(
            null,
          );
        } catch (err) {
          const status =
            err instanceof
            HttpError
              ? err.status
              : 0;
          // 422 and 409 are final answers (the server has closed or scored the attempt), so
          // they are never retried; only a network failure or a 5xx offers "Try again".
          if (
            status ===
              422 ||
            status ===
              409
          ) {
            setRejected(
              status ===
                422,
            );
            setReport(
              null,
            );
            try {
              accept(
                await queryClient.fetchQuery({
                    ...rmhTypeDailyQuery(),
                    staleTime: 0,
                  }),
              );
            } catch {
              setSendFailed(
                true,
              );
              setReport(
                counts,
              );
            }
          } else {
            setSendFailed(
              true,
            );
          }
        } finally {
          setSending(
            false,
          );
        }
      },
      [
        accept,
        queryClient,
        state,
      ],
    );

  const onScoredDone =
    useCallback(
      (
        result: TypingRunResult,
      ) => {
        const counts =
          {
            correct:
              result.keystrokes -
              result.errorKeystrokes,
            total:
              result.keystrokes,
          };
        setReport(
          counts,
        );
        void send(
          counts,
        );
      },
      [
        send,
      ],
    );

  const onPracticeDone =
    useCallback(
      (
        result: TypingRunResult,
      ) => {
        setPracticeResult(
          result,
        );
        setPractice(
          'done',
        );
      },
      [],
    );

  const header =
    (
      <RmhTypeHeader
        backLabel={t(
          'back',
          {
            defaultValue:
              'RMHType',
          },
        )}
        backHref="/rmhtype"
      />
    );

  if (
    phase !==
      'ready' ||
    !state
  ) {
    return (
      <div className="app-page">
        {
          header
        }
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 md:p-8">
          <h1 className="text-xl font-semibold">
            {t(
              'title',
              {
                defaultValue:
                  'Daily challenge',
              },
            )}
          </h1>
          {phase ===
          'error' ? (
            <div
              role="alert"
              className="space-y-2"
            >
              <p className="text-app-danger">
                {t(
                  'load-failed',
                  {
                    defaultValue:
                      'Could not load today’s challenge.',
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
          ) : (
            <div
              aria-busy="true"
              className="space-y-3"
            >
              <p
                role="status"
                className="sr-only"
              >
                {t(
                  'loading',
                  {
                    defaultValue:
                      'Loading today’s challenge...',
                  },
                )}
              </p>
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-32" />
            </div>
          )}
        </div>
      </div>
    );
  }

  const streakText =
    t(
      'streak',
      {
        count:
          state.streak,
        defaultValue_one:
          'Streak: {{count}} day',
        defaultValue_other:
          'Streak: {{count}} days',
        defaultValue:
          'Streak: {{count}} days',
      },
    );
  const running =
    state.status ===
      'running' &&
    state.text !==
      null &&
    state.startedAt !==
      null;
  const startedAt =
    state.startedAt
      ? Date.parse(
          state.startedAt,
        )
      : 0;
  const timeLeft =
    () =>
      startedAt +
      DAILY_WINDOW_MS -
      (Date.now() +
        skew.current);

  let body: React.ReactNode;
  if (
    running &&
    state.text !==
      null
  ) {
    body =
      (
        <div className="space-y-4">
          <p className="text-app-text-muted">
            {t(
              'running-note',
              {
                defaultValue:
                  'Your attempt is running. If you reload, the clock keeps going and the text is shown again.',
              },
            )}
          </p>
          {report ? (
            <div
              role={
                sendFailed
                  ? 'alert'
                  : 'status'
              }
              className="space-y-2"
            >
              <p
                className={
                  sendFailed
                    ? 'text-app-danger'
                    : 'text-app-text-muted'
                }
              >
                {sendFailed
                  ? t(
                      'send-failed',
                      {
                        defaultValue:
                          'Could not save your result.',
                      },
                    )
                  : t(
                      'sending',
                      {
                        defaultValue:
                          'Saving your result...',
                      },
                    )}
              </p>
              {sendFailed ? (
                <Button
                  variant="default"
                  loading={
                    sending
                  }
                  onClick={() =>
                    void send(
                      report,
                    )
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
              ) : null}
            </div>
          ) : (
            <DailyTyper
              text={
                state.text
              }
              timeLeftMs={
                timeLeft
              }
              onDone={
                onScoredDone
              }
            />
          )}
        </div>
      );
  } else if (
    practice ===
      'typing' &&
    state.text !==
      null
  ) {
    body =
      (
        <div className="space-y-4">
          <p className="text-app-text-muted">
            {t(
              'practice-note',
              {
                defaultValue:
                  'Practice run. It is not scored and not on the board.',
              },
            )}
          </p>
          <DailyTyper
            text={
              state.text
            }
            onDone={
              onPracticeDone
            }
          />
        </div>
      );
  } else if (
    practice ===
      'done' &&
    practiceResult
  ) {
    body =
      (
        <section
          aria-labelledby="daily-practice-title"
          className="space-y-3"
        >
          <h2
            id="daily-practice-title"
            className="text-lg font-semibold"
          >
            {t(
              'practice-done',
              {
                defaultValue:
                  'Practice complete',
              },
            )}
          </h2>
          <p className="font-mono text-app-text-muted">
            {t(
              'board-score',
              {
                wpm: Math.round(
                  practiceResult.wpm,
                ),
                accuracy:
                  Math.round(
                    practiceResult.accuracy,
                  ),
                defaultValue:
                  '{{wpm}} wpm · {{accuracy}}%',
              },
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="default"
              onClick={() =>
                setPractice(
                  'typing',
                )
              }
            >
              {t(
                'practice-again',
                {
                  defaultValue:
                    'Practice again',
                },
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                setPractice(
                  'idle',
                )
              }
            >
              {t(
                'practice-close',
                {
                  defaultValue:
                    'Done',
                },
              )}
            </Button>
          </div>
        </section>
      );
  } else if (
    state.status ===
    'ready'
  ) {
    body =
      (
        <div className="space-y-4">
          <p>
            {t(
              'ready-length',
              {
                count:
                  state.passageLength,
                defaultValue_one:
                  'Today’s passage is {{count}} character long.',
                defaultValue_other:
                  'Today’s passage is {{count}} characters long.',
                defaultValue:
                  'Today’s passage is {{count}} characters long.',
              },
            )}
          </p>
          <p className="text-app-text-muted">
            {t(
              'ready-note',
              {
                defaultValue:
                  'Start uses today’s one scored attempt and begins the clock. You have 15 minutes. The text is shown once you start.',
              },
            )}
          </p>
          {startFailed ? (
            <p
              role="alert"
              className="text-app-danger"
            >
              {t(
                'start-failed',
                {
                  defaultValue:
                    'Could not start. Try again.',
                },
              )}
            </p>
          ) : null}
          <Button
            variant="primary"
            loading={
              starting
            }
            onClick={() =>
              void start()
            }
          >
            {t(
              'start',
              {
                defaultValue:
                  'Start',
              },
            )}
          </Button>
        </div>
      );
  } else {
    const result =
      state.result;
    body =
      (
        <section
          aria-labelledby="daily-result-title"
          className="space-y-3"
        >
          <h2
            id="daily-result-title"
            className="text-lg font-semibold"
          >
            {state.status ===
            'done'
              ? t(
                  'result-title',
                  {
                    defaultValue:
                      'Today’s result',
                  },
                )
              : t(
                  'missed-title',
                  {
                    defaultValue:
                      'No score today',
                  },
                )}
          </h2>
          {result ? (
            <>
              <p
                role="status"
                className="font-mono"
              >
                {t(
                  'result-line',
                  {
                    wpm: Math.round(
                      result.wpm,
                    ),
                    accuracy:
                      Math.round(
                        result.accuracy,
                      ),
                    seconds:
                      (
                        result.timeMs /
                        1000
                      ).toFixed(
                        1,
                      ),
                    defaultValue:
                      '{{wpm}} wpm · {{accuracy}}% accuracy · {{seconds}} s',
                  },
                )}
              </p>
              <p>
                {t(
                  'result-rank',
                  {
                    rank: result.rank,
                    defaultValue:
                      'Rank today: {{rank}}',
                  },
                )}
              </p>
              <CopyButton
                variant="default"
                value={formatDailyResult(
                  {
                    day: isoDay(
                      state.day,
                    ),
                    wpm: result.wpm,
                    accuracy:
                      result.accuracy,
                  },
                )}
                label={t(
                  'share',
                  {
                    defaultValue:
                      'Copy result',
                  },
                )}
              >
                {t(
                  'share',
                  {
                    defaultValue:
                      'Copy result',
                  },
                )}
              </CopyButton>
            </>
          ) : (
            <p
              role="status"
              className="text-app-text-muted"
            >
              {rejected
                ? t(
                    'rejected-note',
                    {
                      defaultValue:
                        'Your result was rejected as implausible, so this attempt has no score and cannot be retried. You can still practice the passage.',
                    },
                  )
                : t(
                    'missed-note',
                    {
                      defaultValue:
                        'The attempt was not finished within 15 minutes, so it has no score. You can still practice the passage.',
                    },
                  )}
            </p>
          )}
          {state.text !==
          null ? (
            <div>
              <Button
                variant="ghost"
                onClick={() =>
                  setPractice(
                    'typing',
                  )
                }
              >
                {t(
                  'practice',
                  {
                    defaultValue:
                      'Practice this passage',
                  },
                )}
              </Button>
            </div>
          ) : null}
        </section>
      );
  }

  return (
    <div className="app-page">
      {
        header
      }
      <div
        className={`mx-auto w-full max-w-3xl flex-1 space-y-8 p-4 md:p-8 ${arrival ?? ''}`}
      >
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            {t(
              'title',
              {
                defaultValue:
                  'Daily challenge',
              },
            )}
          </h1>
          <p className="font-mono text-sm text-app-text-muted">
            {isoDay(
              state.day,
            )}{' '}
            ·{' '}
            {
              streakText
            }
          </p>
        </div>
        {
          body
        }
        <DailyBoard
          today={
            state.day
          }
          refreshKey={
            state.status ===
            'done'
              ? state.result
                ? String(
                    state
                      .result
                      .rank,
                  )
                : 'done'
              : state.status
          }
        />
      </div>
    </div>
  );
}
