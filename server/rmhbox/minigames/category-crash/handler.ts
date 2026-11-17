/**
 * RMHbox — Category Crash Minigame Server Handler
 *
 * Players are given a random letter and 5 categories each round.
 * They must provide an answer starting with the round letter for each
 * category within the time limit. After answers lock, a peer-review
 * phase lets players "crash" answers they believe are invalid. Crashes
 * that reach threshold are upheld; failed crashes penalise the crasher.
 *
 * Scoring rewards unique answers (no other player submitted the same)
 * with CC_UNIQUE_POINTS and shared answers (another player submitted the
 * same answer, or a typo/plural of it) with CC_SHARED_POINTS (design spec
 * §3.3.5). Invalid, empty, and crashed answers score zero.
 *
 * Peer review walks the categories one at a time; each gets a
 * `peerReviewDuration` timer and advances on its own, and the host's
 * ADVANCE_VOTING skips ahead early.
 *
 * Phases per round:
 *   REVEAL → INPUT → PEER_REVIEW → CRASH_RESOLUTION → ROUND_RESULTS
 *     → (next round or endGame)
 *
 * Join-in-progress policy: join_next_subround — players who join
 * during round 1 spectate and are promoted at the start of round 2.
 *
 * Reference: docs/rmhbox/design-spec/minigames/category-crash.md
 */

import { BaseMinigame } from '../base-minigame';
import type {
  MinigameContext,
  MinigameResults,
} from '../base-minigame';
import type {
  PlayerRanking,
  Award,
} from '@/lib/rmhbox/types';
import {
  selectRoundLetter,
  selectRoundCategories,
} from '@/lib/rmhbox/category-crash/data-loader';
import {
  SaveAnswersSchema,
  SubmitAnswersSchema,
  CrashAnswerSchema,
  UncrashAnswerSchema,
  VoteAnswerSchema,
  CC_MAX_CATEGORIES_PER_ROUND,
} from '@/lib/rmhbox/category-crash/schemas';
import {
  answersMatch,
  groupMatchingAnswers,
  normalizeAnswer,
} from '../../../../lib/rmhbox/category-crash/answer-match';
import {
  CC_TOTAL_ROUNDS,
  CC_CATEGORIES_PER_ROUND,
  CC_INPUT_DURATION,
  CC_CRASH_RESOLUTION,
  CC_ROUND_RESULTS,
  CC_REVEAL,
  CC_UNIQUE_POINTS,
  CC_SHARED_POINTS,
  CC_CRASH_BONUS,
  CC_CRASH_PENALTY,
  CC_PEER_REVIEW_DURATION,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import {
  CategoryCrashPhase,
  type AnonymizedAnswerSet,
  type CrashRecord,
  type VoteRecord,
  type CCPlayerResult,
  type CCRoundResults,
  type CategoryCrashState,
} from './types';

/**
 * How long saves are still accepted after the input timer runs out, so an
 * answer typed in the last second (and its save in flight) is not lost.
 */
const CC_INPUT_GRACE_MS = 1500;

// ─── Category Crash Minigame ─────────────────────────────────────

export class CategoryCrashMinigame extends BaseMinigame {
  private state!: CategoryCrashState;
  private startedAt: number = 0;
  /** The one pending phase-advance timeout; every transition replaces it. */
  private phaseTimeoutHandle: NodeJS.Timeout | null =
    null;
  /** Host setting `categoriesPerRound` (registry 3-7). */
  private categoriesPerRound: number =
    CC_CATEGORIES_PER_ROUND;
  /** Host setting `peerReviewDuration` (registry 15-60 s), per category. */
  private peerReviewDuration: number =
    CC_PEER_REVIEW_DURATION;

  get spectatorMode(): 'competitive-individual' {
    return 'competitive-individual';
  }

  constructor(
    context: MinigameContext,
  ) {
    super(
      context,
    );
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt =
      Date.now();
    this.categoriesPerRound =
      Math.max(
        1,
        Math.min(
          CC_MAX_CATEGORIES_PER_ROUND,
          this.getSetting(
            'categoriesPerRound',
            CC_CATEGORIES_PER_ROUND,
          ),
        ),
      );
    this.peerReviewDuration =
      Math.max(
        1,
        this.getSetting(
          'peerReviewDuration',
          CC_PEER_REVIEW_DURATION,
        ),
      );
    this.initializeState();

    logger.info(
      {
        event:
          'category_crash:start',
        lobbyId:
          this
            .context
            .lobbyId,
        totalRounds:
          this.getSetting(
            'totalRounds',
            CC_TOTAL_ROUNDS,
          ),
        playerCount:
          this
            .context
            .players
            .size,
      },
    );

    this.startRound();
  }

  private initializeState(): void {
    const scores: Record<
      string,
      number
    > =
      {};
    for (const userId of this.context.players.keys()) {
      scores[
        userId
      ] =
        0;
    }

    this.state =
      {
        phase:
          CategoryCrashPhase.REVEAL,
        currentRound: 0,
        totalRounds:
          this.getSetting(
            'totalRounds',
            CC_TOTAL_ROUNDS,
          ),
        letter:
          '',
        categories:
          [],
        answers:
          {},
        locked:
          {},
        crashes:
          [],
        votes:
          [],
        currentVotingCategoryIndex: 0,
        anonymizationMap:
          {},
        reverseAnonymizationMap:
          {},
        scores,
        usedCategoryIds:
          [],
        usedLetters:
          [],
        roundResults:
          [],
        actionLog:
          [],
        pendingPlayers:
          new Set(),
        crashCounts:
          {},
        timeRemaining: 0,
      };
  }

  // ─── Round Flow ─────────────────────────────────────────────

  /**
   * Schedule the single pending phase advance, replacing any earlier one. It
   * only runs if the game is still in the round and phase it was scheduled in.
   */
  private schedulePhaseAdvance(
    fn: () => void,
    ms: number,
  ): void {
    this.cancelPhaseAdvance();
    const round =
      this
        .state
        .currentRound;
    const phase =
      this
        .state
        .phase;
    const votingIndex =
      this
        .state
        .currentVotingCategoryIndex;
    this.phaseTimeoutHandle =
      this.setTimeout(
        () => {
          this.phaseTimeoutHandle =
            null;
          if (
            !this
              .isRunning ||
            this
              .state
              .currentRound !==
              round ||
            this
              .state
              .phase !==
              phase
          )
            return;
          if (
            phase ===
              CategoryCrashPhase.PEER_REVIEW &&
            this
              .state
              .currentVotingCategoryIndex !==
              votingIndex
          )
            return;
          fn();
        },
        ms,
      );
  }

  private cancelPhaseAdvance(): void {
    if (
      this
        .phaseTimeoutHandle
    ) {
      this.clearTrackedTimeout(
        this
          .phaseTimeoutHandle,
      );
      this.phaseTimeoutHandle =
        null;
    }
  }

  private startRound(): void {
    if (
      !this
        .isRunning
    )
      return;
    if (
      this
        .state
        .currentRound >
        0 &&
      this
        .state
        .phase !==
        CategoryCrashPhase.ROUND_RESULTS
    )
      return;
    this.cancelPhaseAdvance();

    // Promote pending players
    for (const userId of this
      .state
      .pendingPlayers) {
      if (
        this.context.players.has(
          userId,
        )
      ) {
        this.state.scores[
          userId
        ] =
          this
            .state
            .scores[
            userId
          ] ??
          0;
      }
    }
    this.state.pendingPlayers.clear();

    this
      .state
      .currentRound++;
    this.state.letter =
      selectRoundLetter(
        this
          .state
          .usedLetters,
      );
    this.state.usedLetters.push(
      this
        .state
        .letter,
    );
    this.state.categories =
      selectRoundCategories(
        this
          .state
          .usedCategoryIds,
        this
          .categoriesPerRound,
      );
    this.state.usedCategoryIds.push(
      ...this.state.categories.map(
        (
          c,
        ) =>
          c.id,
      ),
    );

    // Reset per-round state
    this.state.answers =
      {};
    this.state.locked =
      {};
    this.state.crashes =
      [];
    this.state.votes =
      [];
    this.state.currentVotingCategoryIndex = 0;
    this.state.anonymizationMap =
      {};
    this.state.reverseAnonymizationMap =
      {};
    this.state.crashCounts =
      {};

    for (const userId of this.context.players.keys()) {
      if (
        this
          .state
          .scores[
          userId
        ] !==
        undefined
      ) {
        this.state.answers[
          userId
        ] =
          new Array(
            this
              .state
              .categories
              .length,
          ).fill(
            null,
          );
        this.state.locked[
          userId
        ] =
          false;
        this.state.crashCounts[
          userId
        ] =
          0;
      }
    }

    this.state.phase =
      CategoryCrashPhase.REVEAL;
    this.state.timeRemaining =
      CC_REVEAL;

    this.logAction(
      'round_start',
      {
        round:
          this
            .state
            .currentRound,
        letter:
          this
            .state
            .letter,
        categories:
          this.state.categories.map(
            (
              c,
            ) =>
              c.name ??
              c.id,
          ),
      },
    );

    logger.info(
      {
        event:
          'category_crash:round_start',
        lobbyId:
          this
            .context
            .lobbyId,
        round:
          this
            .state
            .currentRound,
        letter:
          this
            .state
            .letter,
        categories:
          this.state.categories.map(
            (
              c,
            ) =>
              c.id,
          ),
      },
    );

    // Broadcast sub-round to the footer counter
    this.broadcastRound(
      this
        .state
        .currentRound,
      this
        .state
        .totalRounds,
    );

    this.broadcastGameAction(
      {
        type: 'CC_ROUND_START',
        round:
          this
            .state
            .currentRound,
        totalRounds:
          this
            .state
            .totalRounds,
        letter:
          this
            .state
            .letter,
        categories:
          this
            .state
            .categories,
        duration:
          CC_REVEAL,
      },
    );

    // Show reveal countdown in the header timer
    this.startPhaseTimer(
      CC_REVEAL,
    );

    this.schedulePhaseAdvance(
      () =>
        this.startInputPhase(),
      CC_REVEAL *
        1000,
    );
  }

  private startInputPhase(): void {
    if (
      !this
        .isRunning
    )
      return;
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.REVEAL
    )
      return;

    this.state.phase =
      CategoryCrashPhase.INPUT;

    // Scale input duration by player count: 60s base, +15s per player beyond 2, max 180s
    const playerCount =
      this
        .context
        .players
        .size;
    const scaledInputDuration =
      Math.min(
        180,
        this.getSetting(
          'inputDuration',
          CC_INPUT_DURATION,
        ) +
          Math.max(
            0,
            playerCount -
              2,
          ) *
            15,
      );
    this.state.timeRemaining =
      scaledInputDuration;

    logger.info(
      {
        event:
          'category_crash:input_phase_start',
        lobbyId:
          this
            .context
            .lobbyId,
        round:
          this
            .state
            .currentRound,
        duration:
          scaledInputDuration,
      },
    );

    this.broadcastGameAction(
      {
        type: 'CC_INPUT_START',
        duration:
          scaledInputDuration,
        timeRemaining:
          scaledInputDuration,
      },
    );

    // Drive the header timer ring for the input phase
    this.startPhaseTimer(
      scaledInputDuration,
    );

    // When the clock runs out, saves already in flight still land during a
    // short grace (the phase stays INPUT), then answers lock.
    this.schedulePhaseAdvance(
      () => {
        this.clearPhaseTimer();
        this.schedulePhaseAdvance(
          () =>
            this.endInputPhase(),
          CC_INPUT_GRACE_MS,
        );
      },
      scaledInputDuration *
        1000,
    );
  }

  private endInputPhase(): void {
    if (
      !this
        .isRunning
    )
      return;
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.INPUT
    )
      return;
    this.cancelPhaseAdvance();
    this.clearPhaseTimer();

    // Auto-lock any unlocked answers and log them
    for (const userId of Object.keys(
      this
        .state
        .answers,
    )) {
      if (
        !this
          .state
          .locked[
          userId
        ]
      ) {
        this.state.locked[
          userId
        ] =
          true;

        this.logAction(
          'answers_locked',
          {
            round:
              this
                .state
                .currentRound,
            userId,
            answers:
              this.state.categories.map(
                (
                  cat,
                  i,
                ) => ({
                  category:
                    cat.name ??
                    cat.id,
                  answer:
                    (this
                      .state
                      .answers[
                      userId
                    ]?.[
                      i
                    ] as string) ??
                    '',
                }),
              ),
          },
        );
      }
    }

    logger.info(
      {
        event:
          'category_crash:input_phase_end',
        lobbyId:
          this
            .context
            .lobbyId,
        round:
          this
            .state
            .currentRound,
      },
    );

    this.startPeerReview();
  }

  private startPeerReview(): void {
    if (
      !this
        .isRunning
    )
      return;

    this.state.phase =
      CategoryCrashPhase.PEER_REVIEW;
    this.state.currentVotingCategoryIndex = 0;
    this.state.votes =
      [];

    // Build anonymization map
    this.buildAnonymizationMap();

    logger.info(
      {
        event:
          'category_crash:peer_review_start',
        lobbyId:
          this
            .context
            .lobbyId,
        round:
          this
            .state
            .currentRound,
      },
    );

    const anonymizedAnswers =
      this.getAnonymizedAnswers();

    this.broadcastGameAction(
      {
        type: 'CC_PEER_REVIEW_START',
        duration:
          this
            .peerReviewDuration,
        timeRemaining:
          this
            .peerReviewDuration,
        anonymizedAnswers,
        categories:
          this
            .state
            .categories,
        letter:
          this
            .state
            .letter,
        currentVotingCategoryIndex: 0,
      },
    );

    // Tell each player their own anonymous label so the UI can prevent self-voting
    for (const userId of Object.keys(
      this
        .state
        .answers,
    )) {
      const label =
        this
          .state
          .anonymizationMap[
          userId
        ];
      if (
        label
      ) {
        this.context.sendToPlayer(
          userId,
          'rmhbox:game:action',
          {
            type: 'CC_MY_ANONYMOUS_LABEL',
            myAnonymousLabel:
              label,
          },
        );
      }
    }

    // Each category is timed and advances on its own; the host's
    // ADVANCE_VOTING skips ahead early. (It used to be an infinite phase
    // only the host could end, so an AFK host stalled the game.)
    this.startReviewCategoryTimer();
  }

  /** Time the category currently under review; when it runs out, advance. */
  private startReviewCategoryTimer(): void {
    this.state.timeRemaining =
      this.peerReviewDuration;
    this.startPhaseTimer(
      this
        .peerReviewDuration,
    );
    const round =
      this
        .state
        .currentRound;
    const index =
      this
        .state
        .currentVotingCategoryIndex;
    this.schedulePhaseAdvance(
      () =>
        this.advanceVoting(
          round,
          index,
        ),
      this
        .peerReviewDuration *
        1000,
    );
  }

  /**
   * Move peer review past category `fromIndex` of round `round` — from the
   * timer or the host. A second call for the same category (the host's click
   * racing the timer, a double click) finds the index already moved and does
   * nothing, so a category is never skipped twice.
   */
  private advanceVoting(
    round: number,
    fromIndex: number,
  ): void {
    if (
      !this
        .isRunning
    )
      return;
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.PEER_REVIEW
    )
      return;
    if (
      this
        .state
        .currentRound !==
        round ||
      this
        .state
        .currentVotingCategoryIndex !==
        fromIndex
    )
      return;
    this.cancelPhaseAdvance();

    const nextIndex =
      fromIndex +
      1;
    if (
      nextIndex >=
      this
        .state
        .categories
        .length
    ) {
      // All categories voted on — skip directly to round results
      this.clearPhaseTimer();
      this.showRoundResults();
      return;
    }

    this.state.currentVotingCategoryIndex =
      nextIndex;

    logger.info(
      {
        event:
          'category_crash:advance_voting',
        lobbyId:
          this
            .context
            .lobbyId,
        newCategoryIndex:
          nextIndex,
        round:
          this
            .state
            .currentRound,
      },
    );

    this.broadcastGameAction(
      {
        type: 'CC_VOTING_CATEGORY_CHANGED',
        currentVotingCategoryIndex:
          nextIndex,
        duration:
          this
            .peerReviewDuration,
      },
    );
    this.startReviewCategoryTimer();
  }

  private startCrashResolution(): void {
    if (
      !this
        .isRunning
    )
      return;
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.PEER_REVIEW
    )
      return;
    this.cancelPhaseAdvance();
    this.clearPhaseTimer();

    this.state.phase =
      CategoryCrashPhase.CRASH_RESOLUTION;
    this.state.timeRemaining =
      CC_CRASH_RESOLUTION;

    logger.info(
      {
        event:
          'category_crash:crash_resolution_start',
        lobbyId:
          this
            .context
            .lobbyId,
        round:
          this
            .state
            .currentRound,
        totalCrashes:
          this
            .state
            .crashes
            .length,
      },
    );

    this.broadcastGameAction(
      {
        type: 'CC_CRASH_RESOLUTION_START',
        duration:
          CC_CRASH_RESOLUTION,
      },
    );

    // Show crash resolution countdown in the header timer
    this.startPhaseTimer(
      CC_CRASH_RESOLUTION,
    );

    this.schedulePhaseAdvance(
      () =>
        this.showRoundResults(),
      CC_CRASH_RESOLUTION *
        1000,
    );
  }

  private showRoundResults(): void {
    if (
      !this
        .isRunning
    )
      return;
    if (
      this
        .state
        .phase !==
        CategoryCrashPhase.PEER_REVIEW &&
      this
        .state
        .phase !==
        CategoryCrashPhase.CRASH_RESOLUTION
    )
      return;
    this.cancelPhaseAdvance();

    this.state.phase =
      CategoryCrashPhase.ROUND_RESULTS;
    this.state.timeRemaining =
      CC_ROUND_RESULTS;

    const roundResult =
      this.computeRoundResults();
    this.state.roundResults.push(
      roundResult,
    );

    // Update cumulative scores
    for (const [
      userId,
      pr,
    ] of Object.entries(
      roundResult.playerResults,
    )) {
      this.state.scores[
        userId
      ] =
        (this
          .state
          .scores[
          userId
        ] ??
          0) +
        pr.roundScore;
    }

    this.logAction(
      'round_end',
      {
        round:
          this
            .state
            .currentRound,
        letter:
          this
            .state
            .letter,
        scores:
          Object.entries(
            roundResult.playerResults,
          ).map(
            ([
              uid,
              pr,
            ]) => ({
              userId:
                uid,
              points:
                pr.roundScore,
              validAnswers:
                pr
                  .uniqueIndices
                  .length,
              crashedAnswers:
                pr
                  .crashedIndices
                  .length,
              duplicateAnswers:
                pr
                  .duplicateIndices
                  .length,
              duplicatedCategories:
                pr.duplicateIndices.map(
                  (
                    i,
                  ) =>
                    this
                      .state
                      .categories[
                      i
                    ]
                      ?.name ??
                    this
                      .state
                      .categories[
                      i
                    ]
                      ?.id ??
                    '',
                ),
              crashedCategories:
                pr.crashedIndices.map(
                  (
                    i,
                  ) =>
                    this
                      .state
                      .categories[
                      i
                    ]
                      ?.name ??
                    this
                      .state
                      .categories[
                      i
                    ]
                      ?.id ??
                    '',
                ),
              uniqueCategories:
                pr.uniqueIndices.map(
                  (
                    i,
                  ) =>
                    this
                      .state
                      .categories[
                      i
                    ]
                      ?.name ??
                    this
                      .state
                      .categories[
                      i
                    ]
                      ?.id ??
                    '',
                ),
            }),
          ),
      },
    );

    logger.info(
      {
        event:
          'category_crash:round_end',
        lobbyId:
          this
            .context
            .lobbyId,
        round:
          this
            .state
            .currentRound,
      },
    );

    this.broadcastGameAction(
      {
        type: 'CC_ROUND_RESULTS',
        round:
          this
            .state
            .currentRound,
        results:
          roundResult,
        scores:
          this
            .state
            .scores,
        duration:
          CC_ROUND_RESULTS,
        anonymizationMap:
          this
            .state
            .anonymizationMap,
      },
    );

    // Show round results countdown in the header timer
    this.startPhaseTimer(
      CC_ROUND_RESULTS,
    );

    this.schedulePhaseAdvance(
      () => {
        if (
          this
            .state
            .currentRound >=
          this
            .state
            .totalRounds
        ) {
          this.endGame();
        } else {
          this.startRound();
        }
      },
      CC_ROUND_RESULTS *
        1000,
    );
  }

  private endGame(): void {
    if (
      !this
        .isRunning
    )
      return;

    logger.info(
      {
        event:
          'category_crash:game_end',
        lobbyId:
          this
            .context
            .lobbyId,
        rounds:
          this
            .state
            .currentRound,
      },
    );

    this.cleanup();
    this.context.onComplete(
      this.computeResults(),
    );
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(
    userId: string,
    action: string,
    data: unknown,
  ): void {
    switch (
      action
    ) {
      case 'SAVE_ANSWERS':
        return this.handleSaveAnswers(
          userId,
          data,
        );
      case 'SUBMIT_ANSWERS':
        return this.handleSubmitAnswers(
          userId,
          data,
        );
      case 'CRASH_ANSWER':
        return this.handleCrashAnswer(
          userId,
          data,
        );
      case 'UNCRASH_ANSWER':
        return this.handleUncrashAnswer(
          userId,
          data,
        );
      case 'VOTE_ANSWER':
        return this.handleVoteAnswer(
          userId,
          data,
        );
      case 'ADVANCE_VOTING':
        return this.handleAdvanceVoting(
          userId,
          data,
        );
      default:
        return;
    }
  }

  /** Auto-save draft answers — notify submitter only. */
  private handleSaveAnswers(
    userId: string,
    data: unknown,
  ): void {
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.INPUT
    )
      return;
    if (
      this
        .state
        .locked[
        userId
      ]
    )
      return;
    if (
      !this
        .state
        .answers[
        userId
      ]
    )
      return;

    const parsed =
      SaveAnswersSchema.safeParse(
        data,
      );
    if (
      !parsed.success
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_SAVE_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    if (
      parsed
        .data
        .answers
        .length !==
      this
        .state
        .categories
        .length
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_SAVE_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    this.state.answers[
      userId
    ] =
      parsed.data.answers;

    this.context.sendToPlayer(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_ANSWERS_SAVED',
        answers:
          this
            .state
            .answers[
            userId
          ],
      },
    );

    // Mirror to spectators following this player
    this.context.sendToSpectatorFollowers(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_ANSWERS_SAVED',
        answers:
          this
            .state
            .answers[
            userId
          ],
      },
    );
  }

  /** Lock final answers — notify all players. */
  private handleSubmitAnswers(
    userId: string,
    data: unknown,
  ): void {
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.INPUT
    )
      return;
    if (
      this
        .state
        .locked[
        userId
      ]
    )
      return;
    if (
      !this
        .state
        .answers[
        userId
      ]
    )
      return;

    const parsed =
      SubmitAnswersSchema.safeParse(
        data,
      );
    if (
      !parsed.success
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_SUBMIT_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    if (
      parsed
        .data
        .answers
        .length !==
      this
        .state
        .categories
        .length
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_SUBMIT_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    this.state.answers[
      userId
    ] =
      parsed.data.answers;
    this.state.locked[
      userId
    ] =
      true;

    this.logAction(
      'answers_locked',
      {
        round:
          this
            .state
            .currentRound,
        userId,
        answers:
          this.state.categories.map(
            (
              cat,
              i,
            ) => ({
              category:
                cat.name ??
                cat.id,
              answer:
                (this
                  .state
                  .answers[
                  userId
                ]?.[
                  i
                ] as string) ??
                '',
            }),
          ),
      },
    );

    logger.info(
      {
        event:
          'category_crash:answers_locked',
        lobbyId:
          this
            .context
            .lobbyId,
        userId,
        round:
          this
            .state
            .currentRound,
      },
    );

    // Notify submitter
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_ANSWERS_SUBMITTED',
      },
    );

    // Mirror to spectators following this player
    this.context.sendToSpectatorFollowers(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_ANSWERS_SUBMITTED',
      },
    );

    // Notify all players about lock status
    const lockedCount =
      Object.values(
        this
          .state
          .locked,
      ).filter(
        Boolean,
      ).length;
    const totalPlayers =
      Object.keys(
        this
          .state
          .answers,
      ).length;

    this.broadcastGameAction(
      {
        type: 'CC_LOCK_STATUS',
        lockedCount,
        totalPlayers,
      },
    );
  }

  /** Crash another player's answer during PEER_REVIEW. */
  private handleCrashAnswer(
    userId: string,
    data: unknown,
  ): void {
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.PEER_REVIEW
    )
      return;

    const parsed =
      CrashAnswerSchema.safeParse(
        data,
      );
    if (
      !parsed.success
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    const {
      targetUserId,
      categoryIndex,
    } =
      parsed.data;
    if (
      categoryIndex >=
      this
        .state
        .categories
        .length
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    // Resolve anonymous label to real userId if needed
    const realTargetId =
      this
        .state
        .reverseAnonymizationMap[
        targetUserId
      ] ??
      targetUserId;

    // Cannot crash own answers
    if (
      realTargetId ===
      userId
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'cannot_crash_self',
        },
      );
      return;
    }

    // Target must be a participant
    if (
      !this
        .state
        .answers[
        realTargetId
      ]
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'invalid_target',
        },
      );
      return;
    }

    // No duplicate crash on same target+category
    const alreadyCrashed =
      this.state.crashes.some(
        (
          c,
        ) =>
          c.crasherId ===
            userId &&
          c.targetUserId ===
            realTargetId &&
          c.categoryIndex ===
            categoryIndex,
      );
    if (
      alreadyCrashed
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'duplicate_crash',
        },
      );
      return;
    }

    // Cannot crash a shared (duplicate) answer — it is scored as shared
    const targetAnswer =
      this
        .state
        .answers[
        realTargetId
      ]?.[
        categoryIndex
      ];
    if (
      targetAnswer
    ) {
      if (
        normalizeAnswer(
          targetAnswer,
        )
      ) {
        const isDuplicate =
          Object.entries(
            this
              .state
              .answers,
          ).some(
            ([
              otherId,
              answers,
            ]) =>
              otherId !==
                realTargetId &&
              answersMatch(
                answers[
                  categoryIndex
                ],
                targetAnswer,
              ),
          );
        if (
          isDuplicate
        ) {
          this.context.sendToPlayer(
            userId,
            'rmhbox:game:action',
            {
              type: 'CC_CRASH_REJECTED',
              reason:
                'answer_already_pre_crashed',
            },
          );
          return;
        }
      }
    }

    const crash: CrashRecord =
      {
        crasherId:
          userId,
        targetUserId:
          realTargetId,
        categoryIndex,
      };
    this.state.crashes.push(
      crash,
    );
    this.state.crashCounts[
      userId
    ] =
      (this
        .state
        .crashCounts[
        userId
      ] ??
        0) +
      1;

    this.logAction(
      'crash',
      {
        round:
          this
            .state
            .currentRound,
        crasherId:
          userId,
        targetUserId:
          realTargetId,
        categoryIndex,
        category:
          this
            .state
            .categories[
            categoryIndex
          ]
            ?.name ??
          this
            .state
            .categories[
            categoryIndex
          ]
            ?.id ??
          '',
        crashedAnswer:
          (this
            .state
            .answers[
            realTargetId
          ]?.[
            categoryIndex
          ] as string) ??
          '',
      },
    );

    logger.info(
      {
        event:
          'category_crash:crash_vote',
        lobbyId:
          this
            .context
            .lobbyId,
        crasherId:
          userId,
        targetUserId:
          realTargetId,
        categoryIndex,
        round:
          this
            .state
            .currentRound,
      },
    );

    this.context.sendToPlayer(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_CRASH_RECORDED',
        targetUserId,
        categoryIndex,
      },
    );

    // Mirror to spectators following this player
    this.context.sendToSpectatorFollowers(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_CRASH_RECORDED',
        targetUserId,
        categoryIndex,
      },
    );
  }

  /** Remove a crash vote during PEER_REVIEW. */
  private handleUncrashAnswer(
    userId: string,
    data: unknown,
  ): void {
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.PEER_REVIEW
    )
      return;

    const parsed =
      UncrashAnswerSchema.safeParse(
        data,
      );
    if (
      !parsed.success
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_UNCRASH_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    const {
      targetUserId,
      categoryIndex,
    } =
      parsed.data;
    const realTargetId =
      this
        .state
        .reverseAnonymizationMap[
        targetUserId
      ] ??
      targetUserId;

    const idx =
      this.state.crashes.findIndex(
        (
          c,
        ) =>
          c.crasherId ===
            userId &&
          c.targetUserId ===
            realTargetId &&
          c.categoryIndex ===
            categoryIndex,
      );

    if (
      idx ===
      -1
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_UNCRASH_REJECTED',
          reason:
            'crash_not_found',
        },
      );
      return;
    }

    this.state.crashes.splice(
      idx,
      1,
    );
    this.state.crashCounts[
      userId
    ] =
      Math.max(
        0,
        (this
          .state
          .crashCounts[
          userId
        ] ??
          0) -
          1,
      );

    logger.info(
      {
        event:
          'category_crash:uncrash',
        lobbyId:
          this
            .context
            .lobbyId,
        crasherId:
          userId,
        targetUserId:
          realTargetId,
        categoryIndex,
        round:
          this
            .state
            .currentRound,
      },
    );

    this.context.sendToPlayer(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_UNCRASH_RECORDED',
        targetUserId,
        categoryIndex,
      },
    );

    // Mirror to spectators following this player
    this.context.sendToSpectatorFollowers(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_UNCRASH_RECORDED',
        targetUserId,
        categoryIndex,
      },
    );
  }

  /** Vote crash or safe on another player's answer during PEER_REVIEW. */
  private handleVoteAnswer(
    userId: string,
    data: unknown,
  ): void {
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.PEER_REVIEW
    )
      return;

    const parsed =
      VoteAnswerSchema.safeParse(
        data,
      );
    if (
      !parsed.success
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'invalid_input',
        },
      );
      return;
    }

    const {
      targetUserId,
      categoryIndex,
      vote,
    } =
      parsed.data;

    // Must vote on the current category
    if (
      categoryIndex !==
      this
        .state
        .currentVotingCategoryIndex
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'wrong_category',
        },
      );
      return;
    }

    // Resolve anonymous label to real userId
    const realTargetId =
      this
        .state
        .reverseAnonymizationMap[
        targetUserId
      ] ??
      targetUserId;

    // Cannot vote on own answers
    if (
      realTargetId ===
      userId
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'cannot_vote_self',
        },
      );
      return;
    }

    // Target must be a participant
    if (
      !this
        .state
        .answers[
        realTargetId
      ]
    ) {
      this.context.sendToPlayer(
        userId,
        'rmhbox:game:action',
        {
          type: 'CC_CRASH_REJECTED',
          reason:
            'invalid_target',
        },
      );
      return;
    }

    // Remove any existing vote from this voter on the same target+category
    this.state.votes =
      this.state.votes.filter(
        (
          v,
        ) =>
          !(
            v.voterId ===
              userId &&
            v.targetUserId ===
              realTargetId &&
            v.categoryIndex ===
              categoryIndex
          ),
      );

    // Record the new vote
    const voteRecord: VoteRecord =
      {
        voterId:
          userId,
        targetUserId:
          realTargetId,
        categoryIndex,
        vote,
      };
    this.state.votes.push(
      voteRecord,
    );

    // Maintain legacy crashes array for state masking (myCrashes in getStateForPlayer)
    if (
      vote ===
      'crash'
    ) {
      const alreadyCrashed =
        this.state.crashes.some(
          (
            c,
          ) =>
            c.crasherId ===
              userId &&
            c.targetUserId ===
              realTargetId &&
            c.categoryIndex ===
              categoryIndex,
        );
      if (
        !alreadyCrashed
      ) {
        this.state.crashes.push(
          {
            crasherId:
              userId,
            targetUserId:
              realTargetId,
            categoryIndex,
          },
        );
      }
    } else {
      this.state.crashes =
        this.state.crashes.filter(
          (
            c,
          ) =>
            !(
              c.crasherId ===
                userId &&
              c.targetUserId ===
                realTargetId &&
              c.categoryIndex ===
                categoryIndex
            ),
        );
    }

    logger.info(
      {
        event:
          'category_crash:vote',
        lobbyId:
          this
            .context
            .lobbyId,
        voterId:
          userId,
        targetUserId:
          realTargetId,
        categoryIndex,
        vote,
        round:
          this
            .state
            .currentRound,
      },
    );

    // Confirm to the voter
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:action',
      {
        type: 'CC_VOTE_RECORDED',
        targetUserId,
        categoryIndex,
        vote,
      },
    );

    // Broadcast live vote tallies for this category to all players
    this.broadcastVoteTallies(
      categoryIndex,
    );
  }

  /**
   * Host skips the rest of the current category's review. The client may
   * name the category it was looking at; a stale click is then ignored.
   */
  private handleAdvanceVoting(
    userId: string,
    data?: unknown,
  ): void {
    if (
      this
        .state
        .phase !==
      CategoryCrashPhase.PEER_REVIEW
    )
      return;

    // Only the host can advance
    if (
      userId !==
      this.context.getHostId()
    )
      return;

    const requested =
      (
        data as
          | {
              categoryIndex?: unknown;
            }
          | null
          | undefined
      )
        ?.categoryIndex;
    const fromIndex =
      typeof requested ===
      'number'
        ? requested
        : this
            .state
            .currentVotingCategoryIndex;
    this.advanceVoting(
      this
        .state
        .currentRound,
      fromIndex,
    );
  }

  /** Broadcast live vote tallies for a specific category to all players. */
  private broadcastVoteTallies(
    categoryIndex: number,
  ): void {
    const tallies: Record<
      string,
      {
        crash: number;
        safe: number;
      }
    > =
      {};

    for (const answerSet of Object.keys(
      this
        .state
        .answers,
    )) {
      const anonLabel =
        this
          .state
          .anonymizationMap[
          answerSet
        ] ??
        answerSet;
      const crashCount =
        this.state.votes.filter(
          (
            v,
          ) =>
            v.targetUserId ===
              answerSet &&
            v.categoryIndex ===
              categoryIndex &&
            v.vote ===
              'crash',
        ).length;
      const safeCount =
        this.state.votes.filter(
          (
            v,
          ) =>
            v.targetUserId ===
              answerSet &&
            v.categoryIndex ===
              categoryIndex &&
            v.vote ===
              'safe',
        ).length;
      tallies[
        anonLabel
      ] =
        {
          crash:
            crashCount,
          safe: safeCount,
        };
    }

    this.broadcastGameAction(
      {
        type: 'CC_VOTE_TALLIES',
        categoryIndex,
        tallies,
      },
    );
  }

  // ─── Anonymization ──────────────────────────────────────────

  private buildAnonymizationMap(): void {
    const userIds =
      Object.keys(
        this
          .state
          .answers,
      );
    // Shuffle to randomize assignment
    const shuffled =
      [
        ...userIds,
      ];
    for (
      let i =
        shuffled.length -
        1;
      i >
      0;
      i--
    ) {
      const j =
        Math.floor(
          Math.random() *
            (i +
              1),
        );
      [
        shuffled[
          i
        ],
        shuffled[
          j
        ],
      ] =
        [
          shuffled[
            j
          ],
          shuffled[
            i
          ],
        ];
    }

    this.state.anonymizationMap =
      {};
    this.state.reverseAnonymizationMap =
      {};
    shuffled.forEach(
      (
        userId,
        idx,
      ) => {
        const label = `Player ${idx + 1}`;
        this.state.anonymizationMap[
          userId
        ] =
          label;
        this.state.reverseAnonymizationMap[
          label
        ] =
          userId;
      },
    );
  }

  private getAnonymizedAnswers(): AnonymizedAnswerSet[] {
    return Object.entries(
      this
        .state
        .answers,
    ).map(
      ([
        userId,
        answers,
      ]) => ({
        anonymousLabel:
          this
            .state
            .anonymizationMap[
            userId
          ] ??
          userId,
        answers:
          [
            ...answers,
          ],
      }),
    );
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeRoundResults(): CCRoundResults {
    const letter =
      this
        .state
        .letter;
    const categoryCount =
      this
        .state
        .categories
        .length;

    // Determine which answers are crashed using vote-based system:
    // An answer is crashed if crash votes > safe votes. Ties are safe.
    const crashedMap: Record<
      string,
      Set<number>
    > = {};
    for (const userId of Object.keys(
      this
        .state
        .answers,
    )) {
      crashedMap[
        userId
      ] =
        new Set();
    }

    for (
      let catIdx = 0;
      catIdx <
      categoryCount;
      catIdx++
    ) {
      for (const userId of Object.keys(
        this
          .state
          .answers,
      )) {
        const crashVotes =
          this.state.votes.filter(
            (
              v,
            ) =>
              v.targetUserId ===
                userId &&
              v.categoryIndex ===
                catIdx &&
              v.vote ===
                'crash',
          ).length;
        const safeVotes =
          this.state.votes.filter(
            (
              v,
            ) =>
              v.targetUserId ===
                userId &&
              v.categoryIndex ===
                catIdx &&
              v.vote ===
                'safe',
          ).length;
        // Crashed only if strictly more crash votes than safe votes
        if (
          crashVotes >
          safeVotes
        ) {
          crashedMap[
            userId
          ].add(
            catIdx,
          );
        }
      }
    }

    // Build normalised answer lists per category for duplicate detection
    const validAnswersPerCategory: {
      userId: string;
      answer: string;
      catIdx: number;
    }[][] =
      [];
    for (
      let catIdx = 0;
      catIdx <
      categoryCount;
      catIdx++
    ) {
      const entries: {
        userId: string;
        answer: string;
        catIdx: number;
      }[] =
        [];
      for (const [
        userId,
        answers,
      ] of Object.entries(
        this
          .state
          .answers,
      )) {
        const raw =
          answers[
            catIdx
          ];
        if (
          !raw
        )
          continue;
        const normalised =
          raw
            .trim()
            .toLowerCase();
        if (
          !normalised
        )
          continue;
        if (
          !normalised.startsWith(
            letter.toLowerCase(),
          )
        )
          continue;
        if (
          crashedMap[
            userId
          ].has(
            catIdx,
          )
        )
          continue;
        // Compared on the raw answer: findDuplicateGroups normalises whole strings itself
        entries.push(
          {
            userId,
            answer:
              normalised,
            catIdx,
          },
        );
      }
      validAnswersPerCategory.push(
        entries,
      );
    }

    // Detect exact + fuzzy duplicates per category
    const duplicateGroups: Map<
      number,
      Map<
        string,
        string[]
      >
    > = new Map();
    for (
      let catIdx = 0;
      catIdx <
      categoryCount;
      catIdx++
    ) {
      const entries =
        validAnswersPerCategory[
          catIdx
        ];
      const groups =
        this.findDuplicateGroups(
          entries.map(
            (
              e,
            ) => ({
              userId:
                e.userId,
              answer:
                e.answer,
            }),
          ),
        );
      duplicateGroups.set(
        catIdx,
        groups,
      );
    }

    // Score each player
    const playerResults: Record<
      string,
      CCPlayerResult
    > =
      {};

    for (const [
      userId,
      answers,
    ] of Object.entries(
      this
        .state
        .answers,
    )) {
      const player =
        this.context.players.get(
          userId,
        );
      const userName =
        player?.userName ??
        'Unknown';
      const pointsPerCategory: number[] =
        [];
      const crashedIndices: number[] =
        [];
      const duplicateIndices: number[] =
        [];
      const invalidIndices: number[] =
        [];
      const uniqueIndices: number[] =
        [];
      let roundScore = 0;

      for (
        let catIdx = 0;
        catIdx <
        categoryCount;
        catIdx++
      ) {
        const raw =
          answers[
            catIdx
          ];
        const normalised =
          raw
            ? raw
                .trim()
                .toLowerCase()
            : '';

        // Empty answer
        if (
          !normalised
        ) {
          pointsPerCategory.push(
            0,
          );
          invalidIndices.push(
            catIdx,
          );
          continue;
        }

        // Letter validation
        if (
          !normalised.startsWith(
            letter.toLowerCase(),
          )
        ) {
          pointsPerCategory.push(
            0,
          );
          invalidIndices.push(
            catIdx,
          );
          continue;
        }

        // Crashed
        if (
          crashedMap[
            userId
          ].has(
            catIdx,
          )
        ) {
          pointsPerCategory.push(
            0,
          );
          crashedIndices.push(
            catIdx,
          );
          continue;
        }

        // Check duplicates
        const groups =
          duplicateGroups.get(
            catIdx,
          )!;
        let isDuplicate = false;
        for (const [
          ,
          members,
        ] of groups) {
          if (
            members.includes(
              userId,
            ) &&
            members.length >
              1
          ) {
            isDuplicate = true;
            break;
          }
        }

        if (
          isDuplicate
        ) {
          // Shared answer (another player gave the same one) — design spec §3.3.5
          pointsPerCategory.push(
            CC_SHARED_POINTS,
          );
          duplicateIndices.push(
            catIdx,
          );
          roundScore +=
            CC_SHARED_POINTS;
        } else {
          pointsPerCategory.push(
            CC_UNIQUE_POINTS,
          );
          uniqueIndices.push(
            catIdx,
          );
          roundScore +=
            CC_UNIQUE_POINTS;
        }
      }

      playerResults[
        userId
      ] =
        {
          userId,
          userName,
          answers:
            [
              ...answers,
            ],
          pointsPerCategory,
          roundScore,
          crashedIndices,
          duplicateIndices,
          invalidIndices,
          uniqueIndices,
        };
    }

    return {
      roundNumber:
        this
          .state
          .currentRound,
      letter,
      categories:
        this
          .state
          .categories,
      playerResults,
    };
  }

  /**
   * Find groups of duplicate answers for a single category: whole normalised
   * strings that are equal, a plural of each other, or a typo apart
   * (lib/rmhbox/category-crash/answer-match.ts). Never prefixes: "bear" and
   * "bearded dragon" are two answers.
   */
  private findDuplicateGroups(
    entries: {
      userId: string;
      answer: string;
    }[],
  ): Map<
    string,
    string[]
  > {
    // Map: first member's answer → list of userIds
    const groups =
      new Map<
        string,
        string[]
      >();
    const byId =
      new Map(
        entries.map(
          (
            e,
          ) => [
            e.userId,
            e.answer,
          ],
        ),
      );
    for (const members of groupMatchingAnswers(
      entries.map(
        (
          e,
        ) => ({
          id: e.userId,
          answer:
            e.answer,
        }),
      ),
    )) {
      groups.set(
        `${byId.get(members[0]!) ?? ''}#${members[0]}`,
        members,
      );
    }
    return groups;
  }

  /** Compute crash bonus/penalty for a player based on their votes this round. */
  private computeCrashBonus(
    userId: string,
    crashedMap: Record<
      string,
      Set<number>
    >,
  ): number {
    let bonus = 0;

    const playerVotes =
      this.state.votes.filter(
        (
          v,
        ) =>
          v.voterId ===
            userId &&
          v.vote ===
            'crash',
      );
    for (const vote of playerVotes) {
      if (
        crashedMap[
          vote
            .targetUserId
        ]?.has(
          vote.categoryIndex,
        )
      ) {
        // Voted crash on an answer that ended up crashed — bonus
        bonus +=
          CC_CRASH_BONUS;
      } else {
        // Voted crash on an answer that was safe — penalty
        bonus +=
          CC_CRASH_PENALTY;
      }
    }

    return bonus;
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(
    userId: string,
  ): unknown {
    const base =
      {
        phase:
          this
            .state
            .phase,
        currentRound:
          this
            .state
            .currentRound,
        totalRounds:
          this
            .state
            .totalRounds,
        letter:
          this
            .state
            .letter,
        categories:
          this
            .state
            .categories,
        scores:
          this
            .state
            .scores,
        timeRemaining:
          this
            .state
            .timeRemaining,
      };

    switch (
      this
        .state
        .phase
    ) {
      case CategoryCrashPhase.REVEAL:
        return {
          ...base,
          myAnswers:
            null,
          lockedCount: 0,
          totalPlayers:
            Object.keys(
              this
                .state
                .answers,
            )
              .length,
        };

      case CategoryCrashPhase.INPUT:
        return {
          ...base,
          myAnswers:
            this
              .state
              .answers[
              userId
            ] ??
            null,
          isLocked:
            this
              .state
              .locked[
              userId
            ] ??
            false,
          lockedCount:
            Object.values(
              this
                .state
                .locked,
            ).filter(
              Boolean,
            )
              .length,
          totalPlayers:
            Object.keys(
              this
                .state
                .answers,
            )
              .length,
        };

      case CategoryCrashPhase.PEER_REVIEW: {
        // Build vote tallies for the current voting category
        const catIdx =
          this
            .state
            .currentVotingCategoryIndex;
        const voteTallies: Record<
          string,
          {
            crash: number;
            safe: number;
          }
        > =
          {};
        for (const answerId of Object.keys(
          this
            .state
            .answers,
        )) {
          const anonLabel =
            this
              .state
              .anonymizationMap[
              answerId
            ] ??
            answerId;
          const crashCount =
            this.state.votes.filter(
              (
                v,
              ) =>
                v.targetUserId ===
                  answerId &&
                v.categoryIndex ===
                  catIdx &&
                v.vote ===
                  'crash',
            ).length;
          const safeCount =
            this.state.votes.filter(
              (
                v,
              ) =>
                v.targetUserId ===
                  answerId &&
                v.categoryIndex ===
                  catIdx &&
                v.vote ===
                  'safe',
            ).length;
          voteTallies[
            anonLabel
          ] =
            {
              crash:
                crashCount,
              safe: safeCount,
            };
        }
        return {
          ...base,
          anonymizedAnswers:
            this.getAnonymizedAnswers(),
          myAnonymousLabel:
            this
              .state
              .anonymizationMap[
              userId
            ] ??
            null,
          currentVotingCategoryIndex:
            this
              .state
              .currentVotingCategoryIndex,
          myVotes:
            this.state.votes
              .filter(
                (
                  v,
                ) =>
                  v.voterId ===
                  userId,
              )
              .map(
                (
                  v,
                ) => ({
                  targetUserId:
                    this
                      .state
                      .anonymizationMap[
                      v
                        .targetUserId
                    ] ??
                    v.targetUserId,
                  categoryIndex:
                    v.categoryIndex,
                  vote: v.vote,
                }),
              ),
          voteTallies,
          myCrashes:
            this.state.crashes
              .filter(
                (
                  c,
                ) =>
                  c.crasherId ===
                  userId,
              )
              .map(
                (
                  c,
                ) => ({
                  targetUserId:
                    this
                      .state
                      .anonymizationMap[
                      c
                        .targetUserId
                    ] ??
                    c.targetUserId,
                  categoryIndex:
                    c.categoryIndex,
                }),
              ),
          crashesUsed:
            this
              .state
              .crashCounts[
              userId
            ] ??
            0,
        };
      }

      case CategoryCrashPhase.CRASH_RESOLUTION:
        return {
          ...base,
          anonymizedAnswers:
            this.getAnonymizedAnswers(),
          totalCrashes:
            this
              .state
              .crashes
              .length,
        };

      case CategoryCrashPhase.ROUND_RESULTS:
        return {
          ...base,
          // The client renders ONE round's results (as CC_ROUND_RESULTS sends them).
          roundResults:
            this.latestRoundResults(),
          anonymizationMap:
            this
              .state
              .anonymizationMap,
        };

      default:
        return base;
    }
  }

  private latestRoundResults(): CCRoundResults | null {
    return (
      this
        .state
        .roundResults[
        this
          .state
          .roundResults
          .length -
          1
      ] ??
      null
    );
  }

  getStateForSpectator(): unknown {
    const base =
      {
        phase:
          this
            .state
            .phase,
        currentRound:
          this
            .state
            .currentRound,
        totalRounds:
          this
            .state
            .totalRounds,
        letter:
          this
            .state
            .letter,
        categories:
          this
            .state
            .categories,
        scores:
          this
            .state
            .scores,
        timeRemaining:
          this
            .state
            .timeRemaining,
      };

    if (
      this
        .state
        .phase ===
      CategoryCrashPhase.INPUT
    ) {
      return {
        ...base,
        lockedCount:
          Object.values(
            this
              .state
              .locked,
          ).filter(
            Boolean,
          )
            .length,
        totalPlayers:
          Object.keys(
            this
              .state
              .answers,
          )
            .length,
      };
    }

    if (
      this
        .state
        .phase ===
        CategoryCrashPhase.PEER_REVIEW ||
      this
        .state
        .phase ===
        CategoryCrashPhase.CRASH_RESOLUTION
    ) {
      return {
        ...base,
        anonymizedAnswers:
          this.getAnonymizedAnswers(),
        currentVotingCategoryIndex:
          this
            .state
            .currentVotingCategoryIndex,
      };
    }

    if (
      this
        .state
        .phase ===
      CategoryCrashPhase.ROUND_RESULTS
    ) {
      return {
        ...base,
        roundResults:
          this.latestRoundResults(),
        anonymizationMap:
          this
            .state
            .anonymizationMap,
      };
    }

    return base;
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(
    userId: string,
  ): void {
    // join_next_subround: player spectates until next round
    if (
      this
        .state
        .currentRound ===
      1
    ) {
      this.state.pendingPlayers.add(
        userId,
      );
      logger.info(
        {
          event:
            'category_crash:player_join_pending',
          lobbyId:
            this
              .context
              .lobbyId,
          userId,
          round:
            this
              .state
              .currentRound,
        },
      );
    } else {
      // After round 1, promote immediately at next round start
      this.state.pendingPlayers.add(
        userId,
      );
    }

    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );
  }

  handlePlayerDisconnect(
    userId: string,
  ): void {
    logger.info(
      {
        event:
          'category_crash:player_disconnect',
        lobbyId:
          this
            .context
            .lobbyId,
        userId,
        round:
          this
            .state
            .currentRound,
        phase:
          this
            .state
            .phase,
      },
    );
  }

  handlePlayerReconnect(
    userId: string,
  ): void {
    logger.info(
      {
        event:
          'category_crash:player_reconnect',
        lobbyId:
          this
            .context
            .lobbyId,
        userId,
        round:
          this
            .state
            .currentRound,
        phase:
          this
            .state
            .phase,
      },
    );
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings =
      this.computeRankings();
    const awards =
      this.computeAwards();
    const duration =
      Date.now() -
      this
        .startedAt;

    return {
      rankings,
      awards,
      gameSpecificData:
        {
          roundResults:
            this
              .state
              .roundResults,
          totalRounds:
            this
              .state
              .totalRounds,
          gameLog:
            this.buildGameLog(),
        },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] =
      [];

    for (const userId of this.context.players.keys()) {
      const player =
        this.context.players.get(
          userId,
        )!;
      const score =
        this
          .state
          .scores[
          userId
        ] ??
        0;

      const deltas: Record<
        string,
        number
      > =
        {};
      for (const rr of this
        .state
        .roundResults) {
        const pr =
          rr
            .playerResults[
            userId
          ];
        deltas[
          `round_${rr.roundNumber}`
        ] =
          pr?.roundScore ??
          0;
      }

      entries.push(
        {
          userId,
          userName:
            player.userName,
          score,
          rank: 0,
          deltas,
        },
      );
    }

    entries.sort(
      (
        a,
        b,
      ) =>
        b.score -
        a.score,
    );
    // Equal scores share a rank (1, 1, 3)
    entries.forEach(
      (
        e,
        i,
      ) => {
        e.rank =
          i >
            0 &&
          e.score ===
            entries[
              i -
                1
            ]!
              .score
            ? entries[
                i -
                  1
              ]!
                .rank
            : i +
              1;
      },
    );

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] =
      [];

    // Aggregate stats
    const stats: Record<
      string,
      {
        uniqueCount: number;
        lockedFirst: boolean;
        crashesIssued: number;
        successfulCrashes: number;
        fullHouseRounds: number;
      }
    > =
      {};

    for (const userId of this.context.players.keys()) {
      stats[
        userId
      ] =
        {
          uniqueCount: 0,
          lockedFirst: false,
          crashesIssued: 0,
          successfulCrashes: 0,
          fullHouseRounds: 0,
        };
    }

    for (const rr of this
      .state
      .roundResults) {
      for (const [
        userId,
        pr,
      ] of Object.entries(
        rr.playerResults,
      )) {
        if (
          !stats[
            userId
          ]
        )
          continue;
        stats[
          userId
        ].uniqueCount +=
          pr.uniqueIndices.length;
        if (
          pr
            .uniqueIndices
            .length ===
          rr
            .categories
            .length
        ) {
          stats[
            userId
          ]
            .fullHouseRounds++;
        }
      }
    }

    // Count crashes across all rounds from action log
    for (const entry of this
      .state
      .actionLog) {
      if (
        entry.type ===
          'crash' &&
        typeof entry
          .payload
          .crasherId ===
          'string'
      ) {
        const crasherId =
          entry
            .payload
            .crasherId;
        if (
          stats[
            crasherId
          ]
        ) {
          stats[
            crasherId
          ]
            .crashesIssued++;
        }
      }
    }

    // Unique Snowflake — most unique answers
    const snowflake =
      this.findTopPlayer(
        stats,
        (
          s,
        ) =>
          s.uniqueCount,
      );
    if (
      snowflake &&
      snowflake.value >
        0
    ) {
      awards.push(
        {
          userId:
            snowflake.userId,
          title:
            'Unique Snowflake',
          description: `Had ${snowflake.value} unique answers no one else thought of`,
          icon: 'snowflake',
        },
      );
    }

    // Speed Demon — first to lock answers with at least one valid answer
    const lockActions =
      this.state.actionLog
        .filter(
          (
            a,
          ) =>
            a.type ===
            'answers_locked',
        )
        .sort(
          (
            a,
            b,
          ) =>
            a.timestamp -
            b.timestamp,
        );
    if (
      lockActions.length >
      0
    ) {
      const fastestUserId =
        lockActions[0]
          .payload
          .userId as string;
      if (
        this.context.players.has(
          fastestUserId,
        )
      ) {
        awards.push(
          {
            userId:
              fastestUserId,
            title:
              'Speed Demon',
            description:
              'First player to lock in answers',
            icon: 'zap',
          },
        );
      }
    }

    // Crash Test Dummy — most crashes received
    const crashesReceived: Record<
      string,
      number
    > =
      {};
    for (const rr of this
      .state
      .roundResults) {
      for (const [
        userId,
        pr,
      ] of Object.entries(
        rr.playerResults,
      )) {
        crashesReceived[
          userId
        ] =
          (crashesReceived[
            userId
          ] ??
            0) +
          pr
            .crashedIndices
            .length;
      }
    }
    let maxCrashedUser:
      | string
      | null =
      null;
    let maxCrashed = 0;
    for (const [
      userId,
      count,
    ] of Object.entries(
      crashesReceived,
    )) {
      if (
        count >
        maxCrashed
      ) {
        maxCrashed =
          count;
        maxCrashedUser =
          userId;
      }
    }
    if (
      maxCrashedUser &&
      maxCrashed >
        0
    ) {
      awards.push(
        {
          userId:
            maxCrashedUser,
          title:
            'Crash Test Dummy',
          description: `Had ${maxCrashed} answers crashed by other players`,
          icon: 'flame',
        },
      );
    }

    // Vigilante — most crashes issued
    const vigilante =
      this.findTopPlayer(
        stats,
        (
          s,
        ) =>
          s.crashesIssued,
      );
    if (
      vigilante &&
      vigilante.value >
        0
    ) {
      awards.push(
        {
          userId:
            vigilante.userId,
          title:
            'Vigilante',
          description: `Issued ${vigilante.value} crash votes`,
          icon: 'search',
        },
      );
    }

    // Full House — scored on all categories in at least one round
    for (const [
      userId,
      s,
    ] of Object.entries(
      stats,
    )) {
      if (
        s.fullHouseRounds >
        0
      ) {
        awards.push(
          {
            userId,
            title:
              'Full House',
            description:
              'Scored on every category in a round',
            icon: 'home',
          },
        );
        break; // Only award once
      }
    }

    return awards;
  }

  private findTopPlayer<
    T,
  >(
    stats: Record<
      string,
      T
    >,
    getValue: (
      s: T,
    ) => number,
  ): {
    userId: string;
    value: number;
  } | null {
    let topUserId:
      | string
      | null =
      null;
    let topValue =
      -1;
    for (const [
      userId,
      s,
    ] of Object.entries(
      stats,
    )) {
      const v =
        getValue(
          s,
        );
      if (
        v >
        topValue
      ) {
        topValue =
          v;
        topUserId =
          userId;
      }
    }
    return topUserId
      ? {
          userId:
            topUserId,
          value:
            topValue,
        }
      : null;
  }

  // ─── Action Log / Game Log ───────────────────────────────────

  private actionSeq = 0;

  private logAction(
    type: string,
    payload: Record<
      string,
      unknown
    >,
  ): void {
    this.state.actionLog.push(
      {
        seq: ++this
          .actionSeq,
        type,
        timestamp:
          Date.now(),
        payload,
      },
    );
  }

  private buildGameLog(): Record<
    string,
    unknown
  > {
    const players =
      Array.from(
        this.context.players.entries(),
      ).map(
        ([
          userId,
          p,
        ]) => ({
          userId,
          userName:
            p.userName,
        }),
      );

    return {
      lobbyId:
        this
          .context
          .lobbyId,
      startedAt:
        this
          .startedAt,
      endedAt:
        Date.now(),
      totalRounds:
        this
          .state
          .totalRounds,
      roundsPlayed:
        this
          .state
          .currentRound,
      playerCount:
        this
          .context
          .players
          .size,
      players,
      initialState:
        {
          rounds:
            this
              .state
              .totalRounds,
          categoriesPerRound:
            this
              .state
              .categories
              .length,
        },
      actions:
        this
          .state
          .actionLog,
      finalResults:
        Array.from(
          this.context.players.keys(),
        ).map(
          (
            userId,
          ) => ({
            userId,
            userName:
              this.context.players.get(
                userId,
              )
                ?.userName ??
              'Unknown',
            score:
              this
                .state
                .scores[
                userId
              ] ??
              0,
          }),
        ),
    };
  }
}
