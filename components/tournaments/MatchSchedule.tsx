/**
 * Match times and deadlines on the tournament page (s07-06).
 *
 *  - `MatchSchedule`: one ready match's deadline and agreed time (`t-meta`), the
 *    players' "Propose a time" / "Accept" / "Propose another", and the host's
 *    "Set time" and "Award match" (overdue only). A settled match shows nothing.
 *  - `MatchDeadlineField` / `DeadlineSettings`: the host's "Each match must be
 *    played within" choice, in the create dialog and on the page.
 *  - `YourNextMatch`: one line above the bracket for an entrant.
 *
 * Rows on rules, no boxes; "Send" is the one ink primary. Times are entered in
 * the viewer's time zone (named beside the field), travel as UTC instants and
 * are shown in the viewer's zone. Nothing here ticks (R5).
 */
import {
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { cn } from '@/lib/utils';
import {
  acceptMatchTimeApi,
  awardMatchApi,
  proposeMatchTimeApi,
  scheduleSettingsApi,
  setMatchTimeApi,
} from '@/lib/tournaments/scheduling.contract';
import {
  isDeadlineHours,
  type DeadlineHours,
  isOverdue,
  isSchedulable,
  nextMatchFor,
  proposalProblem,
} from '@/lib/tournaments/scheduling';
import { AwardMatchDialog } from '@/components/tournaments/AwardMatchDialog';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

type Match =
  NonNullable<
    SerializedTournament['matches']
  >[number];
type Entrant =
  NonNullable<
    SerializedTournament['entrants']
  >[number];

function whenText(
  iso: string,
  locale: string,
): string {
  try {
    return new Intl.DateTimeFormat(
      locale,
      {
        dateStyle:
          'medium',
        timeStyle:
          'short',
      },
    ).format(
      new Date(
        iso,
      ),
    );
  } catch {
    return iso;
  }
}

const noSubscription =

    () =>
    () => {};
const readZone =
  ():
    | string
    | null => {
    try {
      return (
        Intl.DateTimeFormat().resolvedOptions()
          .timeZone ||
        null
      );
    } catch {
      return null;
    }
  };

/** The viewer's IANA zone; null on the server (the server's is not theirs), so hydration never mismatches. */
function useViewerZone():
  | string
  | null {
  return useSyncExternalStore(
    noSubscription,
    readZone,
    () =>
      null,
  );
}

/** The deadline as the pure rules read it. */
function ruleView(
  m: Match,
) {
  return {
    state:
      m.state,
    entrantAId:
      m.entrantAId,
    entrantBId:
      m.entrantBId,
    deadlineAt:
      m.deadlineAt
        ? new Date(
            m.deadlineAt,
          )
        : null,
    scheduledAt:
      m.scheduledAt
        ? new Date(
            m.scheduledAt,
          )
        : null,
    claimedAt:
      m.claimedAt
        ? new Date(
            m.claimedAt,
          )
        : null,
  };
}

interface Props {
  tournamentId: string;
  tournamentStatus: SerializedTournament['status'];
  match: Match;
  entrants: Entrant[];
  viewerId:
    | string
    | null;
  /** The host or an admin. */
  isManager: boolean;
  onChanged: () => Promise<void> | void;
}

export function MatchSchedule({
  tournamentId,
  tournamentStatus,
  match,
  entrants,
  viewerId,
  isManager,
  onChanged,
}: Props) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'match-scheduling',
    );
  const zone =
    useViewerZone();
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  const [
    composer,
    setComposer,
  ] =
    useState<
      | 'propose'
      | 'host'
      | null
    >(
      null,
    );
  const [
    local,
    setLocal,
  ] =
    useState(
      '',
    );

  if (
    tournamentStatus !==
      'LIVE' ||
    !isSchedulable(
      match,
    )
  )
    return null;

  const locale =
    i18n.language ||
    'en';
  const view =
    ruleView(
      match,
    );
  const now =
    new Date();
  const overdue =
    isOverdue(
      view,
      now,
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
  const mineId =
    [
      match.entrantAId,
      match.entrantBId,
    ].find(
      (
        id,
      ) =>
        !!viewerId &&
        entrantOf(
          id,
        )
          ?.user
          ?.id ===
          viewerId,
    ) ??
    null;
  const isPlayer =
    mineId !=
    null;
  const opponentId =
    mineId ===
    match.entrantAId
      ? match.entrantBId
      : match.entrantAId;
  const proposal =
    match.proposedAt &&
    match.proposedByUserId
      ? match
      : null;
  const proposerEntrant =
    proposal
      ? entrants.find(
          (
            e,
          ) =>
            e
              .user
              ?.id ===
            proposal.proposedByUserId,
        )
      : undefined;
  const proposalIsMine =
    !!proposal &&
    proposal.proposedByUserId ===
      viewerId;

  const parsed =
    local
      ? new Date(
          local,
        )
      : null;
  const localValid =
    parsed !=
      null &&
    !Number.isNaN(
      parsed.getTime(),
    );
  const problem =
    localValid
      ? proposalProblem(
          parsed,
          now,
          view.deadlineAt,
        )
      : null;

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
        setComposer(
          null,
        );
        setLocal(
          '',
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
        // The proposal may have been replaced meanwhile: show the current one.
        await onChanged();
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

  const send =
    () =>
      run(
        async () => {
          if (
            !parsed
          )
            return null;
          if (
            composer ===
            'host'
          ) {
            await api(
              setMatchTimeApi,
              {
                params,
                body: {
                  at: parsed.toISOString(),
                },
              },
            );
            return t(
              'time-set',
              {
                defaultValue:
                  'Time set',
              },
            );
          }
          await api(
            proposeMatchTimeApi,
            {
              params,
              body: {
                at: parsed.toISOString(),
              },
            },
          );
          return t(
            'proposal-sent',
            {
              defaultValue:
                'Proposal sent',
            },
          );
        },
      );

  const accept =
    () =>
      run(
        async () => {
          if (
            !match.proposedAt
          )
            return null;
          await api(
            acceptMatchTimeApi,
            {
              params,
              body: {
                proposedAt:
                  match.proposedAt,
              },
            },
          );
          return t(
            'time-agreed',
            {
              defaultValue:
                'Time agreed',
            },
          );
        },
      );

  const clear =
    () =>
      run(
        async () => {
          await api(
            setMatchTimeApi,
            {
              params,
              body: {
                at: null,
              },
            },
          );
          return t(
            'time-cleared',
            {
              defaultValue:
                'Time cleared',
            },
          );
        },
      );

  const award =
    async (
      winnerEntrantId: string,
    ) => {
      await run(
        async () => {
          const res =
            await api(
              awardMatchApi,
              {
                params,
                body: {
                  winnerEntrantId,
                },
              },
            );
          return res.tournamentComplete
            ? t(
                'awarded-complete',
                {
                  defaultValue:
                    'Match awarded. Tournament complete.',
                },
              )
            : t(
                'awarded',
                {
                  defaultValue:
                    'Match awarded',
                },
              );
        },
      );
    };

  const showAward =
    isManager &&
    overdue &&
    !match.claimedAt;
  const canPropose =
    isPlayer &&
    composer ===
      null;
  const nothingToShow =
    !match.deadlineAt &&
    !match.scheduledAt &&
    !proposal &&
    !isPlayer &&
    !isManager;
  if (
    nothingToShow
  )
    return null;

  return (
    <div className="flex flex-col gap-2 border-t border-site-border px-1 pt-2">
      {match.deadlineAt && (
        <p className="t-meta">
          {overdue ? (
            <>
              <span className="t-label">
                {t(
                  'overdue',
                  {
                    defaultValue:
                      'Overdue',
                  },
                )}
              </span>
              {
                ' · '
              }
            </>
          ) : null}
          {t(
            'play-by',
            {
              defaultValue:
                'Play by {{when}}',
              when: whenText(
                match.deadlineAt,
                locale,
              ),
            },
          )}
        </p>
      )}
      {match.scheduledAt && (
        <p className="t-meta">
          {t(
            'agreed-time',
            {
              defaultValue:
                'Agreed time: {{when}}',
              when: whenText(
                match.scheduledAt,
                locale,
              ),
            },
          )}
        </p>
      )}

      {proposal &&
        match.proposedAt && (
          <div className="flex flex-col gap-2">
            <p className="t-meta">
              {proposalIsMine
                ? t(
                    'proposal-yours',
                    {
                      defaultValue:
                        'You proposed {{when}}. Waiting for {{name}}.',
                      when: whenText(
                        match.proposedAt,
                        locale,
                      ),
                      name: nameOf(
                        opponentId,
                      ),
                    },
                  )
                : t(
                    'proposal-from',
                    {
                      defaultValue:
                        '{{name}} proposed {{when}}',
                      name: proposerEntrant
                        ? nameOf(
                            proposerEntrant.id,
                          )
                        : nameOf(
                            opponentId,
                          ),
                      when: whenText(
                        match.proposedAt,
                        locale,
                      ),
                    },
                  )}
            </p>
            {isPlayer &&
              !proposalIsMine &&
              composer ===
                null && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    variant="default"
                    loading={
                      busy
                    }
                    onClick={() =>
                      void accept()
                    }
                  >
                    {t(
                      'accept',
                      {
                        defaultValue:
                          'Accept',
                      },
                    )}
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      setComposer(
                        'propose',
                      )
                    }
                  >
                    {t(
                      'propose-another',
                      {
                        defaultValue:
                          'Propose another',
                      },
                    )}
                  </Button>
                </div>
              )}
            {isPlayer &&
              proposalIsMine &&
              composer ===
                null && (
                <div>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      setComposer(
                        'propose',
                      )
                    }
                  >
                    {t(
                      'propose-another',
                      {
                        defaultValue:
                          'Propose another',
                      },
                    )}
                  </Button>
                </div>
              )}
          </div>
        )}

      {composer !==
        null && (
        <div className="flex flex-col gap-2">
          <Label
            htmlFor={`match-time-${match.id}`}
          >
            {composer ===
            'host'
              ? t(
                  'set-time-label',
                  {
                    defaultValue:
                      'Match time',
                  },
                )
              : t(
                  'propose-label',
                  {
                    defaultValue:
                      'Proposed time',
                  },
                )}
          </Label>
          <Input
            id={`match-time-${match.id}`}
            type="datetime-local"
            value={
              local
            }
            onChange={(
              e,
            ) =>
              setLocal(
                e
                  .target
                  .value,
              )
            }
            aria-invalid={
              problem !=
                null ||
              undefined
            }
          />
          {zone && (
            <p
              className="t-meta"
              title={
                zone
              }
            >
              {t(
                'times-in-zone',
                {
                  defaultValue:
                    'Times in {{zone}}',
                  zone,
                },
              )}
            </p>
          )}
          {problem ===
            'PAST' && (
            <p className="t-meta">
              {t(
                'problem-past',
                {
                  defaultValue:
                    'Pick a time in the future.',
                },
              )}
            </p>
          )}
          {problem ===
            'AFTER_DEADLINE' && (
            <p className="t-meta">
              {t(
                'problem-after-deadline',
                {
                  defaultValue:
                    'Pick a time before the deadline.',
                },
              )}
            </p>
          )}
          {problem ===
            'TOO_FAR' && (
            <p className="t-meta">
              {t(
                'problem-too-far',
                {
                  defaultValue:
                    'Pick a time within the next year.',
                },
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant={
                composer ===
                'propose'
                  ? 'primary'
                  : 'default'
              }
              disabled={
                !localValid ||
                problem !=
                  null
              }
              loading={
                busy
              }
              onClick={() =>
                void send()
              }
            >
              {composer ===
              'host'
                ? t(
                    'save-time',
                    {
                      defaultValue:
                        'Save time',
                    },
                  )
                : t(
                    'send-proposal',
                    {
                      defaultValue:
                        'Send',
                    },
                  )}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setComposer(
                  null,
                );
                setLocal(
                  '',
                );
              }}
            >
              {t(
                'cancel',
                {
                  defaultValue:
                    'Cancel',
                },
              )}
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          'flex flex-wrap gap-2',
          composer !==
            null &&
            'hidden',
        )}
      >
        {canPropose &&
          !proposal && (
            <Button
              size="xs"
              variant="default"
              onClick={() =>
                setComposer(
                  'propose',
                )
              }
            >
              {t(
                'propose-time',
                {
                  defaultValue:
                    'Propose a time',
                },
              )}
            </Button>
          )}
        {isManager &&
          composer ===
            null && (
            <Button
              size="xs"
              variant="default"
              onClick={() =>
                setComposer(
                  'host',
                )
              }
            >
              {t(
                'set-time',
                {
                  defaultValue:
                    'Set time',
                },
              )}
            </Button>
          )}
        {isManager &&
          composer ===
            null &&
          match.scheduledAt && (
            <Button
              size="xs"
              variant="ghost"
              loading={
                busy
              }
              onClick={() =>
                void clear()
              }
            >
              {t(
                'clear-time',
                {
                  defaultValue:
                    'Clear time',
                },
              )}
            </Button>
          )}
        {showAward &&
          match.entrantAId &&
          match.entrantBId && (
            <AwardMatchDialog
              busy={
                busy
              }
              choices={[
                {
                  entrantId:
                    match.entrantAId,
                  name: nameOf(
                    match.entrantAId,
                  ),
                },
                {
                  entrantId:
                    match.entrantBId,
                  name: nameOf(
                    match.entrantBId,
                  ),
                },
              ]}
              onAward={
                award
              }
            />
          )}
      </div>
    </div>
  );
}

// ─── The deadline setting ───────────────────────────────────────────────────

interface FieldProps {
  id: string;
  /** '' (none) or the hours as a string. */
  value: string;
  disabled?: boolean;
  onChange: (
    value: string,
  ) => void;
  className?: string;
}

/** "Each match must be played within: None / 24 hours / ...", shared by the create dialog and the host's settings. */
export function MatchDeadlineField({
  id,
  value,
  disabled,
  onChange,
  className,
}: FieldProps) {
  const {
    t,
  } =
    useTranslation(
      'match-scheduling',
    );
  return (
    <div
      className={cn(
        'space-y-1.5',
        className,
      )}
    >
      <Label
        htmlFor={
          id
        }
      >
        {t(
          'deadline-label',
          {
            defaultValue:
              'Each match must be played within',
          },
        )}
      </Label>
      <Select
        id={
          id
        }
        value={
          value
        }
        disabled={
          disabled
        }
        onChange={(
          e,
        ) =>
          onChange(
            e
              .target
              .value,
          )
        }
      >
        <option value="">
          {t(
            'deadline-none',
            {
              defaultValue:
                'No deadline',
            },
          )}
        </option>
        <option value="24">
          {t(
            'deadline-24',
            {
              defaultValue:
                '24 hours',
            },
          )}
        </option>
        <option value="48">
          {t(
            'deadline-48',
            {
              defaultValue:
                '48 hours',
            },
          )}
        </option>
        <option value="72">
          {t(
            'deadline-72',
            {
              defaultValue:
                '72 hours',
            },
          )}
        </option>
        <option value="168">
          {t(
            'deadline-168',
            {
              defaultValue:
                '7 days',
            },
          )}
        </option>
      </Select>
    </div>
  );
}

/** The deadline hours a select value stands for; null for none or anything unlisted. */
export function deadlineChoice(
  value: string,
): DeadlineHours | null {
  const n =
    Number(
      value,
    );
  return value !==
    '' &&
    isDeadlineHours(
      n,
    )
    ? n
    : null;
}

/** The host's deadline setting on the tournament page, until the tournament completes. */
export function DeadlineSettings({
  tourney,
  canManage,
  onChanged,
}: {
  tourney: SerializedTournament;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const {
    t,
  } =
    useTranslation(
      'match-scheduling',
    );
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  if (
    !canManage ||
    (tourney.status !==
      'REGISTRATION' &&
      tourney.status !==
        'LIVE')
  )
    return null;

  const save =
    async (
      value: string,
    ) => {
      setBusy(
        true,
      );
      try {
        await api(
          scheduleSettingsApi,
          {
            params:
              {
                id: tourney.id,
              },
            body: {
              matchDeadlineHours:
                deadlineChoice(
                  value,
                ),
            },
          },
        );
        toast.success(
          t(
            'deadline-saved',
            {
              defaultValue:
                'Match deadline saved',
            },
          ),
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

  return (
    <section
      aria-labelledby="deadline-heading"
      className="space-y-2 border-b border-site-border pb-4"
    >
      <h2
        id="deadline-heading"
        className="t-heading"
      >
        {t(
          'deadline-heading',
          {
            defaultValue:
              'Match deadline',
          },
        )}
      </h2>
      <MatchDeadlineField
        id="match-deadline"
        value={
          tourney.matchDeadlineHours ==
          null
            ? ''
            : String(
                tourney.matchDeadlineHours,
              )
        }
        disabled={
          busy
        }
        onChange={(
          v,
        ) =>
          void save(
            v,
          )
        }
        className="max-w-xs"
      />
      <p className="t-meta">
        {t(
          'deadline-hint',
          {
            defaultValue:
              'A change applies to matches that become ready afterwards.',
          },
        )}
      </p>
    </section>
  );
}

// ─── Your next match ────────────────────────────────────────────────────────

/** One line above the bracket: the viewer's next open match and its time. */
export function YourNextMatch({
  tourney,
  viewerId,
}: {
  tourney: SerializedTournament;
  viewerId:
    | string
    | null;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'match-scheduling',
    );
  if (
    tourney.status !==
      'LIVE' ||
    !viewerId
  )
    return null;
  const mine =
    tourney.entrants?.find(
      (
        e,
      ) =>
        e
          .user
          ?.id ===
        viewerId,
    )
      ?.id ??
    null;
  const next =
    nextMatchFor(
      tourney.matches ??
        [],
      mine,
    );
  if (
    !next
  )
    return null;
  const nameOf =
    (
      id:
        | string
        | null,
    ) =>
      tourney.entrants?.find(
        (
          e,
        ) =>
          e.id ===
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
  const opponent =
    nameOf(
      next.entrantAId ===
        mine
        ? next.entrantBId
        : next.entrantAId,
    );
  const locale =
    i18n.language ||
    'en';
  return (
    <p className="t-body border-b border-site-border pb-3">
      <span className="t-label">
        {t(
          'next-match',
          {
            defaultValue:
              'Your next match',
          },
        )}
      </span>
      {
        ' · '
      }
      {next.scheduledAt
        ? t(
            'next-match-at',
            {
              defaultValue:
                'vs {{name}}, {{when}}',
              name: opponent,
              when: whenText(
                next.scheduledAt,
                locale,
              ),
            },
          )
        : next.deadlineAt
          ? t(
              'next-match-by',
              {
                defaultValue:
                  'vs {{name}}, play by {{when}}',
                name: opponent,
                when: whenText(
                  next.deadlineAt,
                  locale,
                ),
              },
            )
          : t(
              'next-match-open',
              {
                defaultValue:
                  'vs {{name}}',
                name: opponent,
              },
            )}
    </p>
  );
}
