import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  SendHorizontal,
} from 'lucide-react';
import { useSession } from '@/components/Providers';
import {
  timeAgo,
  useNow,
} from './hooks';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import {
  getElectionSummaryApi,
  askElectionsApi,
} from '@/lib/elections/elections.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface SummaryResponse {
  summary:
    | string
    | null;
  generatedAt:
    | string
    | null;
}

/**
 * "The desk": an AI-written summary grounded in the live numbers, the plain
 * bullets underneath (always available, no AI needed), and a question box for
 * signed-in members. The AI paragraph is labelled as such and never replaces
 * the numbers above it.
 */
export function AiDesk({
  cycle,
  live,
  bullets,
}: {
  cycle: string;
  live: boolean;
  bullets: string[];
}) {
  const {
    t,
  } =
    useTranslation(
      'c-elections',
    );
  const {
    data: session,
  } =
    useSession();
  const now =
    useNow(
      30_000,
    );
  const [
    q,
    setQ,
  ] =
    useState(
      '',
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const [
    answer,
    setAnswer,
  ] =
    useState<{
      q: string;
      a: string;
    } | null>(
      null,
    );

  const {
    data,
  } =
    useQuery<SummaryResponse>(
      {
        queryKey:
          [
            'elections-summary',
            cycle,
          ],
        queryFn:
          async ({
            signal,
          }) => {
            return api(
              getElectionSummaryApi,
              {
                query:
                  {
                    cycle,
                  },
                signal,
                retries: 0,
              },
            );
          },
        refetchInterval:
          live
            ? 60_000
            : 10 *
              60_000,
        staleTime: 20_000,
        retry: 1,
      },
    );
  const summaryArrival =
    useArrival(
      !!data?.summary,
    );

  const ask =
    async (
      e: React.FormEvent,
    ) => {
      e.preventDefault();
      const question =
        q.trim();
      if (
        question.length <
          3 ||
        busy
      )
        return;
      setBusy(
        true,
      );
      try {
        const j =
          await api(
            askElectionsApi,
            {
              body: {
                question,
                cycle,
              },
            },
          );
        setAnswer(
          {
            q: question,
            a: j.answer,
          },
        );
        setQ(
          '',
        );
      } catch (err) {
        const status =
          err instanceof
          HttpError
            ? err.status
            : null;
        if (
          status ===
          429
        ) {
          setAnswer(
            {
              q: question,
              a: t(
                'ask.slow',
                {
                  defaultValue:
                    'Easy — too many questions. Try again in a minute.',
                },
              ),
            },
          );
        } else if (
          status ===
          402
        ) {
          setAnswer(
            {
              q: question,
              a: t(
                'ask.budget',
                {
                  defaultValue:
                    'You have used this month’s AI allowance.',
                },
              ),
            },
          );
        } else {
          setAnswer(
            {
              q: question,
              a: t(
                'ask.unavailable',
                {
                  defaultValue:
                    'The AI desk is unavailable right now.',
                },
              ),
            },
          );
        }
      } finally {
        setBusy(
          false,
        );
      }
    };

  return (
    <div className="el-desk">
      <div
        className="el-box el-proj"
        style={{
          margin: 0,
        }}
      >
        <p
          className="el-eyebrow"
          style={{
            margin:
              '0 0 10px',
            display:
              'flex',
            gap: 8,
            alignItems:
              'center',
          }}
        >
          {data?.summary ? (
            <span className="el-chip el-chip--pink">
              <Sparkles
                size={
                  11
                }
                aria-hidden
                style={{
                  verticalAlign:
                    -1,
                  marginRight: 4,
                }}
              />
              {t(
                'desk.briefing',
                {
                  defaultValue:
                    'Briefing Room Summary',
                },
              )}
            </span>
          ) : (
            <span className="el-chip el-chip--ink">
              {t(
                'desk.briefingEyebrow',
                {
                  defaultValue:
                    'Briefing Room',
                },
              )}
            </span>
          )}
          {data?.generatedAt ? (
            <span>
              {timeAgo(
                data.generatedAt,
                now,
              )}
            </span>
          ) : null}
        </p>
        {data?.summary ? (
          <>
            <p
              className={cn(
                'el-desk__prose',
                summaryArrival,
              )}
              aria-live="polite"
            >
              {
                data.summary
              }
            </p>
            <p
              className={cn(
                'el-eyebrow',
                summaryArrival,
              )}
              style={{
                margin:
                  '12px 0 0',
              }}
            >
              {t(
                'desk.briefingNote',
                {
                  defaultValue:
                    'Generated automatically from the live numbers. Calls are projections, not certified results.',
                },
              )}
            </p>
          </>
        ) : null}

        {(data?.summary
          ? bullets.slice(
              1,
            )
          : bullets
        )
          .length >
        0 ? (
          <ul
            className="el-desk__list"
            style={{
              marginTop:
                data?.summary
                  ? 14
                  : 0,
            }}
          >
            {(data?.summary
              ? bullets.slice(
                  1,
                )
              : bullets
            ).map(
              (
                b,
              ) => (
                <li
                  key={
                    b
                  }
                >
                  {
                    b
                  }
                </li>
              ),
            )}
          </ul>
        ) : null}
      </div>

      <div
        className="el-box el-proj"
        style={{
          margin: 0,
        }}
      >
        <h3
          className="el-drawer__title"
          style={{
            fontSize: 28,
          }}
        >
          {t(
            'ask.briefingTitle',
            {
              defaultValue:
                'Ask the Briefing Room',
            },
          )}
        </h3>
        {session ? (
          <form
            onSubmit={
              ask
            }
            className="el-stack"
          >
            <label
              className="el-sr"
              htmlFor="el-ask"
            >
              {t(
                'ask.label',
                {
                  defaultValue:
                    'Your question about the results',
                },
              )}
            </label>
            <input
              id="el-ask"
              className="el-input"
              value={
                q
              }
              maxLength={
                300
              }
              onChange={(
                e,
              ) =>
                setQ(
                  e
                    .target
                    .value,
                )
              }
              placeholder={t(
                'ask.ph',
                {
                  defaultValue:
                    'Who’s ahead in Michigan?',
                },
              )}
            />
            <button
              type="submit"
              className="el-btn el-btn--pink"
              disabled={
                busy ||
                q.trim()
                  .length <
                  3
              }
            >
              <SendHorizontal
                size={
                  16
                }
                aria-hidden
              />
              {busy
                ? t(
                    'ask.thinking',
                    {
                      defaultValue:
                        'Thinking…',
                    },
                  )
                : t(
                    'ask.send',
                    {
                      defaultValue:
                        'Ask',
                    },
                  )}
            </button>
          </form>
        ) : (
          <p className="el-eyebrow">
            <Link
              to="/login"
              search={{
                callbackURL:
                  '/elections',
              }}
              style={{
                textDecoration:
                  'underline',
              }}
            >
              {t(
                'ask.signin',
                {
                  defaultValue:
                    'Sign in',
                },
              )}
            </Link>{' '}
            {t(
              'ask.signinRest',
              {
                defaultValue:
                  'to ask questions about any race.',
              },
            )}
          </p>
        )}
        {answer ? (
          <div
            style={{
              marginTop: 16,
            }}
            aria-live="polite"
          >
            <p className="el-eyebrow">
              {
                answer.q
              }
            </p>
            <p
              className="el-desk__prose"
              style={{
                marginTop: 6,
              }}
            >
              {
                answer.a
              }
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
