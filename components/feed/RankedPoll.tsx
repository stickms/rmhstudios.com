import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RankedBallot } from '@/components/feed/RankedBallot';
import { RankedResult } from '@/components/feed/RankedResult';
import { Button } from '@/components/ui/button';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import type { FeedPoll } from '@/lib/feed-types';

/** A poll further than this from its end names the date ("Ends on 4 Dec"); nearer, how long is left. */
const NEAR_END_MS =
  2 *
  86_400_000;

/**
 * A ranked-choice poll (sprint 06 #19). Open: the ballot, or the member's own ranking with "Change", above the first
 * preferences, which are all anyone sees until the poll ends. Ended: the winner and the rounds once counted.
 */
export function RankedPoll({
  poll,
  postId,
  closed,
  signedIn,
  onChange,
}: {
  poll: FeedPoll;
  postId: string;
  closed: boolean;
  signedIn: boolean;
  onChange: (
    next: FeedPoll,
  ) => void;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'ranked-polls',
    );
  const [
    changing,
    setChanging,
  ] =
    useState(
      false,
    );
  const mine =
    poll.myRanking ??
    [];
  const nameOf =
    (
      id: string,
    ) =>
      poll.options.find(
        (
          o,
        ) =>
          o.id ===
          id,
      )
        ?.text ??
      '';
  const showBallot =
    !closed &&
    signedIn &&
    (mine.length ===
      0 ||
      changing);

  return (
    <div className="mt-3 px-4 py-3">
      <p className="t-heading mb-2">
        {
          poll.question
        }
      </p>
      {closed && (
        <p className="t-label mb-2">
          {t(
            'final-result',
            {
              defaultValue:
                'Final result',
            },
          )}
        </p>
      )}

      {closed &&
        poll.result && (
          <RankedResult
            poll={
              poll
            }
          />
        )}

      {showBallot && (
        <RankedBallot
          poll={
            poll
          }
          postId={
            postId
          }
          onSubmitted={(
            next,
          ) => {
            setChanging(
              false,
            );
            onChange(
              next,
            );
          }}
          onCancel={
            mine.length >
            0
              ? () =>
                  setChanging(
                    false,
                  )
              : undefined
          }
        />
      )}

      {!closed &&
        mine.length >
          0 &&
        !changing && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="t-body">
              {t(
                'your-ranking',
                {
                  ranking:
                    mine
                      .map(
                        (
                          id,
                          i,
                        ) =>
                          `${i + 1} ${nameOf(id)}`,
                      )
                      .join(
                        ', ',
                      ),
                  defaultValue:
                    'Your ranking: {{ranking}}',
                },
              )}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setChanging(
                  true,
                )
              }
            >
              {t(
                'change',
                {
                  defaultValue:
                    'Change',
                },
              )}
            </Button>
          </div>
        )}

      {!(
        closed &&
        poll.result
      ) &&
        !showBallot && (
          <ul>
            {poll.options.map(
              (
                o,
              ) => {
                const pct =
                  poll.totalVotes >
                  0
                    ? Math.round(
                        (o.voteCount /
                          poll.totalVotes) *
                          100,
                      )
                    : 0;
                return (
                  <li
                    key={
                      o.id
                    }
                    className="flex items-center justify-between gap-3 border-b border-site-border py-2 last:border-b-0"
                  >
                    <span className="t-body min-w-0 break-words">
                      {
                        o.text
                      }
                    </span>
                    <span className="t-meta shrink-0">
                      {
                        pct
                      }
                      %
                    </span>
                  </li>
                );
              },
            )}
          </ul>
        )}

      {!closed && (
        <p className="t-meta mt-2">
          {t(
            'first-preferences-note',
            {
              defaultValue:
                'First preferences so far. The final result is counted when the poll ends.',
            },
          )}
        </p>
      )}
      {closed &&
        !poll.result && (
          <p className="t-meta mt-2">
            {t(
              'counting',
              {
                defaultValue:
                  'The final result is being counted.',
              },
            )}
          </p>
        )}

      <p className="t-meta mt-2">
        {t(
          'ballot-count',
          {
            count:
              poll.totalVotes,
            defaultValue_one:
              '{{count}} ballot',
            defaultValue_other:
              '{{count}} ballots',
            defaultValue:
              '{{count}} ballots',
          },
        )}
        {poll.closesAt && (
          <>
            {' '}
            ·{' '}
            <RelativeTime
              date={
                poll.closesAt
              }
              format={(
                at,
                now,
              ) =>
                closed
                  ? t(
                      'ended-relative',
                      {
                        ns: 'poll-lifecycle',
                        when: formatRelativeTime(
                          at,
                          i18n.language,
                          now,
                        ),
                        defaultValue:
                          'Ended {{when}}',
                      },
                    )
                  : at -
                        now >
                      NEAR_END_MS
                    ? t(
                        'ends-on',
                        {
                          ns: 'poll-lifecycle',
                          date: dayLabel(
                            at,
                            i18n.language,
                          ),
                          defaultValue:
                            'Ends on {{date}}',
                        },
                      )
                    : t(
                        'ends-relative',
                        {
                          ns: 'poll-lifecycle',
                          when: formatRelativeTime(
                            at,
                            i18n.language,
                            now,
                          ),
                          defaultValue:
                            'Ends {{when}}',
                        },
                      )
              }
              fallback={(
                at,
              ) =>
                closed
                  ? t(
                      'ended-on',
                      {
                        ns: 'poll-lifecycle',
                        date: dayLabel(
                          at,
                          i18n.language,
                        ),
                        defaultValue:
                          'Ended on {{date}}',
                      },
                    )
                  : t(
                      'ends-on',
                      {
                        ns: 'poll-lifecycle',
                        date: dayLabel(
                          at,
                          i18n.language,
                        ),
                        defaultValue:
                          'Ends on {{date}}',
                      },
                    )
              }
            />
          </>
        )}
      </p>
    </div>
  );
}

/** "4 Dec", in the viewer's language. */
function dayLabel(
  ms: number,
  locale: string,
): string {
  return new Intl.DateTimeFormat(
    locale ||
      'en',
    {
      month:
        'short',
      day: 'numeric',
    },
  ).format(
    new Date(
      ms,
    ),
  );
}
