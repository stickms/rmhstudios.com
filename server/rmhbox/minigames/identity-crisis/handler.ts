/**
 * Identity Crisis — Server Game Handler
 *
 * Each player is secretly assigned an identity (famous person, character, etc.)
 * that everyone EXCEPT them can see. Players take turns asking yes/no questions
 * about themselves while others vote on the answer. The goal is to deduce your
 * own identity before the final guess phase.
 *
 * CRITICAL MASKING RULE: A player must NEVER see their own identity in any
 * state returned before the RESULTS phase. This is the core game mechanic.
 *
 * Reference: docs/rmhbox/implementation/phase-8.md §8.1.6–8.1.11
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { logger } from '../../logger';
import {
  ICQuestionSchema,
  ICVoteSchema,
  ICGuessSchema,
  type Identity,
} from '@/lib/rmhbox/identity-crisis/schemas';
import {
  loadIdentities,
  selectIdentitiesForGame,
} from '@/lib/rmhbox/identity-crisis/identity-loader';
import Fuse from 'fuse.js';
import {
  IC_QUESTIONS_PER_PLAYER,
  IC_ASK_SECONDS,
  IC_VOTE_SECONDS,
  IC_VOTE_RESULTS_SECONDS,
  IC_ASSIGNMENT_REVEAL_SECONDS,
  IC_FINAL_GUESS_SECONDS,
  IC_RESULTS_SECONDS,
  IC_CORRECT_GUESS_POINTS,
  IC_EARLY_GUESS_BONUS_BASE,
  IC_EARLY_GUESS_PENALTY,
  IC_EFFICIENCY_BONUS,
  IC_VOTING_ACCURACY_BONUS,
  IC_GUESS_MATCH_THRESHOLD,
} from '@/lib/rmhbox/constants';

// ─── Phase Enum ──────────────────────────────────────────────────

type ICPhase =
  | 'ASSIGNMENT_REVEAL'
  | 'ASK'
  | 'VOTE'
  | 'VOTE_RESULTS'
  | 'FINAL_GUESS'
  | 'RESULTS';

// ─── Internal Types ──────────────────────────────────────────────

interface ICQuestion {
  askerId: string;
  askerName: string;
  question: string;
  votes: Map<string, 'yes' | 'no' | 'maybe'>;
  result: 'yes' | 'no' | 'maybe' | null;
  /** Count tallies once voting ends. */
  tally: { yes: number; no: number; maybe: number };
}

interface ICVote {
  userId: string;
  vote: 'yes' | 'no' | 'maybe';
}

interface ICGuessResult {
  userId: string;
  userName: string;
  guess: string;
  actualIdentity: string;
  correct: boolean;
  points: number;
  /** Which question turn the early guess was made on (0-indexed), or -1 for final. */
  turnIndex: number;
}

interface ICPlayerState {
  identity: Identity;
  score: number;
  /** Whether this player has been eliminated from asking (wrong early guess). */
  eliminated: boolean;
  /** Whether this player has already guessed correctly (early). */
  guessedCorrectly: boolean;
  /** Number of times this player's votes matched the majority outcome. */
  votingAccuracy: number;
  /** Total votes cast by this player. */
  totalVotesCast: number;
  /** Final guess text (set during FINAL_GUESS phase). */
  finalGuess: string | null;
}

interface ActionLogEntry {
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

interface IdentityCrisisState {
  phase: ICPhase;
  /** Map of userId → player-specific game state. */
  playerStates: Map<string, ICPlayerState>;
  /** Ordered list of player IDs for question turns. */
  questionOrder: string[];
  /** Index into questionOrder for the current question cycle position. */
  currentOrderIndex: number;
  /** How many full question cycles have been completed. */
  currentRound: number;
  /** Total question rounds (questionsPerPlayer setting). */
  totalRounds: number;
  /** The currently active question (during ASK/VOTE/VOTE_RESULTS). */
  currentQuestion: ICQuestion | null;
  /** All completed questions for history. */
  questionHistory: ICQuestion[];
  /** All early and final guess results. */
  guessResults: ICGuessResult[];
  /** Action log for game history replay. */
  actionLog: ActionLogEntry[];
}

// ─── Fuse.js instance for fuzzy matching ─────────────────────────

function createFuseMatcher(identities: Identity[]): Fuse<Identity> {
  return new Fuse(identities, {
    keys: ['name'],
    threshold: IC_GUESS_MATCH_THRESHOLD,
    includeScore: true,
  });
}

// ─── Main Game Class ─────────────────────────────────────────────

export class IdentityCrisisGame extends BaseMinigame {
  private state!: IdentityCrisisState;
  private startedAt: number = 0;
  private fuseMatcher!: Fuse<Identity>;
  /** All identities assigned this game (for fuzzy match pool). */
  private assignedIdentities: Identity[] = [];

  constructor(context: MinigameContext) {
    super(context);
  }

  // ─── Lifecycle: start ────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const questionsPerPlayer = this.getSetting<number>('questionsPerPlayer', IC_QUESTIONS_PER_PLAYER);
    const playerIds = Array.from(this.context.players.keys());

    // Load identity pool and select identities for this game
    const pool = loadIdentities();
    const selectedIdentities = selectIdentitiesForGame(
      pool,
      playerIds.length,
      new Set<string>(),
      0,
    );

    this.assignedIdentities = selectedIdentities;
    this.fuseMatcher = createFuseMatcher(selectedIdentities);

    // Initialize player states with assigned identities
    const playerStates = new Map<string, ICPlayerState>();
    playerIds.forEach((userId, index) => {
      playerStates.set(userId, {
        identity: selectedIdentities[index],
        score: 0,
        eliminated: false,
        guessedCorrectly: false,
        votingAccuracy: 0,
        totalVotesCast: 0,
        finalGuess: null,
      });
    });

    // Generate question order (shuffled player list)
    const questionOrder = [...playerIds];
    for (let i = questionOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionOrder[i], questionOrder[j]] = [questionOrder[j], questionOrder[i]];
    }

    this.state = {
      phase: 'ASSIGNMENT_REVEAL',
      playerStates,
      questionOrder,
      currentOrderIndex: 0,
      currentRound: 0,
      totalRounds: questionsPerPlayer,
      currentQuestion: null,
      questionHistory: [],
      guessResults: [],
      actionLog: [],
    };

    logger.info({
      event: 'identity_crisis:start',
      lobbyId: this.context.lobbyId,
      playerCount: playerIds.length,
      questionsPerPlayer,
      identities: selectedIdentities.map((id) => id.name),
    });

    this.logAction('game_start', {
      playerCount: playerIds.length,
      questionsPerPlayer,
    });

    this.startAssignmentReveal();
  }

  // ─── Phase: Assignment Reveal ────────────────────────────────

  /**
   * Show each player everyone else's identity (but NOT their own).
   * Spectators see ALL identities.
   */
  private startAssignmentReveal(): void {
    this.state.phase = 'ASSIGNMENT_REVEAL';
    const revealDuration = IC_ASSIGNMENT_REVEAL_SECONDS;

    // Send each player the identities of OTHER players only
    for (const [userId] of this.context.players) {
      const otherIdentities = this.buildOtherIdentitiesMap(userId);
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'IC_IDENTITIES_REVEAL',
        payload: {
          phase: 'ASSIGNMENT_REVEAL',
          identities: otherIdentities,
        },
      });
    }

    // Spectators get the full god-view
    const allIdentities = this.buildAllIdentitiesMap();
    this.context.sendToSpectators('rmhbox:game:action', {
      type: 'IC_IDENTITIES_REVEAL',
      payload: {
        phase: 'ASSIGNMENT_REVEAL',
        identities: allIdentities,
      },
    });

    this.startPhaseTimer(revealDuration);

    logger.info({
      event: 'identity_crisis:assignment_reveal',
      lobbyId: this.context.lobbyId,
      duration: revealDuration,
    });

    this.logAction('assignment_reveal', { duration: revealDuration });

    this.setTimeout(() => {
      if (!this.isRunning) return;
      this.startNextQuestionTurn();
    }, revealDuration * 1000);
  }

  // ─── Phase: Question Turns ───────────────────────────────────

  /**
   * Advance to the next player's question turn. Skips eliminated players
   * and players who have already guessed correctly. When all rounds are
   * complete, transitions to the final guess phase.
   */
  private startNextQuestionTurn(): void {
    if (!this.isRunning) return;

    // Find the next eligible asker
    const totalPlayers = this.state.questionOrder.length;
    let attempts = 0;

    while (attempts < totalPlayers) {
      const candidateId = this.state.questionOrder[this.state.currentOrderIndex];
      const candidateState = this.state.playerStates.get(candidateId);
      const player = this.context.players.get(candidateId);

      // Advance the index (wrap around)
      this.state.currentOrderIndex =
        (this.state.currentOrderIndex + 1) % totalPlayers;

      // Check if we completed a full cycle
      if (this.state.currentOrderIndex === 0) {
        this.state.currentRound++;
      }

      // Skip eliminated, already-guessed, or disconnected players
      if (
        candidateState &&
        !candidateState.eliminated &&
        !candidateState.guessedCorrectly &&
        player?.isConnected
      ) {
        this.startAskPhase(candidateId);
        return;
      }

      attempts++;
    }

    // If all rounds done or no eligible players remain, go to final guess
    if (this.state.currentRound >= this.state.totalRounds || attempts >= totalPlayers) {
      this.startFinalGuessPhase();
      return;
    }

    // Fallback: no eligible players
    this.startFinalGuessPhase();
  }

  /**
   * Start the ASK phase for a specific player. The asker gets IC_TURN_START_SELF
   * (without their identity), all others get IC_TURN_START (with asker's identity).
   */
  private startAskPhase(askerId: string): void {
    this.state.phase = 'ASK';
    const askDuration = this.getSetting<number>('askDuration', IC_ASK_SECONDS);
    const askerPlayer = this.context.players.get(askerId);
    const askerName = askerPlayer?.userName ?? 'Unknown';
    const askerState = this.state.playerStates.get(askerId)!;

    this.state.currentQuestion = {
      askerId,
      askerName,
      question: '',
      votes: new Map(),
      result: null,
      tally: { yes: 0, no: 0, maybe: 0 },
    };

    const totalQuestions = this.state.totalRounds * this.state.questionOrder.length;
    const currentQuestionNum = this.state.questionHistory.length + 1;
    this.broadcastRound(currentQuestionNum, totalQuestions);

    // Asker sees IC_TURN_START_SELF — NO identity info
    this.context.sendToPlayer(askerId, 'rmhbox:game:action', {
      type: 'IC_TURN_START_SELF',
      payload: {
        phase: 'ASK',
        askerId,
        askerName,
        questionNumber: currentQuestionNum,
        totalQuestions,
      },
    });

    // All other players see IC_TURN_START — WITH the asker's identity
    for (const [userId] of this.context.players) {
      if (userId === askerId) continue;
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'IC_TURN_START',
        payload: {
          phase: 'ASK',
          askerId,
          askerName,
          askerIdentity: askerState.identity.name,
          askerIdentityCategory: askerState.identity.category,
          questionNumber: currentQuestionNum,
          totalQuestions,
        },
      });
    }

    // Spectators get full info
    this.context.sendToSpectators('rmhbox:game:action', {
      type: 'IC_TURN_START',
      payload: {
        phase: 'ASK',
        askerId,
        askerName,
        askerIdentity: askerState.identity.name,
        askerIdentityCategory: askerState.identity.category,
        questionNumber: currentQuestionNum,
        totalQuestions,
      },
    });

    this.startPhaseTimer(askDuration);

    logger.info({
      event: 'identity_crisis:ask_phase',
      lobbyId: this.context.lobbyId,
      askerId,
      askerName,
      questionNumber: currentQuestionNum,
    });

    // If asker doesn't submit in time, skip to next turn
    this.setTimeout(() => {
      if (!this.isRunning) return;
      if (this.state.phase === 'ASK' && this.state.currentQuestion?.askerId === askerId) {
        if (this.state.currentQuestion.question === '') {
          // Asker timed out without asking — skip turn
          logger.info({
            event: 'identity_crisis:ask_timeout',
            lobbyId: this.context.lobbyId,
            askerId,
          });
          this.logAction('ask_timeout', { askerId });
          this.startNextQuestionTurn();
        }
      }
    }, askDuration * 1000);
  }

  // ─── Phase: Vote ─────────────────────────────────────────────

  /**
   * Transition to the voting phase after a question is asked.
   * All players except the asker vote yes/no/maybe.
   */
  private startVotePhase(): void {
    this.state.phase = 'VOTE';
    const voteDuration = this.getSetting<number>('voteDuration', IC_VOTE_SECONDS);
    const question = this.state.currentQuestion!;

    // Broadcast question to all — asker does NOT see their own identity
    this.context.sendToPlayer(question.askerId, 'rmhbox:game:action', {
      type: 'IC_VOTE_START',
      payload: {
        phase: 'VOTE',
        askerId: question.askerId,
        askerName: question.askerName,
        question: question.question,
      },
    });

    const askerState = this.state.playerStates.get(question.askerId)!;
    for (const [userId] of this.context.players) {
      if (userId === question.askerId) continue;
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'IC_VOTE_START',
        payload: {
          phase: 'VOTE',
          askerId: question.askerId,
          askerName: question.askerName,
          askerIdentity: askerState.identity.name,
          question: question.question,
        },
      });
    }

    this.context.sendToSpectators('rmhbox:game:action', {
      type: 'IC_VOTE_START',
      payload: {
        phase: 'VOTE',
        askerId: question.askerId,
        askerName: question.askerName,
        askerIdentity: askerState.identity.name,
        question: question.question,
      },
    });

    this.startPhaseTimer(voteDuration);

    logger.info({
      event: 'identity_crisis:vote_phase',
      lobbyId: this.context.lobbyId,
      question: question.question,
      askerId: question.askerId,
    });

    this.setTimeout(() => {
      if (!this.isRunning) return;
      if (this.state.phase === 'VOTE') {
        this.endVotePhase();
      }
    }, voteDuration * 1000);
  }

  /**
   * Tally votes and determine the majority result.
   * Transition to VOTE_RESULTS phase.
   */
  private endVotePhase(): void {
    const question = this.state.currentQuestion!;
    this.clearPhaseTimer();

    // Tally votes
    const tally = { yes: 0, no: 0, maybe: 0 };
    for (const vote of question.votes.values()) {
      tally[vote]++;
    }
    question.tally = tally;

    // Determine majority (yes/no take precedence over maybe in ties)
    if (tally.yes > tally.no && tally.yes >= tally.maybe) {
      question.result = 'yes';
    } else if (tally.no > tally.yes && tally.no >= tally.maybe) {
      question.result = 'no';
    } else if (tally.maybe > tally.yes && tally.maybe > tally.no) {
      question.result = 'maybe';
    } else if (tally.yes === tally.no && tally.yes > 0) {
      question.result = 'maybe'; // Tie between yes/no → maybe
    } else {
      question.result = 'maybe'; // No votes or all equal → maybe
    }

    // Award voting accuracy to players whose vote matched the majority
    for (const [voterId, vote] of question.votes) {
      const voterState = this.state.playerStates.get(voterId);
      if (voterState && vote === question.result) {
        voterState.votingAccuracy++;
      }
    }

    // Push to history
    this.state.questionHistory.push({ ...question, votes: new Map(question.votes) });

    this.logAction('vote_result', {
      askerId: question.askerId,
      question: question.question,
      tally,
      result: question.result,
    });

    this.startVoteResultsPhase();
  }

  /**
   * Show vote results briefly before moving on.
   */
  private startVoteResultsPhase(): void {
    this.state.phase = 'VOTE_RESULTS';
    const question = this.state.currentQuestion!;
    const resultsDuration = IC_VOTE_RESULTS_SECONDS;

    // Broadcast vote results — asker gets no identity, others get asker's identity
    const basePayload = {
      phase: 'VOTE_RESULTS' as const,
      askerId: question.askerId,
      askerName: question.askerName,
      question: question.question,
      result: question.result,
      tally: question.tally,
      totalVoters: question.votes.size,
    };

    this.context.sendToPlayer(question.askerId, 'rmhbox:game:action', {
      type: 'IC_VOTE_RESULTS',
      payload: basePayload,
    });

    const askerState = this.state.playerStates.get(question.askerId)!;
    for (const [userId] of this.context.players) {
      if (userId === question.askerId) continue;
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'IC_VOTE_RESULTS',
        payload: {
          ...basePayload,
          askerIdentity: askerState.identity.name,
        },
      });
    }

    this.context.sendToSpectators('rmhbox:game:action', {
      type: 'IC_VOTE_RESULTS',
      payload: {
        ...basePayload,
        askerIdentity: askerState.identity.name,
      },
    });

    this.startPhaseTimer(resultsDuration);

    logger.info({
      event: 'identity_crisis:vote_results',
      lobbyId: this.context.lobbyId,
      result: question.result,
      tally: question.tally,
    });

    this.setTimeout(() => {
      if (!this.isRunning) return;
      this.afterVoteResults();
    }, resultsDuration * 1000);
  }

  /**
   * After showing vote results, check if all rounds are done,
   * then advance to the next question turn.
   */
  private afterVoteResults(): void {
    if (!this.isRunning) return;

    // Check if all rounds complete
    if (this.state.currentRound >= this.state.totalRounds) {
      this.startFinalGuessPhase();
      return;
    }

    this.startNextQuestionTurn();
  }

  // ─── Phase: Final Guess ──────────────────────────────────────

  /**
   * All players who haven't guessed correctly yet submit their final guess.
   */
  private startFinalGuessPhase(): void {
    this.state.phase = 'FINAL_GUESS';
    const guessDuration = this.getSetting<number>('finalGuessDuration', IC_FINAL_GUESS_SECONDS);

    // Broadcast final guess start — each player gets masked state
    for (const [userId] of this.context.players) {
      const ps = this.state.playerStates.get(userId);
      if (!ps) continue;

      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'IC_FINAL_GUESS_START',
        payload: {
          phase: 'FINAL_GUESS',
          alreadyGuessed: ps.guessedCorrectly,
          otherIdentities: this.buildOtherIdentitiesMap(userId),
          questionHistory: this.buildQuestionHistoryForPlayer(userId),
        },
      });
    }

    this.context.sendToSpectators('rmhbox:game:action', {
      type: 'IC_FINAL_GUESS_START',
      payload: {
        phase: 'FINAL_GUESS',
        identities: this.buildAllIdentitiesMap(),
      },
    });

    this.startPhaseTimer(guessDuration);

    logger.info({
      event: 'identity_crisis:final_guess_phase',
      lobbyId: this.context.lobbyId,
      duration: guessDuration,
    });

    this.logAction('final_guess_start', { duration: guessDuration });

    this.setTimeout(() => {
      if (!this.isRunning) return;
      if (this.state.phase === 'FINAL_GUESS') {
        this.endFinalGuessPhase();
      }
    }, guessDuration * 1000);
  }

  /**
   * End the final guess phase — score any remaining players who didn't
   * submit a guess, then show results.
   */
  private endFinalGuessPhase(): void {
    this.clearPhaseTimer();

    // Players who haven't guessed yet get 0 points
    for (const [userId, ps] of this.state.playerStates) {
      if (!ps.guessedCorrectly && ps.finalGuess === null) {
        this.state.guessResults.push({
          userId,
          userName: this.context.players.get(userId)?.userName ?? 'Unknown',
          guess: '',
          actualIdentity: ps.identity.name,
          correct: false,
          points: 0,
          turnIndex: -1,
        });
      }
    }

    logger.info({
      event: 'identity_crisis:final_guess_end',
      lobbyId: this.context.lobbyId,
    });

    this.showResults();
  }

  // ─── Phase: Results ──────────────────────────────────────────

  /**
   * Calculate final scores, award voting accuracy bonuses, and broadcast results.
   */
  private showResults(): void {
    this.state.phase = 'RESULTS';

    // Award voting accuracy bonus points
    for (const [userId, ps] of this.state.playerStates) {
      const accuracyBonus = ps.votingAccuracy * IC_VOTING_ACCURACY_BONUS;
      ps.score += accuracyBonus;
    }

    const results = this.computeResults();

    // Broadcast full results to everyone (identities revealed)
    const allIdentities = this.buildAllIdentitiesMap();
    const resultsPayload = {
      phase: 'RESULTS' as const,
      identities: allIdentities,
      rankings: results.rankings,
      awards: results.awards,
      guessResults: this.state.guessResults,
      questionHistory: this.buildFullQuestionHistory(),
    };

    this.context.broadcastAction({
      type: 'IC_RESULTS',
      payload: resultsPayload,
    });

    this.startPhaseTimer(IC_RESULTS_SECONDS);

    logger.info({
      event: 'identity_crisis:results',
      lobbyId: this.context.lobbyId,
      rankings: results.rankings.map((r) => ({ userId: r.userId, score: r.score, rank: r.rank })),
    });

    this.logAction('game_end', {
      rankings: results.rankings,
      awards: results.awards,
    });

    this.setTimeout(() => {
      if (!this.isRunning) return;
      this.isRunning = false;
      this.context.onComplete(results);
    }, IC_RESULTS_SECONDS * 1000);
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning) return;

    switch (action) {
      case 'IC_ASK_QUESTION':
        this.handleAskQuestion(userId, data);
        break;
      case 'IC_VOTE':
        this.handleVote(userId, data);
        break;
      case 'IC_EARLY_GUESS':
        this.handleEarlyGuess(userId, data);
        break;
      case 'IC_FINAL_GUESS':
        this.handleFinalGuess(userId, data);
        break;
      default:
        logger.warn({
          event: 'identity_crisis:unknown_action',
          lobbyId: this.context.lobbyId,
          userId,
          action,
        });
    }
  }

  /**
   * Handle a player submitting their yes/no question during the ASK phase.
   */
  private handleAskQuestion(userId: string, data: unknown): void {
    if (this.state.phase !== 'ASK') return;
    if (!this.state.currentQuestion || this.state.currentQuestion.askerId !== userId) return;
    if (this.state.currentQuestion.question !== '') return; // Already submitted

    const parsed = ICQuestionSchema.safeParse(data);
    if (!parsed.success) {
      logger.warn({
        event: 'identity_crisis:invalid_question',
        lobbyId: this.context.lobbyId,
        userId,
        errors: parsed.error.issues,
      });
      return;
    }

    this.state.currentQuestion.question = parsed.data.question;
    this.clearPhaseTimer();

    logger.info({
      event: 'identity_crisis:question_asked',
      lobbyId: this.context.lobbyId,
      askerId: userId,
      question: parsed.data.question,
    });

    this.logAction('question_asked', {
      askerId: userId,
      question: parsed.data.question,
    });

    // Transition to vote phase
    this.startVotePhase();
  }

  /**
   * Handle a player's vote on the current question during the VOTE phase.
   */
  private handleVote(userId: string, data: unknown): void {
    if (this.state.phase !== 'VOTE') return;
    if (!this.state.currentQuestion) return;

    // Asker cannot vote on their own question
    if (userId === this.state.currentQuestion.askerId) return;

    // Can't vote twice
    if (this.state.currentQuestion.votes.has(userId)) return;

    const parsed = ICVoteSchema.safeParse(data);
    if (!parsed.success) return;

    this.state.currentQuestion.votes.set(userId, parsed.data.vote);

    const voterState = this.state.playerStates.get(userId);
    if (voterState) {
      voterState.totalVotesCast++;
    }

    this.logAction('vote_cast', {
      voterId: userId,
      vote: parsed.data.vote,
    });

    // Broadcast anonymous vote count update
    const voteCount = this.state.currentQuestion.votes.size;
    const eligibleVoters = this.getEligibleVoterCount();
    this.context.broadcastAction({
      type: 'IC_VOTE_COUNT',
      payload: { voteCount, totalEligible: eligibleVoters },
    });

    // If all eligible voters have voted, end voting early
    if (voteCount >= eligibleVoters) {
      this.endVotePhase();
    }
  }

  /**
   * Handle an early identity guess during ASK or VOTE phases.
   * Uses fuse.js fuzzy matching against the player's actual identity.
   */
  private handleEarlyGuess(userId: string, data: unknown): void {
    const enableEarlyGuess = this.getSetting<boolean>('enableEarlyGuess', true);
    if (!enableEarlyGuess) return;

    // Only allow during ASK or VOTE phases
    if (this.state.phase !== 'ASK' && this.state.phase !== 'VOTE') return;

    const ps = this.state.playerStates.get(userId);
    if (!ps || ps.eliminated || ps.guessedCorrectly) return;

    const parsed = ICGuessSchema.safeParse(data);
    if (!parsed.success) return;

    const guessText = parsed.data.guess;
    const isCorrect = this.fuzzyMatchIdentity(guessText, ps.identity);

    const questionsAskedSoFar = this.state.questionHistory.length;
    const totalQuestions = this.state.totalRounds * this.state.questionOrder.length;
    const remainingQuestions = totalQuestions - questionsAskedSoFar;

    if (isCorrect) {
      // Bonus scales with how early the guess is
      const earlyBonus = Math.round(
        IC_EARLY_GUESS_BONUS_BASE * (remainingQuestions / Math.max(1, totalQuestions)),
      );
      // Efficiency bonus for fewer questions needed
      const efficiencyBonus = IC_EFFICIENCY_BONUS * remainingQuestions;
      const totalPoints = IC_CORRECT_GUESS_POINTS + earlyBonus + efficiencyBonus;

      ps.score += totalPoints;
      ps.guessedCorrectly = true;

      this.state.guessResults.push({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        guess: guessText,
        actualIdentity: ps.identity.name,
        correct: true,
        points: totalPoints,
        turnIndex: questionsAskedSoFar,
      });

      logger.info({
        event: 'identity_crisis:early_guess_correct',
        lobbyId: this.context.lobbyId,
        userId,
        guess: guessText,
        identity: ps.identity.name,
        points: totalPoints,
      });

      // Notify the player privately
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'IC_EARLY_GUESS_RESULT',
        payload: { correct: true, points: totalPoints, guess: guessText },
      });
    } else {
      // Penalty and elimination from future question turns
      ps.score += IC_EARLY_GUESS_PENALTY;
      ps.eliminated = true;

      this.state.guessResults.push({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        guess: guessText,
        actualIdentity: ps.identity.name,
        correct: false,
        points: IC_EARLY_GUESS_PENALTY,
        turnIndex: questionsAskedSoFar,
      });

      logger.info({
        event: 'identity_crisis:early_guess_wrong',
        lobbyId: this.context.lobbyId,
        userId,
        guess: guessText,
        identity: ps.identity.name,
        penalty: IC_EARLY_GUESS_PENALTY,
      });

      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'IC_EARLY_GUESS_RESULT',
        payload: { correct: false, points: IC_EARLY_GUESS_PENALTY, guess: guessText },
      });
    }

    this.logAction('early_guess', {
      userId,
      guess: guessText,
      correct: isCorrect,
      points: isCorrect
        ? this.state.guessResults[this.state.guessResults.length - 1].points
        : IC_EARLY_GUESS_PENALTY,
    });

    // Broadcast anonymized update (don't reveal who guessed)
    this.context.broadcastAction({
      type: 'IC_EARLY_GUESS_MADE',
      payload: { remainingGuessers: this.getRemainingGuessersCount() },
    });
  }

  /**
   * Handle a final identity guess during the FINAL_GUESS phase.
   */
  private handleFinalGuess(userId: string, data: unknown): void {
    if (this.state.phase !== 'FINAL_GUESS') return;

    const ps = this.state.playerStates.get(userId);
    if (!ps || ps.guessedCorrectly) return; // Already guessed correctly via early guess
    if (ps.finalGuess !== null) return; // Already submitted final guess

    const parsed = ICGuessSchema.safeParse(data);
    if (!parsed.success) return;

    const guessText = parsed.data.guess;
    ps.finalGuess = guessText;

    const isCorrect = this.fuzzyMatchIdentity(guessText, ps.identity);

    if (isCorrect) {
      ps.score += IC_CORRECT_GUESS_POINTS;
      ps.guessedCorrectly = true;

      this.state.guessResults.push({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        guess: guessText,
        actualIdentity: ps.identity.name,
        correct: true,
        points: IC_CORRECT_GUESS_POINTS,
        turnIndex: -1,
      });
    } else {
      this.state.guessResults.push({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        guess: guessText,
        actualIdentity: ps.identity.name,
        correct: false,
        points: 0,
        turnIndex: -1,
      });
    }

    logger.info({
      event: 'identity_crisis:final_guess',
      lobbyId: this.context.lobbyId,
      userId,
      guess: guessText,
      correct: isCorrect,
    });

    this.logAction('final_guess', {
      userId,
      guess: guessText,
      correct: isCorrect,
    });

    // Check if all players have submitted final guesses
    const allGuessed = this.allFinalGuessesSubmitted();
    if (allGuessed) {
      this.endFinalGuessPhase();
    }
  }

  // ─── Results Computation ─────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        guessResults: this.state.guessResults,
        questionHistory: this.buildFullQuestionHistory(),
        identities: this.buildAllIdentitiesMap(),
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries = Array.from(this.state.playerStates.entries()).map(([userId, ps]) => ({
      userId,
      userName: this.context.players.get(userId)?.userName ?? 'Unknown',
      score: ps.score,
    }));

    // Sort by score descending
    entries.sort((a, b) => b.score - a.score);

    return entries.map((entry, index) => ({
      userId: entry.userId,
      userName: entry.userName,
      score: entry.score,
      rank: index + 1,
      deltas: {
        guessPoints: this.getGuessPoints(entry.userId),
        votingBonus: (this.state.playerStates.get(entry.userId)?.votingAccuracy ?? 0) * IC_VOTING_ACCURACY_BONUS,
      },
    }));
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Self-Aware: first player to guess correctly (earliest turnIndex)
    const correctGuesses = this.state.guessResults
      .filter((g) => g.correct && g.turnIndex >= 0)
      .sort((a, b) => a.turnIndex - b.turnIndex);
    if (correctGuesses.length > 0) {
      const first = correctGuesses[0];
      awards.push({
        userId: first.userId,
        title: 'Self-Aware',
        description: `Guessed their identity first (turn ${first.turnIndex + 1})`,
        icon: 'eye',
      });
    }

    // Master of Disguise: last to guess correctly or didn't guess correctly at all
    const allPlayerIds = Array.from(this.state.playerStates.keys());
    const neverGuessed = allPlayerIds.filter((id) => {
      const ps = this.state.playerStates.get(id)!;
      return !ps.guessedCorrectly;
    });
    if (neverGuessed.length > 0) {
      // Pick the one with the most questions asked (most involved)
      const disguiseWinner = neverGuessed[0];
      awards.push({
        userId: disguiseWinner,
        title: 'Master of Disguise',
        description: 'Never correctly guessed their identity',
        icon: 'ghost',
      });
    } else if (correctGuesses.length > 0) {
      // Everyone guessed correctly — last to do so
      const allCorrect = this.state.guessResults
        .filter((g) => g.correct)
        .sort((a, b) => {
          // Final guesses (turnIndex=-1) are last, then by turnIndex descending
          if (a.turnIndex === -1 && b.turnIndex !== -1) return 1;
          if (b.turnIndex === -1 && a.turnIndex !== -1) return -1;
          if (a.turnIndex === -1 && b.turnIndex === -1) return 0;
          return b.turnIndex - a.turnIndex;
        });
      const last = allCorrect[0];
      awards.push({
        userId: last.userId,
        title: 'Master of Disguise',
        description: 'Last to correctly guess their identity',
        icon: 'ghost',
      });
    }

    // Philosopher: most decisive questions (lowest % of Maybe votes on their questions)
    const questionsByAsker = new Map<string, { total: number; maybes: number }>();
    for (const q of this.state.questionHistory) {
      const existing = questionsByAsker.get(q.askerId) ?? { total: 0, maybes: 0 };
      existing.total += q.tally.yes + q.tally.no + q.tally.maybe;
      existing.maybes += q.tally.maybe;
      questionsByAsker.set(q.askerId, existing);
    }
    let bestPhilosopher: { userId: string; maybeRate: number } | null = null;
    for (const [userId, stats] of questionsByAsker) {
      if (stats.total === 0) continue;
      const maybeRate = stats.maybes / stats.total;
      if (!bestPhilosopher || maybeRate < bestPhilosopher.maybeRate) {
        bestPhilosopher = { userId, maybeRate };
      }
    }
    if (bestPhilosopher) {
      awards.push({
        userId: bestPhilosopher.userId,
        title: 'Philosopher',
        description: 'Asked the most decisive questions',
        icon: 'brain',
      });
    }

    // Crowd Pleaser: highest voting accuracy (most votes matching majority)
    let bestAccuracy: { userId: string; accuracy: number; total: number } | null = null;
    for (const [userId, ps] of this.state.playerStates) {
      if (ps.totalVotesCast === 0) continue;
      const accuracy = ps.votingAccuracy / ps.totalVotesCast;
      if (
        !bestAccuracy ||
        accuracy > bestAccuracy.accuracy ||
        (accuracy === bestAccuracy.accuracy && ps.totalVotesCast > bestAccuracy.total)
      ) {
        bestAccuracy = { userId, accuracy, total: ps.totalVotesCast };
      }
    }
    if (bestAccuracy) {
      awards.push({
        userId: bestAccuracy.userId,
        title: 'Crowd Pleaser',
        description: `${Math.round(bestAccuracy.accuracy * 100)}% voting accuracy`,
        icon: 'check-circle',
      });
    }

    // Bold Move: made an early guess (first one)
    const earlyGuessers = this.state.guessResults.filter((g) => g.turnIndex >= 0);
    if (earlyGuessers.length > 0) {
      const boldPlayer = earlyGuessers.sort((a, b) => a.turnIndex - b.turnIndex)[0];
      awards.push({
        userId: boldPlayer.userId,
        title: 'Bold Move',
        description: `Made an early guess on turn ${boldPlayer.turnIndex + 1}`,
        icon: 'zap',
      });
    }

    return awards;
  }

  // ─── State Accessors (Masking) ───────────────────────────────

  /**
   * Return game state for a specific player.
   * CRITICAL: NEVER include the player's own identity except in RESULTS phase.
   */
  getStateForPlayer(userId: string): unknown {
    const ps = this.state.playerStates.get(userId);
    if (!ps) return { phase: this.state.phase };

    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      scores: this.buildScoresMap(),
      eliminated: ps.eliminated,
      guessedCorrectly: ps.guessedCorrectly,
      questionHistory: this.buildQuestionHistoryForPlayer(userId),
    };

    switch (this.state.phase) {
      case 'ASSIGNMENT_REVEAL':
        return {
          ...base,
          otherIdentities: this.buildOtherIdentitiesMap(userId),
        };

      case 'ASK': {
        const q = this.state.currentQuestion;
        const isAsker = q?.askerId === userId;
        return {
          ...base,
          otherIdentities: this.buildOtherIdentitiesMap(userId),
          currentQuestion: q
            ? {
                askerId: q.askerId,
                askerName: q.askerName,
                question: q.question,
                // Asker does NOT see their own identity
                ...(isAsker
                  ? {}
                  : { askerIdentity: this.state.playerStates.get(q.askerId)?.identity.name }),
                isAsker,
              }
            : null,
        };
      }

      case 'VOTE': {
        const q = this.state.currentQuestion;
        const isAsker = q?.askerId === userId;
        const hasVoted = q?.votes.has(userId) ?? false;
        return {
          ...base,
          otherIdentities: this.buildOtherIdentitiesMap(userId),
          currentQuestion: q
            ? {
                askerId: q.askerId,
                askerName: q.askerName,
                question: q.question,
                ...(isAsker
                  ? {}
                  : { askerIdentity: this.state.playerStates.get(q.askerId)?.identity.name }),
                isAsker,
                hasVoted,
                voteCount: q.votes.size,
                totalEligible: this.getEligibleVoterCount(),
              }
            : null,
        };
      }

      case 'VOTE_RESULTS': {
        const q = this.state.currentQuestion;
        const isAsker = q?.askerId === userId;
        return {
          ...base,
          otherIdentities: this.buildOtherIdentitiesMap(userId),
          currentQuestion: q
            ? {
                askerId: q.askerId,
                askerName: q.askerName,
                question: q.question,
                ...(isAsker
                  ? {}
                  : { askerIdentity: this.state.playerStates.get(q.askerId)?.identity.name }),
                isAsker,
                result: q.result,
                tally: q.tally,
              }
            : null,
        };
      }

      case 'FINAL_GUESS':
        return {
          ...base,
          otherIdentities: this.buildOtherIdentitiesMap(userId),
          alreadyGuessed: ps.guessedCorrectly,
          finalGuessSubmitted: ps.finalGuess !== null,
        };

      case 'RESULTS':
        // RESULTS phase: reveal everything including own identity
        return {
          ...base,
          myIdentity: ps.identity.name,
          myIdentityCategory: ps.identity.category,
          allIdentities: this.buildAllIdentitiesMap(),
          guessResults: this.state.guessResults,
        };

      default:
        return base;
    }
  }

  /**
   * Return full omniscient state for spectators.
   * Spectators see ALL identities, individual vote attribution, and all guesses.
   */
  getStateForSpectator(): unknown {
    const allIdentities = this.buildAllIdentitiesMap();

    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      scores: this.buildScoresMap(),
      allIdentities,
      questionHistory: this.buildFullQuestionHistory(),
      guessResults: this.state.guessResults,
    };

    if (this.state.currentQuestion) {
      const q = this.state.currentQuestion;
      const askerState = this.state.playerStates.get(q.askerId);
      return {
        ...base,
        currentQuestion: {
          askerId: q.askerId,
          askerName: q.askerName,
          askerIdentity: askerState?.identity.name,
          question: q.question,
          votes: Object.fromEntries(q.votes),
          result: q.result,
          tally: q.tally,
        },
      };
    }

    return base;
  }

  // ─── Player Lifecycle ────────────────────────────────────────

  /**
   * Handle player disconnect mid-game.
   * - ASK phase: if the asker disconnects, skip to next turn
   * - VOTE phase: exclude from count; if all connected voters done, end vote
   */
  handlePlayerDisconnect(userId: string): void {
    logger.info({
      event: 'identity_crisis:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });

    if (this.state.phase === 'ASK' && this.state.currentQuestion?.askerId === userId) {
      // Asker disconnected — skip their turn
      if (this.state.currentQuestion.question === '') {
        this.clearPhaseTimer();
        this.startNextQuestionTurn();
      }
    }

    if (this.state.phase === 'VOTE') {
      // Check if all remaining connected voters have voted
      const eligibleVoters = this.getEligibleVoterCount();
      const currentVotes = this.state.currentQuestion?.votes.size ?? 0;
      if (currentVotes >= eligibleVoters) {
        this.endVotePhase();
      }
    }
  }

  /**
   * Handle player reconnect — send them the full masked state snapshot.
   */
  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForPlayer(userId),
    );

    logger.info({
      event: 'identity_crisis:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });
  }

  // ─── Helper Methods ──────────────────────────────────────────

  /**
   * Build a map of userId → { name, category } for all players EXCEPT the given userId.
   * This enforces the core masking rule.
   */
  private buildOtherIdentitiesMap(excludeUserId: string): Record<string, { name: string; category: string }> {
    const result: Record<string, { name: string; category: string }> = {};
    for (const [userId, ps] of this.state.playerStates) {
      if (userId === excludeUserId) continue;
      result[userId] = {
        name: ps.identity.name,
        category: ps.identity.category,
      };
    }
    return result;
  }

  /**
   * Build a map of userId → { name, category } for ALL players (spectator/results view).
   */
  private buildAllIdentitiesMap(): Record<string, { name: string; category: string; userName: string }> {
    const result: Record<string, { name: string; category: string; userName: string }> = {};
    for (const [userId, ps] of this.state.playerStates) {
      result[userId] = {
        name: ps.identity.name,
        category: ps.identity.category,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
      };
    }
    return result;
  }

  /**
   * Build question history visible to a specific player (no identity for self-questions).
   */
  private buildQuestionHistoryForPlayer(userId: string): unknown[] {
    return this.state.questionHistory.map((q) => {
      const isAsker = q.askerId === userId;
      return {
        askerId: q.askerId,
        askerName: q.askerName,
        question: q.question,
        result: q.result,
        tally: q.tally,
        ...(isAsker
          ? {}
          : { askerIdentity: this.state.playerStates.get(q.askerId)?.identity.name }),
      };
    });
  }

  /**
   * Build full question history with all details (for spectators and results).
   */
  private buildFullQuestionHistory(): unknown[] {
    return this.state.questionHistory.map((q) => ({
      askerId: q.askerId,
      askerName: q.askerName,
      askerIdentity: this.state.playerStates.get(q.askerId)?.identity.name,
      question: q.question,
      result: q.result,
      tally: q.tally,
      totalVoters: q.votes.size,
    }));
  }

  /** Build a scores map of userId → score for broadcasts. */
  private buildScoresMap(): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const [userId, ps] of this.state.playerStates) {
      scores[userId] = ps.score;
    }
    return scores;
  }

  /** Get the number of connected players eligible to vote (excluding the asker). */
  private getEligibleVoterCount(): number {
    let count = 0;
    for (const [userId, player] of this.context.players) {
      if (userId === this.state.currentQuestion?.askerId) continue;
      if (!player.isConnected) continue;
      if (!this.state.playerStates.has(userId)) continue;
      count++;
    }
    return count;
  }

  /** Get the number of players who haven't guessed or been eliminated. */
  private getRemainingGuessersCount(): number {
    let count = 0;
    for (const [, ps] of this.state.playerStates) {
      if (!ps.eliminated && !ps.guessedCorrectly) count++;
    }
    return count;
  }

  /** Check if all eligible players have submitted their final guess. */
  private allFinalGuessesSubmitted(): boolean {
    for (const [userId, ps] of this.state.playerStates) {
      if (ps.guessedCorrectly) continue; // Already correct via early guess
      const player = this.context.players.get(userId);
      if (!player?.isConnected) continue; // Skip disconnected
      if (ps.finalGuess === null) return false;
    }
    return true;
  }

  /** Get the total guess points for a player (from guessResults). */
  private getGuessPoints(userId: string): number {
    return this.state.guessResults
      .filter((g) => g.userId === userId)
      .reduce((sum, g) => sum + g.points, 0);
  }

  /**
   * Fuzzy match a guess against an identity using fuse.js.
   * Returns true if the guess is close enough to the identity name.
   */
  private fuzzyMatchIdentity(guess: string, identity: Identity): boolean {
    const results = this.fuseMatcher.search(guess);
    if (results.length === 0) return false;

    // Check if the top match is the player's actual identity
    const topMatch = results[0];
    return topMatch.item.id === identity.id && (topMatch.score ?? 1) <= IC_GUESS_MATCH_THRESHOLD;
  }

  // ─── Game Log ────────────────────────────────────────────────

  /** Append an entry to the action log. */
  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  /** Build the GameLog structure for history replay. */
  private buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    return {
      minigameId: 'identity-crisis',
      version: 1,
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      playerCount: this.context.players.size,
      players,
      initialState: {
        questionsPerPlayer: this.state.totalRounds,
        askDuration: this.getSetting<number>('askDuration', IC_ASK_SECONDS),
        voteDuration: this.getSetting<number>('voteDuration', IC_VOTE_SECONDS),
        finalGuessDuration: this.getSetting<number>('finalGuessDuration', IC_FINAL_GUESS_SECONDS),
        identities: this.buildAllIdentitiesMap(),
      },
      actions: this.state.actionLog,
      finalResults: Array.from(this.state.playerStates.entries()).map(([userId, ps]) => ({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        score: ps.score,
        rank: 0, // Filled in by caller or via computeRankings
      })),
    };
  }
}
