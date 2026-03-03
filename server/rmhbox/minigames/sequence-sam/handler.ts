/**
 * RMHbox — Sequence Sam Minigame Server Handler
 *
 * Players observe a growing sequence of tile flashes on a 3×3 grid,
 * then must repeat the sequence from memory. Every nth round is a
 * "Chaos Round" where the grid rotates 90° clockwise after the pattern
 * is shown, remapping expected input positions.
 *
 * The sequence grows by 2 tiles per round. The game continues until
 * at most one player completes the latest sequence correctly.
 *
 * Scoring: players earn points per correct tap (SS_CORRECT_TAP_POINTS),
 * with a small first-to-finish bonus (SS_FIRST_FINISH_BONUS) per round.
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
  SS_TILES_ADDED_PER_ROUND,
  SS_CHAOS_INTERVAL,
  SS_TILE_FLASH_DURATION_MS,
  SS_TILE_GAP_MS,
  SS_INPUT_TIME_PER_STEP_MS,
  SS_ROUND_RESULTS_SECONDS,
  SS_TRANSITION_SECONDS,
  SS_CORRECT_TAP_POINTS,
  SS_FIRST_FINISH_BONUS,
  SS_GRID_SIZE,
  SS_ENABLE_CHAOS,
  ROTATION_MAP_CW,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  SSPhase,
  SSPlayerState,
  SequenceSamState,
  SSRoundPlayerResult,
  ActionLogEntry,
} from './types';

// ─── Sequence Sam Minigame ───────────────────────────────────────

export class SequenceSamGame extends BaseMinigame {
  private state!: SequenceSamState;
  private startedAt: number = 0;
  private actionLog: ActionLogEntry[] = [];
  private actionSeq = 0;

  /** Whether the first-to-finish bonus has been awarded this round. */
  private firstFinishAwarded = false;

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
    const playerStates = new Map<string, SSPlayerState>();
    const activePlayers: string[] = [];

    for (const [userId] of this.context.players) {
      playerStates.set(userId, {
        userId,
        correctTaps: 0,
        firstFinishes: 0,
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
    }

    this.state = {
      currentRound: 0,
      maxRounds: this.getSetting('maxRounds', SS_MAX_ROUNDS),
      sequence: [],
      rotatedSequence: null,
      rotationDegrees: 0,
      isChaosRound: false,
      phase: 'PATTERN_DISPLAY' as SSPhase,
      playerStates,
      activePlayers,
      phaseStartedAt: Date.now(),
      phaseEndsAt: Date.now(),
      currentDisplayStep: 0,
    };
  }

  // ─── Sequence Generation ─────────────────────────────────────

  /**
   * Extends the sequence. Initial round creates startingLength tiles;
   * subsequent rounds add exactly SS_TILES_ADDED_PER_ROUND (2) tiles.
   * No consecutive duplicates allowed.
   */
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
      // Add exactly 2 tiles per round
      for (let t = 0; t < SS_TILES_ADDED_PER_ROUND; t++) {
        let pos: number;
        do {
          pos = Math.floor(Math.random() * SS_GRID_SIZE);
        } while (pos === this.state.sequence[this.state.sequence.length - 1]);
        this.state.sequence.push(pos);
      }
    }

    // Chaos round logic
    if (enableChaos && this.state.currentRound % chaosInterval === 0 && this.state.currentRound > 0) {
      this.state.isChaosRound = true;
      this.state.rotationDegrees = 90;
      this.state.rotatedSequence = this.state.sequence.map((p) => ROTATION_MAP_CW[p]);
    } else {
      this.state.isChaosRound = false;
      this.state.rotationDegrees = 0;
      this.state.rotatedSequence = null;
    }
  }

  // ─── Round Lifecycle ─────────────────────────────────────────

  private startNextRound(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;
    this.firstFinishAwarded = false;

    // Hard cap on rounds
    if (this.state.currentRound > this.state.maxRounds) {
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
      rotationDegrees: this.state.isChaosRound ? this.state.rotationDegrees : 0,
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
          degrees: this.state.rotationDegrees,
        });

        this.logAction('chaos_rotation', {
          round: this.state.currentRound,
          degrees: this.state.rotationDegrees,
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
    // Scale timer with sequence length
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

    // Compute per-player results for this round
    const playerResults: SSRoundPlayerResult[] = [];
    let completedCount = 0;

    for (const userId of this.state.activePlayers) {
      const ps = this.state.playerStates.get(userId)!;
      const player = this.context.players.get(userId);
      const userName = player?.userName ?? 'Unknown';

      playerResults.push({
        userId,
        userName,
        completed: ps.hasCompletedSequence,
        correctTaps: ps.currentInputIndex, // how far they got
        roundScore: ps.roundScore,
        totalScore: ps.totalScore,
      });

      if (ps.hasCompletedSequence) {
        completedCount++;
      }
    }

    this.logAction('round_result', {
      round: this.state.currentRound,
      completedCount,
      playerResults: playerResults.map((pr) => ({
        userId: pr.userId, completed: pr.completed,
        correctTaps: pr.correctTaps, roundScore: pr.roundScore,
      })),
    });

    logger.info({
      event: 'sequence_sam:round_results',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      completedCount,
      activePlayers: this.state.activePlayers.length,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'SS_ROUND_RESULTS',
      roundNumber: this.state.currentRound,
      playerResults,
    });

    // End condition: at most 1 player completed the sequence correctly
    if (completedCount <= 1) {
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

    const rankings = this.computeRankings();

    this.logAction('game_end', {
      finalPlacements: rankings.map((r) => ({
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
      rankings: rankings.map((r) => ({
        userId: r.userId,
        userName: r.userName,
        score: r.score,
        rank: r.rank,
      })),
      awards: this.computeAwards().map((a) => ({
        userId: a.userId,
        title: a.title,
        description: a.description,
        icon: a.icon,
      })),
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
    if (!ps) return;
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
      ps.correctTaps++;
      ps.roundScore += SS_CORRECT_TAP_POINTS;
      ps.totalScore += SS_CORRECT_TAP_POINTS;

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

        // First-to-finish bonus
        if (!this.firstFinishAwarded) {
          this.firstFinishAwarded = true;
          ps.firstFinishes++;
          ps.roundScore += SS_FIRST_FINISH_BONUS;
          ps.totalScore += SS_FIRST_FINISH_BONUS;
        }

        this.context.broadcastToLobby('rmhbox:game:action', {
          type: 'SS_PLAYER_COMPLETE',
          userId,
          userName: player?.userName ?? 'Unknown',
          timeMs,
        });

        this.checkAllFinished();
      }
    } else {
      // Incorrect tap — player fails immediately
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
        };
      });

    const base = {
      currentRound: this.state.currentRound,
      isChaosRound: this.state.isChaosRound,
      rotationDegrees: this.state.rotationDegrees,
      sequenceLength: this.state.sequence.length,
      phase: this.state.phase,
      scores,
      otherPlayers,
    };

    if (this.state.phase === 'PATTERN_DISPLAY') {
      return {
        ...base,
        currentDisplayStep: this.state.currentDisplayStep,
      };
    }

    if (this.state.phase === 'INPUT') {
      return {
        ...base,
        timeRemaining: Math.max(0, this.state.phaseEndsAt - Date.now()),
        myInputIndex: ps?.currentInputIndex ?? 0,
        myHasCompleted: ps?.hasCompletedSequence ?? false,
        myHasFailed: ps?.hasFailed ?? false,
      };
    }

    // ROUND_RESULTS, TRANSITION, GAME_OVER
    return {
      ...base,
      myTotalScore: ps?.totalScore ?? 0,
      myCorrectTaps: ps?.correctTaps ?? 0,
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
        correctTaps: ps.correctTaps,
      };
    });

    return {
      currentRound: this.state.currentRound,
      isChaosRound: this.state.isChaosRound,
      rotationDegrees: this.state.rotationDegrees,
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
    logger.info({
      event: 'sequence_sam:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
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

    // Sort by score descending
    entries.sort((a, b) => b.score - a.score);

    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Memory Master — highest total score (winner)
    const rankings = this.computeRankings();
    if (rankings.length > 0 && rankings[0].score > 0) {
      awards.push({
        userId: rankings[0].userId,
        title: 'Memory Master',
        description: `${rankings[0].score} total points`,
        icon: 'brain',
      });
    }

    // Speed Demon — most first-to-finish rounds
    let maxFirstFinishes = 0;
    let speedUserId: string | null = null;
    for (const [userId, ps] of this.state.playerStates) {
      if (ps.firstFinishes > maxFirstFinishes) {
        maxFirstFinishes = ps.firstFinishes;
        speedUserId = userId;
      }
    }
    if (speedUserId && maxFirstFinishes > 0) {
      awards.push({
        userId: speedUserId,
        title: 'Speed Demon',
        description: `First to finish ${maxFirstFinishes} round${maxFirstFinishes > 1 ? 's' : ''}`,
        icon: 'zap',
      });
    }

    // Sharp Eye — most total correct taps
    let maxTaps = 0;
    let tapsUserId: string | null = null;
    for (const [userId, ps] of this.state.playerStates) {
      if (ps.correctTaps > maxTaps) {
        maxTaps = ps.correctTaps;
        tapsUserId = userId;
      }
    }
    if (tapsUserId && maxTaps > 0 && tapsUserId !== rankings[0]?.userId) {
      awards.push({
        userId: tapsUserId,
        title: 'Sharp Eye',
        description: `${maxTaps} correct taps total`,
        icon: 'target',
      });
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
        startingLength: this.getSetting('startingLength', SS_STARTING_LENGTH),
        tilesAddedPerRound: SS_TILES_ADDED_PER_ROUND,
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
