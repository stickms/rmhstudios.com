/**
 * RMHbox — Sequence Sam Minigame Server Handler
 *
 * Players observe a growing sequence of tile flashes on a 3×3 grid,
 * then must repeat the sequence from memory. Every nth round is a
 * "Chaos Round" where the grid rotates 90° clockwise after the pattern
 * is shown, remapping expected input positions.
 *
 * Elimination via a strike system: 3 wrong answers → out. Last player
 * standing wins. Grace Rule: if ALL active players fail a round, no one
 * is eliminated.
 *
 * Phases per round:
 *   PATTERN_DISPLAY → INPUT → ROUND_RESULTS → TRANSITION → (next round or GAME_OVER)
 *
 * Join-in-progress policy: spectate_only
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §1
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { SSTapSchema } from '@/lib/rmhbox/sequence-sam/schemas';
import {
  SS_MAX_ROUNDS,
  SS_STARTING_LENGTH,
  SS_MAX_STRIKES,
  SS_CHAOS_INTERVAL,
  SS_TILE_FLASH_DURATION_MS,
  SS_TILE_GAP_MS,
  SS_INPUT_TIME_PER_STEP_MS,
  SS_ROUND_RESULTS_SECONDS,
  SS_TRANSITION_SECONDS,
  SS_SURVIVE_POINTS,
  SS_PERFECT_ROUND_BONUS,
  SS_CHAOS_SURVIVE_BONUS,
  SS_SPEED_BONUS_PER_MS,
  SS_WINNER_BONUS,
  SS_PLACEMENT_POINTS,
  SS_GRID_SIZE,
  SS_ENABLE_CHAOS,
  ROTATION_MAP_CW,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  SSPhase,
  SSPlayerState,
  SequenceSamState,
  SSRoundSurvivor,
  SSRoundEliminated,
  ActionLogEntry,
} from './types';

// ─── Sequence Sam Minigame ───────────────────────────────────────

export class SequenceSamGame extends BaseMinigame {
  private state!: SequenceSamState;
  private startedAt: number = 0;
  private actionLog: ActionLogEntry[] = [];
  private actionSeq = 0;

  /** Per-player chaos round survival count (for awards). */
  private chaosRoundsSurvived: Map<string, number> = new Map();
  /** Per-player perfect round count (for awards). */
  private perfectRounds: Map<string, number> = new Map();
  /** Per-player total completion times (for speed award). */
  private completionTimes: Map<string, number[]> = new Map();
  /** Track if player survived a round with 1 strike remaining. */
  private ironWillPlayers: Set<string> = new Set();

  /**
   * Spectators see an omniscient view with all players' input progress,
   * since individual player state (input index) is hidden between players.
   */
  get spectatorMode(): 'shared-privileged' { return 'shared-privileged'; }

  constructor(context: MinigameContext) {
    super(context);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.initializeState();

    logger.info({
      event: 'sequence_sam:start',
      lobbyId: this.context.lobbyId,
      maxRounds: this.state.maxRounds,
      playerCount: this.context.players.size,
    });

    this.startNextRound();
  }

  private initializeState(): void {
    const maxStrikes = this.getSetting('maxStrikes', SS_MAX_STRIKES);
    const playerStates = new Map<string, SSPlayerState>();
    const activePlayers: string[] = [];

    for (const [userId] of this.context.players) {
      playerStates.set(userId, {
        userId,
        strikesRemaining: maxStrikes,
        isEliminated: false,
        eliminatedOnRound: null,
        currentInputIndex: 0,
        hasCompletedSequence: false,
        hasFailed: false,
        failedAtIndex: null,
        inputStartedAt: null,
        completedAt: null,
        totalScore: 0,
        roundScore: 0,
      });
      activePlayers.push(userId);
      this.chaosRoundsSurvived.set(userId, 0);
      this.perfectRounds.set(userId, 0);
      this.completionTimes.set(userId, []);
    }

    this.state = {
      currentRound: 0,
      maxRounds: this.getSetting('maxRounds', SS_MAX_ROUNDS),
      sequence: [],
      rotatedSequence: null,
      isChaosRound: false,
      phase: 'PATTERN_DISPLAY' as SSPhase,
      playerStates,
      eliminatedPlayers: [],
      activePlayers,
      phaseStartedAt: Date.now(),
      phaseEndsAt: Date.now(),
      currentDisplayStep: 0,
    };
  }

  // ─── Sequence Generation ─────────────────────────────────────

  private extendSequence(): void {
    const startingLength = this.getSetting('startingLength', SS_STARTING_LENGTH);
    const enableChaos = this.getSetting('enableChaosRounds', SS_ENABLE_CHAOS);
    const chaosInterval = this.getSetting('chaosInterval', SS_CHAOS_INTERVAL);

    if (this.state.sequence.length === 0) {
      // Generate initial sequence
      for (let i = 0; i < startingLength; i++) {
        let pos: number;
        do {
          pos = Math.floor(Math.random() * SS_GRID_SIZE);
        } while (
          this.state.sequence.length > 0 &&
          this.state.sequence[this.state.sequence.length - 1] === pos
        );
        this.state.sequence.push(pos);
      }
    } else {
      // Extend by one
      let pos: number;
      do {
        pos = Math.floor(Math.random() * SS_GRID_SIZE);
      } while (pos === this.state.sequence[this.state.sequence.length - 1]);
      this.state.sequence.push(pos);
    }

    // Chaos round logic
    if (enableChaos && this.state.currentRound % chaosInterval === 0 && this.state.currentRound > 0) {
      this.state.isChaosRound = true;
      this.state.rotatedSequence = this.state.sequence.map((p) => ROTATION_MAP_CW[p]);
    } else {
      this.state.isChaosRound = false;
      this.state.rotatedSequence = null;
    }
  }

  // ─── Round Lifecycle ─────────────────────────────────────────

  private startNextRound(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;

    // End conditions
    if (
      this.state.currentRound > this.state.maxRounds ||
      this.state.activePlayers.length <= 1
    ) {
      // If exactly 1 player left, award winner bonus
      if (this.state.activePlayers.length === 1) {
        const winnerId = this.state.activePlayers[0];
        const winnerState = this.state.playerStates.get(winnerId);
        if (winnerState) {
          winnerState.totalScore += SS_WINNER_BONUS;
        }
      }
      this.endGame();
      return;
    }

    this.extendSequence();

    // Reset each active player's round state
    for (const userId of this.state.activePlayers) {
      const ps = this.state.playerStates.get(userId);
      if (ps) {
        ps.currentInputIndex = 0;
        ps.hasCompletedSequence = false;
        ps.hasFailed = false;
        ps.failedAtIndex = null;
        ps.roundScore = 0;
        ps.inputStartedAt = null;
        ps.completedAt = null;
      }
    }

    this.state.phase = 'PATTERN_DISPLAY';
    this.state.currentDisplayStep = 0;

    this.logAction('round_start', {
      round: this.state.currentRound,
      sequenceLength: this.state.sequence.length,
      sequence: [...this.state.sequence],
    });

    logger.info({
      event: 'sequence_sam:round_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      sequenceLength: this.state.sequence.length,
      isChaosRound: this.state.isChaosRound,
    });

    // Broadcast sub-round to the footer counter
    this.broadcastRound(this.state.currentRound, this.state.maxRounds);

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'SS_ROUND_START',
      round: this.state.currentRound,
      sequenceLength: this.state.sequence.length,
      isChaosRound: this.state.isChaosRound,
    });

    this.displayPattern();
  }

  private displayPattern(): void {
    if (!this.isRunning) return;

    const seq = this.state.sequence;
    const stepDuration = SS_TILE_FLASH_DURATION_MS + SS_TILE_GAP_MS;

    // Emit each step one at a time with proper timing
    for (let i = 0; i < seq.length; i++) {
      this.setTimeout(() => {
        if (!this.isRunning) return;
        this.state.currentDisplayStep = i;
        this.context.broadcastToLobby('rmhbox:game:action', {
          type: 'SS_PATTERN_STEP',
          step: i,
          position: seq[i],
          totalSteps: seq.length,
        });
      }, i * stepDuration);
    }

    // After all steps displayed + last tile's display time
    const totalDisplayTime = seq.length * stepDuration;

    this.setTimeout(() => {
      if (!this.isRunning) return;

      if (this.state.isChaosRound) {
        this.context.broadcastToLobby('rmhbox:game:action', {
          type: 'SS_GRID_ROTATE',
          degrees: 90,
        });

        this.logAction('chaos_rotation', {
          round: this.state.currentRound,
          rotationType: '90_cw',
          mapping: { ...ROTATION_MAP_CW },
        });

        // Wait 500ms for rotation animation
        this.setTimeout(() => {
          if (!this.isRunning) return;
          this.context.broadcastToLobby('rmhbox:game:action', {
            type: 'SS_PATTERN_COMPLETE',
            rotated: true,
          });
          this.startInputPhase();
        }, 500);
      } else {
        this.context.broadcastToLobby('rmhbox:game:action', {
          type: 'SS_PATTERN_COMPLETE',
          rotated: false,
        });
        this.startInputPhase();
      }
    }, totalDisplayTime);
  }

  private startInputPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'INPUT';
    const inputTime = this.state.sequence.length * SS_INPUT_TIME_PER_STEP_MS;
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + inputTime;

    // Record input start for each active player
    for (const userId of this.state.activePlayers) {
      const ps = this.state.playerStates.get(userId);
      if (ps) {
        ps.inputStartedAt = now;
      }
    }

    // Drive the header timer
    this.startPhaseTimer(Math.ceil(inputTime / 1000));

    // Schedule end of input phase
    this.setTimeout(() => this.endInputPhase(), inputTime);

    logger.info({
      event: 'sequence_sam:input_phase_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      inputTimeMs: inputTime,
    });
  }

  private endInputPhase(): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    // Mark any active player who hasn't completed or failed as timed out (failed)
    for (const userId of this.state.activePlayers) {
      const ps = this.state.playerStates.get(userId);
      if (ps && !ps.hasCompletedSequence && !ps.hasFailed) {
        ps.hasFailed = true;
        ps.failedAtIndex = ps.currentInputIndex;
      }
    }

    this.processRoundResults();
  }

  private processRoundResults(): void {
    if (!this.isRunning) return;

    this.state.phase = 'ROUND_RESULTS';

    // Check Grace Rule: if ALL active players failed, no one is eliminated
    const allFailed = this.state.activePlayers.every((uid) => {
      const ps = this.state.playerStates.get(uid);
      return ps && ps.hasFailed;
    });

    const survivors: SSRoundSurvivor[] = [];
    const eliminated: SSRoundEliminated[] = [];
    const eliminatedThisRound: string[] = [];

    for (const userId of [...this.state.activePlayers]) {
      const ps = this.state.playerStates.get(userId)!;
      const player = this.context.players.get(userId);
      const userName = player?.userName ?? 'Unknown';

      if (ps.hasCompletedSequence) {
        // Survived
        ps.roundScore += SS_SURVIVE_POINTS;

        if (!ps.hasFailed) {
          // Perfect (no wrong taps at all)
          ps.roundScore += SS_PERFECT_ROUND_BONUS;
          this.perfectRounds.set(userId, (this.perfectRounds.get(userId) ?? 0) + 1);
        }

        if (this.state.isChaosRound) {
          ps.roundScore += SS_CHAOS_SURVIVE_BONUS;
          this.chaosRoundsSurvived.set(userId, (this.chaosRoundsSurvived.get(userId) ?? 0) + 1);
        }

        // Speed bonus
        if (ps.completedAt && this.state.phaseEndsAt) {
          const msRemaining = Math.max(0, this.state.phaseEndsAt - ps.completedAt);
          ps.roundScore += Math.floor(msRemaining * SS_SPEED_BONUS_PER_MS);
          this.completionTimes.get(userId)?.push(ps.completedAt - (ps.inputStartedAt ?? ps.completedAt));
        }

        ps.totalScore += ps.roundScore;

        // Track iron will
        if (ps.strikesRemaining === 1) {
          this.ironWillPlayers.add(userId);
        }

        survivors.push({
          userId,
          userName,
          roundScore: ps.roundScore,
          strikesRemaining: ps.strikesRemaining,
          isPerfect: !ps.hasFailed,
          completionTimeMs: ps.completedAt && ps.inputStartedAt
            ? ps.completedAt - ps.inputStartedAt
            : null,
        });
      } else {
        // Failed
        if (!allFailed) {
          ps.strikesRemaining--;

          if (ps.strikesRemaining <= 0) {
            ps.isEliminated = true;
            ps.eliminatedOnRound = this.state.currentRound;
            eliminatedThisRound.push(userId);
          }
        }
        // Grace rule: if all failed, no strike deduction (already handled by !allFailed check)
      }
    }

    // Process eliminations
    for (const userId of eliminatedThisRound) {
      this.state.activePlayers = this.state.activePlayers.filter((id) => id !== userId);
      this.state.eliminatedPlayers.push(userId);

      const ps = this.state.playerStates.get(userId)!;
      const player = this.context.players.get(userId);
      const userName = player?.userName ?? 'Unknown';
      const totalPlayers = this.context.players.size;
      // Rank: higher = earlier elimination
      const rank = totalPlayers - this.state.eliminatedPlayers.length + 1;

      const placementPoints = SS_PLACEMENT_POINTS * rank;
      ps.totalScore += placementPoints;

      eliminated.push({
        userId,
        userName,
        finalRank: rank,
        placementPoints,
      });

      this.logAction('elimination', {
        userId,
        round: this.state.currentRound,
        placement: rank,
      });

      this.context.broadcastToLobby('rmhbox:game:action', {
        type: 'SS_ELIMINATION',
        userId,
        userName,
        finalRank: rank,
      });
    }

    this.logAction('round_result', {
      round: this.state.currentRound,
      correct: survivors.map((s) => s.userId),
      failed: this.state.activePlayers
        .filter((uid) => {
          const ps = this.state.playerStates.get(uid);
          return ps && ps.hasFailed && !ps.hasCompletedSequence;
        })
        .concat(eliminatedThisRound),
      strikes: Object.fromEntries(
        [...this.state.playerStates.entries()].map(([uid, ps]) => [uid, ps.strikesRemaining]),
      ),
    });

    logger.info({
      event: 'sequence_sam:round_results',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      survivors: survivors.length,
      eliminated: eliminated.length,
      graceRule: allFailed,
      activePlayers: this.state.activePlayers.length,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'SS_ROUND_RESULTS',
      survivors,
      eliminated,
      roundNumber: this.state.currentRound,
      graceRule: allFailed,
    });

    // Check end conditions
    if (this.state.activePlayers.length <= 1) {
      if (this.state.activePlayers.length === 1) {
        const winnerId = this.state.activePlayers[0];
        const winnerState = this.state.playerStates.get(winnerId);
        if (winnerState) {
          winnerState.totalScore += SS_WINNER_BONUS;
        }
      }
      this.setTimeout(() => this.endGame(), SS_ROUND_RESULTS_SECONDS * 1000);
    } else {
      this.setTimeout(() => this.startTransition(), SS_ROUND_RESULTS_SECONDS * 1000);
    }
  }

  private startTransition(): void {
    if (!this.isRunning) return;
    this.state.phase = 'TRANSITION';
    this.setTimeout(() => this.startNextRound(), SS_TRANSITION_SECONDS * 1000);
  }

  private endGame(): void {
    if (!this.isRunning) return;
    this.state.phase = 'GAME_OVER';

    this.logAction('game_end', {
      winner: this.state.activePlayers[0] ?? null,
      finalPlacements: this.computeRankings().map((r) => ({
        userId: r.userId,
        placement: r.rank,
        score: r.score,
      })),
    });

    logger.info({
      event: 'sequence_sam:game_end',
      lobbyId: this.context.lobbyId,
      rounds: this.state.currentRound,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'SS_GAME_OVER',
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (action !== 'SS_TAP') return;
    if (this.state.phase !== 'INPUT') return;
    if (!this.state.activePlayers.includes(userId)) return;

    const ps = this.state.playerStates.get(userId);
    if (!ps || ps.isEliminated) return;
    if (ps.hasCompletedSequence || ps.hasFailed) return;

    const parsed = SSTapSchema.safeParse(data);
    if (!parsed.success) return;

    const { position } = parsed.data;

    // Determine expected position
    const expectedSequence = this.state.isChaosRound && this.state.rotatedSequence
      ? this.state.rotatedSequence
      : this.state.sequence;
    const expectedPosition = expectedSequence[ps.currentInputIndex];

    if (position === expectedPosition) {
      // Correct tap
      ps.currentInputIndex++;
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'SS_TAP_RESULT',
        position,
        correct: true,
        currentIndex: ps.currentInputIndex,
        sequenceLength: this.state.sequence.length,
      });

      if (ps.currentInputIndex === this.state.sequence.length) {
        ps.hasCompletedSequence = true;
        ps.completedAt = Date.now();
        const player = this.context.players.get(userId);
        const timeMs = ps.completedAt - (ps.inputStartedAt ?? ps.completedAt);

        this.context.broadcastToLobby('rmhbox:game:action', {
          type: 'SS_PLAYER_COMPLETE',
          userId,
          userName: player?.userName ?? 'Unknown',
          timeMs,
        });

        this.checkAllFinished();
      }
    } else {
      // Incorrect tap
      ps.hasFailed = true;
      ps.failedAtIndex = ps.currentInputIndex;
      const player = this.context.players.get(userId);

      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'SS_TAP_RESULT',
        position,
        correct: false,
        currentIndex: ps.currentInputIndex,
        sequenceLength: this.state.sequence.length,
      });

      this.context.broadcastToLobby('rmhbox:game:action', {
        type: 'SS_PLAYER_FAILED',
        userId,
        userName: player?.userName ?? 'Unknown',
        failedAtIndex: ps.currentInputIndex,
      });

      this.checkAllFinished();
    }
  }

  /** If all active players have completed or failed, end input phase early. */
  private checkAllFinished(): void {
    const allDone = this.state.activePlayers.every((uid) => {
      const ps = this.state.playerStates.get(uid);
      return ps && (ps.hasCompletedSequence || ps.hasFailed);
    });
    if (allDone) {
      this.endInputPhase();
    }
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const ps = this.state.playerStates.get(userId);
    const scores = this.buildScoresArray();

    const otherPlayers = this.state.activePlayers
      .filter((uid) => uid !== userId)
      .map((uid) => {
        const ops = this.state.playerStates.get(uid)!;
        const p = this.context.players.get(uid);
        return {
          userId: uid,
          userName: p?.userName ?? 'Unknown',
          hasCompleted: ops.hasCompletedSequence,
          hasFailed: ops.hasFailed,
          strikesRemaining: ops.strikesRemaining,
          isEliminated: ops.isEliminated,
        };
      });

    const base = {
      currentRound: this.state.currentRound,
      isChaosRound: this.state.isChaosRound,
      sequenceLength: this.state.sequence.length,
      phase: this.state.phase,
      scores,
      otherPlayers,
    };

    if (this.state.phase === 'PATTERN_DISPLAY') {
      return {
        ...base,
        currentDisplayStep: this.state.currentDisplayStep,
        myStrikesRemaining: ps?.strikesRemaining ?? 0,
      };
    }

    if (this.state.phase === 'INPUT') {
      return {
        ...base,
        timeRemaining: Math.max(0, this.state.phaseEndsAt - Date.now()),
        myInputIndex: ps?.currentInputIndex ?? 0,
        myHasCompleted: ps?.hasCompletedSequence ?? false,
        myHasFailed: ps?.hasFailed ?? false,
        myStrikesRemaining: ps?.strikesRemaining ?? 0,
      };
    }

    // ROUND_RESULTS, TRANSITION, GAME_OVER
    return {
      ...base,
      myStrikesRemaining: ps?.strikesRemaining ?? 0,
      myIsEliminated: ps?.isEliminated ?? false,
      myTotalScore: ps?.totalScore ?? 0,
    };
  }

  getStateForSpectator(): unknown {
    const scores = this.buildScoresArray();

    const allPlayers = [...this.state.playerStates.entries()].map(([uid, ps]) => {
      const p = this.context.players.get(uid);
      return {
        userId: uid,
        userName: p?.userName ?? 'Unknown',
        currentInputIndex: ps.currentInputIndex,
        hasCompleted: ps.hasCompletedSequence,
        hasFailed: ps.hasFailed,
        strikesRemaining: ps.strikesRemaining,
        isEliminated: ps.isEliminated,
      };
    });

    return {
      currentRound: this.state.currentRound,
      isChaosRound: this.state.isChaosRound,
      sequenceLength: this.state.sequence.length,
      phase: this.state.phase,
      currentDisplayStep: this.state.currentDisplayStep,
      timeRemaining: this.state.phase === 'INPUT'
        ? Math.max(0, this.state.phaseEndsAt - Date.now())
        : 0,
      allPlayers,
      scores,
    };
  }

  private buildScoresArray(): Array<{ userId: string; userName: string; score: number }> {
    return [...this.state.playerStates.entries()].map(([uid, ps]) => {
      const p = this.context.players.get(uid);
      return {
        userId: uid,
        userName: p?.userName ?? 'Unknown',
        score: ps.totalScore,
      };
    });
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(userId: string): void {
    // spectate_only: JIP players get spectator state
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );
  }

  handlePlayerDisconnect(userId: string): void {
    // If INPUT phase and player hasn't completed/failed → they'll timeout at phase end
    logger.info({
      event: 'sequence_sam:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
    });
  }

  handlePlayerReconnect(userId: string): void {
    // State snapshot delivery is handled centrally by ReconnectionHandler
    // via buildReconnectionSnapshot(). Only logging here.
    const ps = this.state.playerStates.get(userId);

    logger.info({
      event: 'sequence_sam:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
      isEliminated: ps?.isEliminated ?? false,
    });
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        totalRounds: this.state.currentRound,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    for (const [userId, ps] of this.state.playerStates) {
      const player = this.context.players.get(userId);
      entries.push({
        userId,
        userName: player?.userName ?? 'Unknown',
        score: ps.totalScore,
        rank: 0,
        deltas: {},
      });
    }

    // Sort: active players first (by score desc), then eliminated (later elimination = higher rank)
    entries.sort((a, b) => {
      const aPs = this.state.playerStates.get(a.userId)!;
      const bPs = this.state.playerStates.get(b.userId)!;

      // Active players ranked higher than eliminated
      if (!aPs.isEliminated && bPs.isEliminated) return -1;
      if (aPs.isEliminated && !bPs.isEliminated) return 1;

      // Both active or both eliminated — sort by score desc
      if (b.score !== a.score) return b.score - a.score;

      // Tie-break for eliminated: later elimination = higher rank
      if (aPs.isEliminated && bPs.isEliminated) {
        return (bPs.eliminatedOnRound ?? 0) - (aPs.eliminatedOnRound ?? 0);
      }

      return 0;
    });

    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Memory Master — last player standing (winner)
    if (this.state.activePlayers.length === 1) {
      const winnerId = this.state.activePlayers[0];
      const player = this.context.players.get(winnerId);
      awards.push({
        userId: winnerId,
        title: 'Memory Master',
        description: 'Last player standing',
        icon: 'brain',
      });
      void player; // appease unused
    }

    // Perfect Memory — most perfect (no-mistake) rounds
    let maxPerfect = 0;
    let perfectUserId: string | null = null;
    for (const [userId, count] of this.perfectRounds) {
      if (count > maxPerfect) {
        maxPerfect = count;
        perfectUserId = userId;
      }
    }
    if (perfectUserId && maxPerfect > 0) {
      awards.push({
        userId: perfectUserId,
        title: 'Perfect Memory',
        description: `${maxPerfect} perfect round${maxPerfect > 1 ? 's' : ''}`,
        icon: 'check-circle',
      });
    }

    // Chaos Survivor — survived the most Chaos Rounds
    let maxChaos = 0;
    let chaosUserId: string | null = null;
    for (const [userId, count] of this.chaosRoundsSurvived) {
      if (count > maxChaos) {
        maxChaos = count;
        chaosUserId = userId;
      }
    }
    if (chaosUserId && maxChaos > 0) {
      awards.push({
        userId: chaosUserId,
        title: 'Chaos Survivor',
        description: `Survived ${maxChaos} chaos round${maxChaos > 1 ? 's' : ''}`,
        icon: 'rotate-ccw',
      });
    }

    // Speed Demon — fastest average completion time
    let bestAvg = Infinity;
    let speedUserId: string | null = null;
    for (const [userId, times] of this.completionTimes) {
      if (times.length === 0) continue;
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      if (avg < bestAvg) {
        bestAvg = avg;
        speedUserId = userId;
      }
    }
    if (speedUserId && bestAvg < Infinity) {
      awards.push({
        userId: speedUserId,
        title: 'Speed Demon',
        description: `Average completion: ${Math.round(bestAvg)}ms`,
        icon: 'zap',
      });
    }

    // Iron Will — survived a round with 1 strike remaining
    for (const userId of this.ironWillPlayers) {
      awards.push({
        userId,
        title: 'Iron Will',
        description: 'Survived a round with 1 strike left',
        icon: 'shield',
      });
      break; // Only one award
    }

    return awards;
  }

  // ─── Action Log / Game Log ───────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.actionLog.push({
      seq: ++this.actionSeq,
      type,
      timestamp: Date.now(),
      payload,
    });
  }

  private buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      totalRounds: this.state.currentRound,
      playerCount: this.context.players.size,
      players,
      initialState: {
        gridSize: SS_GRID_SIZE,
        maxStrikes: this.getSetting('maxStrikes', SS_MAX_STRIKES),
        chaosInterval: this.getSetting('chaosInterval', SS_CHAOS_INTERVAL),
        playerCount: this.context.players.size,
        tileFlashDurationMs: SS_TILE_FLASH_DURATION_MS,
        inputTimePerStepMs: SS_INPUT_TIME_PER_STEP_MS,
        gameSettings: this.context.gameSettings,
      },
      actions: this.actionLog,
      finalResults: this.computeRankings().map((r) => ({
        userId: r.userId,
        userName: r.userName,
        score: r.score,
        rank: r.rank,
      })),
    };
  }
}
