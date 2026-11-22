/**
 * What a match row says and offers about its result (s06-20): a participant
 * reports (which becomes a claim), the opponent confirms or disputes, the
 * claimant can withdraw, and a settled match records how it was settled. The
 * host's own report buttons stay in `BracketView`.
 *
 * Rows on rules, no boxes: one line of text and, when there is something to do,
 * buttons. "Confirm" is the one ink primary. The time left is worked out when
 * this renders and never ticks (R5).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { reportTournamentMatchApi } from '@/lib/tournaments/tournaments.contract';
import {
  confirmMatchResultApi,
  disputeMatchResultApi,
  withdrawMatchClaimApi,
} from '@/lib/tournaments/match-results.contract';
import {
  DISPUTE_NOTE_MAX,
  claimMinutesLeft,
  sourceKind,
} from '@/lib/tournaments/match-results';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

type Match =
  NonNullable<
    SerializedTournament['matches']
  >[number];
type Entrant =
  NonNullable<
    SerializedTournament['entrants']
  >[number];

interface Props {
  tournamentId: string;
  match: Match;
  entrants: Entrant[];
  viewerId:
    | string
    | null;
  /** The host or an admin: they see the claim line but decide through the Disputes panel and report buttons. */
  isManager: boolean;
  onChanged: () => Promise<void> | void;
}

/** The claim line's time clause; shared with the host's panel. */
export function useClaimWhen() {
  const {
    t,
  } =
    useTranslation(
      'match-results',
    );
  return (
    claimedAt: string,
  ): string => {
    const left =
      claimMinutesLeft(
        new Date(
          claimedAt,
        ),
        new Date(),
      );
    return left >
      0
      ? t(
          'about-minutes',
          {
            count:
              left,
            defaultValue_one:
              'about {{count}} minute',
            defaultValue_other:
              'about {{count}} minutes',
          },
        )
      : t(
          'waiting-for-confirmation',
          {
            defaultValue:
              'waiting for confirmation',
          },
        );
  };
}

export function MatchResultControls({
  tournamentId,
  match,
  entrants,
  viewerId,
  isManager,
  onChanged,
}: Props) {
  const {
    t,
  } =
    useTranslation(
      'match-results',
    );
  const prompt =
    usePrompt();
  const claimWhen =
    useClaimWhen();
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );

  const entrantOf =
    (
      id:
        | string
        | null,
    ) =>
      entrants.find(
        (
          e,
        ) =>
          e.id ===
          id,
      );
  const nameOf =
    (
      id:
        | string
        | null,
    ) =>
      entrantOf(
        id,
      )
        ?.user
        ?.name ??
      t(
        'someone',
        {
          defaultValue:
            'Someone',
        },
      );
  const mine =
    [
      match.entrantAId,
      match.entrantBId,
    ].find(
      (
        id,
      ) =>
        entrantOf(
          id,
        )
          ?.user
          ?.id ===
        viewerId,
    ) ??
    null;
  const isPlayer =
    !!viewerId &&
    mine !=
      null;
  const open =
    (match.state ===
      'READY' ||
      match.state ===
        'LIVE') &&
    !!match.entrantAId &&
    !!match.entrantBId;
  const opponentId =
    mine ===
    match.entrantAId
      ? match.entrantBId
      : match.entrantAId;

  const run =
    async (
      work: () => Promise<
        | string
        | null
      >,
    ) => {
      setBusy(
        true,
      );
      try {
        const message =
          await work();
        if (
          message
        )
          toast.success(
            message,
          );
        await onChanged();
      } catch (e) {
        toast.error(
          serverError(
            e,
          ) ??
            t(
              'failed',
              {
                defaultValue:
                  'Something went wrong',
              },
            ),
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  const params =
    {
      id: tournamentId,
      matchId:
        match.id,
    };

  if (
    match.state ===
    'COMPLETE'
  ) {
    const kind =
      sourceKind(
        match.resultSource,
      );
    if (
      !kind
    )
      return null;
    return (
      <p className="t-meta px-1">
        {kind ===
        'agreement'
          ? t(
              'source-agreement',
              {
                defaultValue:
                  'Settled by agreement',
              },
            )
          : kind ===
              'admin'
            ? t(
                'source-host',
                {
                  defaultValue:
                    'Settled by the host',
                },
              )
            : kind ===
                'authoritative'
              ? t(
                  'source-game',
                  {
                    defaultValue:
                      'Settled by the game',
                  },
                )
              : kind === 'walkover'
                ? t('source-walkover', {
                    ns: 'match-scheduling',
                    defaultValue: 'Awarded by the host: not played in time',
                  })
                : t(
                  'source-unanswered',
                  {
                    defaultValue:
                      'Settled: not answered in time',
                  },
                )}
      </p>
    );
  }
  if (
    !open
  )
    return null;

  if (
    match.disputed
  ) {
    return (
      <div className="flex flex-col gap-1 px-1">
        <p className="t-label">
          {t(
            'disputed',
            {
              defaultValue:
                'Disputed',
            },
          )}
        </p>
        {(isPlayer ||
          isManager) && (
          <p className="t-meta">
            {t(
              'waiting-for-host',
              {
                defaultValue:
                  'Waiting for the host to decide',
              },
            )}
          </p>
        )}
      </div>
    );
  }

  if (
    match.claimedAt &&
    match.claimedWinnerId
  ) {
    const claimantIsMe =
      !!viewerId &&
      match.claimedByUserId ===
        viewerId;
    const claimantEntrant =
      match.claimedByUserId
        ? (entrants.find(
            (
              e,
            ) =>
              e
                .user
                ?.id ===
              match.claimedByUserId,
          )
            ?.id ??
          null)
        : null;
    const waitingFor =
      claimantEntrant
        ? claimantEntrant ===
          match.entrantAId
          ? match.entrantBId
          : match.entrantAId
        : opponentId;
    const line =
      t(
        'claim-line',
        {
          defaultValue:
            '{{reporter}} reported {{winner}} won · waiting for {{opponent}} ({{when}})',
          reporter:
            claimantEntrant
              ? nameOf(
                  claimantEntrant,
                )
              : t(
                  'someone',
                  {
                    defaultValue:
                      'Someone',
                  },
                ),
          winner:
            nameOf(
              match.claimedWinnerId,
            ),
          opponent:
            nameOf(
              waitingFor,
            ),
          when: claimWhen(
            match.claimedAt,
          ),
        },
      );
    const canAnswer =
      isPlayer &&
      !claimantIsMe;
    return (
      <div className="flex flex-col gap-2 px-1">
        <p className="t-meta">
          {
            line
          }
        </p>
        {canAnswer && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="primary"
              loading={
                busy
              }
              onClick={() =>
                run(
                  async () => {
                    const res =
                      await api(
                        confirmMatchResultApi,
                        {
                          params,
                        },
                      );
                    return res.tournamentComplete
                      ? t(
                          'tournament-complete',
                          {
                            defaultValue:
                              'Result confirmed. Tournament complete.',
                          },
                        )
                      : t(
                          'confirmed',
                          {
                            defaultValue:
                              'Result confirmed',
                          },
                        );
                  },
                )
              }
            >
              {t(
                'confirm',
                {
                  defaultValue:
                    'Confirm',
                },
              )}
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={
                busy
              }
              onClick={async () => {
                const note =
                  await prompt(
                    {
                      title:
                        t(
                          'dispute-title',
                          {
                            defaultValue:
                              'Dispute this result',
                          },
                        ),
                      label:
                        t(
                          'dispute-note',
                          {
                            defaultValue:
                              'What went wrong? (optional)',
                          },
                        ),
                      confirmLabel:
                        t(
                          'dispute-submit',
                          {
                            defaultValue:
                              'Dispute',
                          },
                        ),
                      validate:
                        (
                          v,
                        ) =>
                          v.length >
                          DISPUTE_NOTE_MAX
                            ? t(
                                'dispute-too-long',
                                {
                                  defaultValue:
                                    'Keep it to {{max}} characters.',
                                  max: DISPUTE_NOTE_MAX,
                                },
                              )
                            : null,
                    },
                  );
                if (
                  note ===
                  null
                )
                  return;
                await run(
                  async () => {
                    await api(
                      disputeMatchResultApi,
                      {
                        params,
                        body: {
                          note:
                            note.trim() ||
                            undefined,
                        },
                      },
                    );
                    return t(
                      'disputed-toast',
                      {
                        defaultValue:
                          'Disputed. The host will decide.',
                      },
                    );
                  },
                );
              }}
            >
              {t(
                'dispute',
                {
                  defaultValue:
                    'Dispute…',
                },
              )}
            </Button>
          </div>
        )}
        {claimantIsMe && (
          <div>
            <Button
              size="xs"
              variant="default"
              loading={
                busy
              }
              onClick={() =>
                run(
                  async () => {
                    await api(
                      withdrawMatchClaimApi,
                      {
                        params,
                      },
                    );
                    return t(
                      'withdrawn',
                      {
                        defaultValue:
                          'Report withdrawn',
                      },
                    );
                  },
                )
              }
            >
              {t(
                'withdraw',
                {
                  defaultValue:
                    'Withdraw',
                },
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Open, no claim: a player reports; the report becomes a claim for the opponent to answer.
  if (
    isPlayer &&
    !isManager
  ) {
    return (
      <div className="flex flex-col gap-2 px-1">
        <p className="t-label">
          {t(
            'report-result',
            {
              defaultValue:
                'Report result',
            },
          )}
        </p>
        <div className="flex gap-2">
          {[
            match.entrantAId,
            match.entrantBId,
          ].map(
            (
              id,
            ) => (
              <Button
                key={
                  id
                }
                size="xs"
                variant="default"
                className="flex-1"
                loading={
                  busy
                }
                onClick={() =>
                  run(
                    async () => {
                      const res =
                        await api(
                          reportTournamentMatchApi,
                          {
                            params,
                            body: {
                              winnerEntrantId:
                                id!,
                            },
                          },
                        );
                      return res.claim ===
                        'confirmed'
                        ? t(
                            'confirmed',
                            {
                              defaultValue:
                                'Result confirmed',
                            },
                          )
                        : res.claim ===
                            'disputed'
                          ? t(
                              'disputed-toast',
                              {
                                defaultValue:
                                  'Disputed. The host will decide.',
                              },
                            )
                          : t(
                              'reported',
                              {
                                defaultValue:
                                  'Reported. Your opponent will confirm or dispute.',
                              },
                            );
                    },
                  )
                }
              >
                {t(
                  'won',
                  {
                    defaultValue:
                      '{{name}} won',
                    name: nameOf(
                      id,
                    ),
                  },
                )}
              </Button>
            ),
          )}
        </div>
      </div>
    );
  }
  return null;
}
