import { useTranslation } from 'react-i18next';
import type { FeedPoll } from '@/lib/feed-types';

/**
 * The result of an ended ranked poll (sprint 06 #19): the winner, then each round of the count as a row on a rule,
 * then the ballots that no longer counted. When the author hides counts the rounds carry shares only.
 */
export function RankedResult({
  poll,
}: {
  poll: FeedPoll;
}) {
  const {
    t,
  } =
    useTranslation(
      'ranked-polls',
    );
  const result =
    poll.result;
  const nameOf =
    (
      id:
        | string
        | null,
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
  if (
    !result
  )
    return null;

  if (
    result.winnerOptionId ===
    null
  ) {
    return (
      <p className="t-body text-site-text-muted">
        {t(
          'no-winner',
          {
            defaultValue:
              'Nobody ranked an option, so there is no winner.',
          },
        )}
      </p>
    );
  }

  const suffix =
    result.percentOnly
      ? '%'
      : '';
  const lastRound =
    result
      .rounds
      .length;
  return (
    <div>
      <p className="t-heading">
        {t(
          'winner-is',
          {
            name: nameOf(
              result.winnerOptionId,
            ),
            defaultValue:
              'Winner: {{name}}',
          },
        )}
      </p>
      <ol className="mt-2">
        {result.rounds.map(
          (
            round,
            i,
          ) => {
            const n =
              i +
              1;
            const tally =
              Object.entries(
                round.tally,
              ).sort(
                (
                  a,
                  b,
                ) =>
                  b[1] -
                  a[1],
              );
            return (
              <li
                key={
                  n
                }
                className="border-b border-site-border py-2"
              >
                <p className="t-body">
                  {round.eliminatedOptionId
                    ? t(
                        'round-eliminated',
                        {
                          round:
                            n,
                          name: nameOf(
                            round.eliminatedOptionId,
                          ),
                          defaultValue:
                            'Round {{round}}: {{name}} eliminated',
                        },
                      )
                    : t(
                        'round-decided',
                        {
                          round:
                            n,
                          name: nameOf(
                            result.winnerOptionId,
                          ),
                          defaultValue:
                            'Round {{round}}: {{name}} wins',
                        },
                      )}
                </p>
                <p className="t-meta">
                  {tally.map(
                    (
                      [
                        id,
                        count,
                      ],
                      j,
                    ) => (
                      <span
                        key={
                          id
                        }
                      >
                        {j >
                          0 &&
                          ' · '}
                        {nameOf(
                          id,
                        )}{' '}
                        {
                          count
                        }
                        {
                          suffix
                        }
                      </span>
                    ),
                  )}
                </p>
                {n ===
                  lastRound &&
                  result.exhausted !==
                    null &&
                  result.exhausted >
                    0 && (
                    <p className="t-meta mt-1">
                      {t(
                        'exhausted',
                        {
                          count:
                            result.exhausted,
                          defaultValue_one:
                            '{{count}} ballot no longer counted',
                          defaultValue_other:
                            '{{count}} ballots no longer counted',
                          defaultValue:
                            '{{count}} ballots no longer counted',
                        },
                      )}
                    </p>
                  )}
              </li>
            );
          },
        )}
      </ol>
    </div>
  );
}
