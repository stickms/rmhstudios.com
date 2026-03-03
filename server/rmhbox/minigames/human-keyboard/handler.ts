/**
 * RMHbox — Human Keyboard Minigame Server Handler
 *
 * A cooperative typing game where each player controls a subset of the
 * alphabet. The team must work together to type a target sentence.
 * Keys reshuffle periodically, adding chaos.
 *
 * Scoring: each player's score = accuracy × typingSpeed × 100,
 * where accuracy = correct / total presses (as ratio), and
 * typingSpeed = total presses / total turn time (letters/sec).
 *
 * Phases:
 *   SENTENCE_REVEAL → TYPING → RESULTS
 *
 * Join-in-progress policy: spectate_only
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §2
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { HKPressSchema } from '@/lib/rmhbox/human-keyboard/schemas';
import { loadSentences, selectSentenceForGame } from '@/lib/rmhbox/human-keyboard/data-loader';
import type { TargetSentence } from '@/lib/rmhbox/human-keyboard/data-loader';
import {
  HK_TYPING_DURATION_SECONDS,
  HK_SENTENCE_REVEAL_SECONDS,
  HK_RESULTS_SECONDS,
  HK_RESHUFFLE_INTERVAL_SECONDS,
  HK_RESHUFFLE_WARNING_SECONDS,
  HK_SPACE_DELAY_MS,
  HK_INPUT_RATE_LIMIT,
  HK_EFFECTIVE_SPEED_MULTIPLIER,
  HK_FIRST_FINISH_BONUS,
  HK_ENABLE_RESHUFFLE,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  HKPhase,
  HKPlayerStats,
  HumanKeyboardState,
  HKPlayerResult,
  ActionLogEntry,
} from './types';

// ─── Human Keyboard Minigame ─────────────────────────────────────

export class HumanKeyboardGame extends BaseMinigame {
  private state!: HumanKeyboardState;
  private startedAt: number = 0;
  private actionLog: ActionLogEntry[] = [];
  private actionSeq = 0;
  private sentences: TargetSentence[];
  private usedSentenceIds: Set<string> = new Set();
  /** Per-player rate limit tracking: timestamps of recent presses. */
  private pressTimestamps: Map<string, number[]> = new Map();
  /** Progress milestones already emitted. */
  private emittedMilestones: Set<number> = new Set();
  /** Initial key assignments for game log. */
  private initialKeyAssignments: Record<string, string[]> = {};
  /** Reshuffle timer handle. */
  private reshuffleWarningTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Spectators see an omniscient view with all players' key assignments
   * and real-time stats, since individual key ownership is hidden between players.
   */
  get spectatorMode(): 'shared-privileged' { return 'shared-privileged'; }

  constructor(context: MinigameContext) {
    super(context);
    this.sentences = loadSentences();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.initializeState();

    const typingDuration = this.getSetting('typingDuration', HK_TYPING_DURATION_SECONDS);
    logger.info({
      event: 'human_keyboard:start',
      lobbyId: this.context.lobbyId,
      typingDuration,
      playerCount: this.context.players.size,
      sentence: this.state.targetSentence.text,
    });

    // Emit sentence reveal to all
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'HK_SENTENCE_REVEAL',
      sentence: this.state.targetSentence.text,
      normalizedLength: this.state.targetSentence.letterCount,
      typingDurationSeconds: typingDuration,
    });

    // Send key assignments to each player individually
    for (const [userId, keys] of this.state.keyAssignments) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'HK_KEY_ASSIGNMENT',
        myKeys: keys,
      });
    }

    this.setTimeout(() => this.startTypingPhase(), HK_SENTENCE_REVEAL_SECONDS * 1000);
  }

  private initializeState(): void {
    const playerIds = Array.from(this.context.players.keys());
    const sentence = selectSentenceForGame(this.sentences, playerIds.length, this.usedSentenceIds);
    this.usedSentenceIds.add(sentence.id);

    const keyAssignments = this.assignKeys(playerIds);
    const letterToPlayer = new Map<string, string>();
    for (const [userId, keys] of keyAssignments) {
      for (const key of keys) {
        letterToPlayer.set(key, userId);
      }
    }

    // Store initial assignments for game log
    this.initialKeyAssignments = Object.fromEntries(
      [...keyAssignments.entries()].map(([uid, keys]) => [uid, [...keys]]),
    );

    const playerStats = new Map<string, HKPlayerStats>();
    for (const userId of playerIds) {
      const keys = keyAssignments.get(userId) ?? [];
      playerStats.set(userId, {
        userId,
        correctPresses: 0,
        wrongPresses: 0,
        wrongPlayerPresses: 0,
        turnTimeMs: 0,
        turnStartedAt: null,
        currentKeys: keys,
      });
      this.pressTimestamps.set(userId, []);
    }

    this.state = {
      targetSentence: sentence,
      normalizedText: sentence.normalizedText,
      cursorPosition: 0,
      displayCursorPosition: 0,
      phase: 'SENTENCE_REVEAL' as HKPhase,
      isComplete: false,
      keyAssignments,
      letterToPlayer,
      nextReshuffleAt: 0,
      reshuffleCount: 0,
      playerStats,
      currentTurnPlayer: null,
      phaseStartedAt: Date.now(),
      phaseEndsAt: Date.now(),
      startedAt: 0,
      completedAt: null,
    };
  }

  // ─── Key Assignment ──────────────────────────────────────────

  private assignKeys(playerIds: string[]): Map<string, string[]> {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    // Fisher-Yates shuffle
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }

    const assignments = new Map<string, string[]>();
    for (const uid of playerIds) {
      assignments.set(uid, []);
    }

    // Round-robin distribution
    for (let i = 0; i < letters.length; i++) {
      const uid = playerIds[i % playerIds.length];
      assignments.get(uid)!.push(letters[i]);
    }

    // Sort each player's letters alphabetically
    for (const [, keys] of assignments) {
      keys.sort();
    }

    // Update reverse lookup
    this.state?.letterToPlayer?.clear();
    if (this.state) {
      for (const [userId, keys] of assignments) {
        for (const key of keys) {
          this.state.letterToPlayer.set(key, userId);
        }
      }
    }

    return assignments;
  }

  // ─── Turn Tracking ──────────────────────────────────────────

  /**
   * Updates the current turn player based on the next expected letter.
   * Accumulates turn time for the outgoing player and starts tracking
   * for the incoming player.
   */
  private updateTurnPlayer(): void {
    const nextLetter = this.getNextExpectedLetter();
    const newTurnPlayer = nextLetter ? (this.state.letterToPlayer.get(nextLetter) ?? null) : null;
    const now = Date.now();

    // Close out the previous turn player's turn time
    if (this.state.currentTurnPlayer) {
      const prevStats = this.state.playerStats.get(this.state.currentTurnPlayer);
      if (prevStats && prevStats.turnStartedAt !== null) {
        prevStats.turnTimeMs += now - prevStats.turnStartedAt;
        prevStats.turnStartedAt = null;
      }
    }

    // Start tracking the new turn player
    this.state.currentTurnPlayer = newTurnPlayer;
    if (newTurnPlayer) {
      const newStats = this.state.playerStats.get(newTurnPlayer);
      if (newStats) {
        newStats.turnStartedAt = now;
      }
    }
  }

  // ─── Typing Phase ────────────────────────────────────────────

  private startTypingPhase(): void {
    if (!this.isRunning) return;

    const typingDuration = this.getSetting('typingDuration', HK_TYPING_DURATION_SECONDS);
    const now = Date.now();
    this.state.phase = 'TYPING';
    this.state.startedAt = now;
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + typingDuration * 1000;

    const enableReshuffle = this.getSetting('enableReshuffle', HK_ENABLE_RESHUFFLE);
    const reshuffleInterval = this.getSetting('reshuffleInterval', HK_RESHUFFLE_INTERVAL_SECONDS);

    if (enableReshuffle) {
      this.state.nextReshuffleAt = now + reshuffleInterval * 1000;
      this.scheduleReshuffleWarning();
    }

    // Drive the header timer
    this.startPhaseTimer(typingDuration);

    // Schedule end of typing phase
    this.setTimeout(() => this.endTypingPhase(), typingDuration * 1000);

    // Handle leading spaces and set initial turn
    this.checkAndAdvanceSpaces();
    this.updateTurnPlayer();

    logger.info({
      event: 'human_keyboard:typing_phase_start',
      lobbyId: this.context.lobbyId,
      typingDuration,
      enableReshuffle,
    });
  }

  private scheduleReshuffleWarning(): void {
    if (!this.isRunning) return;
    const enableReshuffle = this.getSetting('enableReshuffle', HK_ENABLE_RESHUFFLE);
    if (!enableReshuffle) return;

    const reshuffleInterval = this.getSetting('reshuffleInterval', HK_RESHUFFLE_INTERVAL_SECONDS);
    const warningTime = (reshuffleInterval - HK_RESHUFFLE_WARNING_SECONDS) * 1000;

    if (warningTime <= 0) {
      // If reshuffle interval is <= warning seconds, just schedule reshuffle directly
      this.reshuffleWarningTimer = this.setTimeout(
        () => this.performReshuffle(),
        reshuffleInterval * 1000,
      );
      return;
    }

    this.reshuffleWarningTimer = this.setTimeout(() => {
      if (!this.isRunning || this.state.phase !== 'TYPING') return;

      this.context.broadcastToLobby('rmhbox:game:action', {
        type: 'HK_RESHUFFLE_WARNING',
        secondsUntilReshuffle: HK_RESHUFFLE_WARNING_SECONDS,
      });

      this.setTimeout(() => this.performReshuffle(), HK_RESHUFFLE_WARNING_SECONDS * 1000);
    }, warningTime);
  }

  private performReshuffle(): void {
    if (!this.isRunning || this.state.phase !== 'TYPING' || this.state.isComplete) return;

    const activePlayerIds = Array.from(this.context.players.keys()).filter((uid) => {
      const p = this.context.players.get(uid);
      return p?.isConnected;
    });

    if (activePlayerIds.length === 0) return;

    const newAssignments = this.assignKeys(activePlayerIds);
    this.state.keyAssignments = newAssignments;
    this.state.reshuffleCount++;

    // Update letter-to-player mapping
    this.state.letterToPlayer.clear();
    for (const [userId, keys] of newAssignments) {
      for (const key of keys) {
        this.state.letterToPlayer.set(key, userId);
      }
      // Update player stats
      const stats = this.state.playerStats.get(userId);
      if (stats) {
        stats.currentKeys = keys;
      }
    }

    const reshuffleInterval = this.getSetting('reshuffleInterval', HK_RESHUFFLE_INTERVAL_SECONDS);
    this.state.nextReshuffleAt = Date.now() + reshuffleInterval * 1000;

    this.logAction('reshuffle', {
      period: this.state.reshuffleCount,
      newAssignments: Object.fromEntries([...newAssignments.entries()]),
      progressAtReshuffle: this.state.cursorPosition / this.state.targetSentence.letterCount,
    });

    // Broadcast reshuffle event
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'HK_RESHUFFLE',
      reshuffleNumber: this.state.reshuffleCount,
    });

    // Send new key assignments to each player
    for (const [userId, keys] of newAssignments) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'HK_KEY_ASSIGNMENT',
        myKeys: keys,
      });
    }

    // Update turn tracking after reshuffle (keys may have changed owner)
    this.updateTurnPlayer();

    // Schedule next reshuffle
    this.scheduleReshuffleWarning();

    logger.info({
      event: 'human_keyboard:reshuffle',
      lobbyId: this.context.lobbyId,
      reshuffleNumber: this.state.reshuffleCount,
    });
  }

  private checkAndAdvanceSpaces(): void {
    if (!this.isRunning || this.state.isComplete) return;

    // Find the next non-space character position
    while (
      this.state.displayCursorPosition < this.state.normalizedText.length &&
      this.state.normalizedText[this.state.displayCursorPosition] === ' '
    ) {
      this.state.displayCursorPosition++;
      // Auto-advance after a brief delay
      this.setTimeout(() => {
        if (!this.isRunning) return;
        this.context.broadcastToLobby('rmhbox:game:action', {
          type: 'HK_SPACE_AUTO',
          newCursorPosition: this.state.cursorPosition,
          newDisplayCursorPosition: this.state.displayCursorPosition,
        });
      }, HK_SPACE_DELAY_MS);
    }

    // Check if sentence is complete
    if (this.state.displayCursorPosition >= this.state.normalizedText.length) {
      this.completeSentence();
    }
  }

  private completeSentence(): void {
    if (this.state.isComplete) return;
    this.state.isComplete = true;
    this.state.completedAt = Date.now();

    // Close out current turn time
    this.updateTurnPlayer();

    this.logAction('progress_milestone', {
      milestone: 100,
      elapsedMs: this.state.completedAt - this.state.startedAt,
      currentChar: this.state.cursorPosition,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'HK_COMPLETE',
      timeMs: this.state.completedAt - this.state.startedAt,
    });

    logger.info({
      event: 'human_keyboard:complete',
      lobbyId: this.context.lobbyId,
      timeMs: this.state.completedAt - this.state.startedAt,
    });

    // Schedule results after a brief delay
    this.setTimeout(() => this.endTypingPhase(), HK_RESULTS_SECONDS * 1000);
  }

  private endTypingPhase(): void {
    if (!this.isRunning) return;
    if (this.state.phase === 'RESULTS') return; // Prevent double-call

    this.clearPhaseTimer();
    this.state.phase = 'RESULTS';

    // Close out any lingering turn time
    if (this.state.currentTurnPlayer) {
      const stats = this.state.playerStats.get(this.state.currentTurnPlayer);
      if (stats && stats.turnStartedAt !== null) {
        stats.turnTimeMs += Date.now() - stats.turnStartedAt;
        stats.turnStartedAt = null;
      }
      this.state.currentTurnPlayer = null;
    }

    this.computeAndBroadcastResults();
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (action !== 'HK_PRESS') return;
    if (this.state.phase !== 'TYPING') return;
    if (this.state.isComplete) return;

    const parsed = HKPressSchema.safeParse(data);
    if (!parsed.success) return;

    const { key } = parsed.data;

    // Rate limiting
    const now = Date.now();
    const timestamps = this.pressTimestamps.get(userId);
    if (timestamps) {
      // Remove timestamps older than 1 second
      while (timestamps.length > 0 && timestamps[0] < now - 1000) {
        timestamps.shift();
      }
      if (timestamps.length >= HK_INPUT_RATE_LIMIT) {
        return; // Rate limited
      }
      timestamps.push(now);
    }

    // Determine expected character
    let expectedIdx = this.state.displayCursorPosition;
    // Skip spaces to find next letter
    while (expectedIdx < this.state.normalizedText.length && this.state.normalizedText[expectedIdx] === ' ') {
      expectedIdx++;
    }
    if (expectedIdx >= this.state.normalizedText.length) return;
    const expectedChar = this.state.normalizedText[expectedIdx];

    // Determine who owns the expected key
    const expectedOwner = this.state.letterToPlayer.get(expectedChar);
    const stats = this.state.playerStats.get(userId);
    if (!stats) return;

    if (key === expectedChar && expectedOwner === userId) {
      // Correct key by correct player
      stats.correctPresses++;
      this.state.cursorPosition++;
      this.state.displayCursorPosition = expectedIdx + 1;

      const player = this.context.players.get(userId);
      this.context.broadcastToLobby('rmhbox:game:action', {
        type: 'HK_KEY_CORRECT',
        key,
        userId,
        userName: player?.userName ?? 'Unknown',
        cursorPosition: this.state.cursorPosition,
        displayCursorPosition: this.state.displayCursorPosition,
      });

      // Check progress milestones
      this.checkProgressMilestone();

      // Check for spaces after this character
      this.checkAndAdvanceSpaces();

      // Update turn player (next letter may belong to someone else)
      this.updateTurnPlayer();
    } else if (key === expectedChar && expectedOwner !== userId) {
      // Correct key by wrong player — no cursor lock, just feedback
      stats.wrongPlayerPresses++;
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'HK_KEY_WRONG_PLAYER',
        key,
        correctOwner: expectedOwner ?? 'unknown',
      });
    } else {
      // Wrong key entirely — tracked but no cursor lock
      stats.wrongPresses++;
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'HK_KEY_WRONG',
        key,
      });
    }
  }

  private checkProgressMilestone(): void {
    const progress = this.state.cursorPosition / this.state.targetSentence.letterCount;
    const milestones = [25, 50, 75];

    for (const milestone of milestones) {
      if (progress * 100 >= milestone && !this.emittedMilestones.has(milestone)) {
        this.emittedMilestones.add(milestone);
        this.logAction('progress_milestone', {
          milestone,
          elapsedMs: Date.now() - this.state.startedAt,
          currentChar: this.state.cursorPosition,
        });
      }
    }
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeAndBroadcastResults(): void {
    const results = this.computePlayerResults();

    // Compute team aggregate
    const teamAggregate = this.computeTeamAggregate(results.playerResults);

    // Log player summaries
    for (const result of results.playerResults) {
      this.logAction('player_summary', {
        userId: result.userId,
        correctPresses: result.correctPresses,
        wrongPresses: result.wrongPresses,
        accuracy: result.accuracy,
        typingSpeed: result.typingSpeed,
        effectiveSpeed: result.effectiveSpeed,
        score: result.score,
      });
    }

    this.logAction('game_end', {
      completed: this.state.isComplete,
      finalProgress: this.state.cursorPosition / this.state.targetSentence.letterCount,
      elapsedMs: (this.state.completedAt ?? Date.now()) - this.state.startedAt,
      totalCorrectKeys: results.playerResults.reduce((s, r) => s + r.correctPresses, 0),
      totalWrongKeys: results.playerResults.reduce((s, r) => s + r.wrongPresses, 0),
    });

    logger.info({
      event: 'human_keyboard:results',
      lobbyId: this.context.lobbyId,
      completed: this.state.isComplete,
      teamAggregate,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'HK_RESULTS',
      playerResults: results.playerResults,
      teamAggregate,
      completed: this.state.isComplete,
    });

    // End game
    this.setTimeout(() => this.endGame(), HK_RESULTS_SECONDS * 1000);
  }

  /**
   * Computes per-player results using the new scoring model:
   *   accuracy = correctPresses / totalPresses (as ratio, 0-1)
   *   typingSpeed = totalPresses / totalTurnTimeSec (letters/sec)
   *   effectiveSpeed = accuracy × typingSpeed
   *   score = effectiveSpeed × 100
   *
   * First-to-finish bonus (HK_FIRST_FINISH_BONUS) added if sentence completed.
   */
  private computePlayerResults(): { playerResults: HKPlayerResult[] } {
    const playerResults: HKPlayerResult[] = [];

    // Find player with highest effective speed for MVP
    let maxEffectiveSpeed = -1;
    const effectiveSpeeds: Map<string, number> = new Map();

    for (const [userId, stats] of this.state.playerStats) {
      const totalPresses = stats.correctPresses + stats.wrongPresses;
      const accuracy = totalPresses > 0 ? stats.correctPresses / totalPresses : 0;
      const turnTimeSec = stats.turnTimeMs / 1000;
      const typingSpeed = turnTimeSec > 0 ? totalPresses / turnTimeSec : 0;
      const effectiveSpeed = accuracy * typingSpeed;

      effectiveSpeeds.set(userId, effectiveSpeed);
      if (effectiveSpeed > maxEffectiveSpeed) {
        maxEffectiveSpeed = effectiveSpeed;
      }
    }

    for (const [userId, stats] of this.state.playerStats) {
      const player = this.context.players.get(userId);
      const userName = player?.userName ?? 'Unknown';

      const totalPresses = stats.correctPresses + stats.wrongPresses;
      const accuracy = totalPresses > 0 ? stats.correctPresses / totalPresses : 0;
      const turnTimeSec = stats.turnTimeMs / 1000;
      const typingSpeed = turnTimeSec > 0 ? totalPresses / turnTimeSec : 0;
      const effectiveSpeed = accuracy * typingSpeed;

      // Score = effectiveSpeed × 100, plus completion bonus
      let score = Math.round(effectiveSpeed * HK_EFFECTIVE_SPEED_MULTIPLIER);
      if (this.state.isComplete) {
        score += HK_FIRST_FINISH_BONUS;
      }
      stats.correctPresses; // just to reference
      const accuracyPercent = Math.round(accuracy * 100);

      playerResults.push({
        userId,
        userName,
        correctPresses: stats.correctPresses,
        wrongPresses: stats.wrongPresses,
        wrongPlayerPresses: stats.wrongPlayerPresses,
        accuracy: accuracyPercent,
        typingSpeed: Math.round(typingSpeed * 100) / 100, // 2 decimal places
        effectiveSpeed: Math.round(effectiveSpeed * 100) / 100,
        score,
      });
    }

    // Sort by score descending
    playerResults.sort((a, b) => b.score - a.score);

    return { playerResults };
  }

  /**
   * Computes team-aggregate accuracy and typing speed.
   */
  private computeTeamAggregate(playerResults: HKPlayerResult[]): {
    teamAccuracy: number;
    teamTypingSpeed: number;
    teamEffectiveSpeed: number;
    completionTimeSec: number | null;
    sentence: string;
  } {
    let totalCorrect = 0;
    let totalPresses = 0;
    let totalTurnTimeMs = 0;

    for (const [, stats] of this.state.playerStats) {
      totalCorrect += stats.correctPresses;
      totalPresses += stats.correctPresses + stats.wrongPresses;
      totalTurnTimeMs += stats.turnTimeMs;
    }

    const teamAccuracy = totalPresses > 0 ? Math.round((totalCorrect / totalPresses) * 100) : 0;
    const totalTurnTimeSec = totalTurnTimeMs / 1000;
    const teamTypingSpeed = totalTurnTimeSec > 0
      ? Math.round((totalPresses / totalTurnTimeSec) * 100) / 100
      : 0;
    const teamEffectiveSpeed = totalTurnTimeSec > 0
      ? Math.round(((totalCorrect / Math.max(totalPresses, 1)) * (totalPresses / totalTurnTimeSec)) * 100) / 100
      : 0;

    void playerResults; // used for interface compliance

    const completionTimeSec = this.state.isComplete && this.state.completedAt && this.state.startedAt
      ? Math.round((this.state.completedAt - this.state.startedAt) / 100) / 10
      : null;

    return {
      teamAccuracy,
      teamTypingSpeed,
      teamEffectiveSpeed,
      completionTimeSec,
      sentence: this.state.targetSentence.text,
    };
  }

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'human_keyboard:game_end',
      lobbyId: this.context.lobbyId,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const stats = this.state.playerStats.get(userId);
    const myKeys = this.state.keyAssignments.get(userId) ?? [];

    if (this.state.phase === 'TYPING') {
      const nextExpectedLetter = this.getNextExpectedLetter();
      return {
        sentence: this.state.targetSentence.text,
        cursorPosition: this.state.cursorPosition,
        displayCursorPosition: this.state.displayCursorPosition,
        phase: this.state.phase,
        timeRemaining: Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000)),
        myKeys,
        nextExpectedLetter,
        isMyTurn: myKeys.includes(nextExpectedLetter),
        myStats: stats ? {
          correctPresses: stats.correctPresses,
          wrongPresses: stats.wrongPresses,
        } : null,
        progress: this.state.targetSentence.letterCount > 0
          ? this.state.cursorPosition / this.state.targetSentence.letterCount
          : 0,
        nextReshuffleIn: this.state.nextReshuffleAt > 0
          ? Math.max(0, Math.ceil((this.state.nextReshuffleAt - Date.now()) / 1000))
          : 0,
      };
    }

    return {
      sentence: this.state.targetSentence.text,
      cursorPosition: this.state.cursorPosition,
      displayCursorPosition: this.state.displayCursorPosition,
      phase: this.state.phase,
      myKeys,
      isComplete: this.state.isComplete,
    };
  }

  getStateForSpectator(): unknown {
    const allAssignments: Record<string, string[]> = {};
    for (const [userId, keys] of this.state.keyAssignments) {
      allAssignments[userId] = keys;
    }

    const allStats: Record<string, { correctPresses: number; wrongPresses: number }> = {};
    for (const [userId, stats] of this.state.playerStats) {
      allStats[userId] = {
        correctPresses: stats.correctPresses,
        wrongPresses: stats.wrongPresses,
      };
    }

    const nextExpectedLetter = this.getNextExpectedLetter();
    const nextOwner = this.state.letterToPlayer.get(nextExpectedLetter) ?? null;

    return {
      sentence: this.state.targetSentence.text,
      cursorPosition: this.state.cursorPosition,
      displayCursorPosition: this.state.displayCursorPosition,
      phase: this.state.phase,
      timeRemaining: this.state.phase === 'TYPING'
        ? Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000))
        : 0,
      allKeyAssignments: allAssignments,
      allStats,
      nextExpectedLetter,
      nextOwnerUserId: nextOwner,
      progress: this.state.targetSentence.letterCount > 0
        ? this.state.cursorPosition / this.state.targetSentence.letterCount
        : 0,
      isComplete: this.state.isComplete,
    };
  }

  private getNextExpectedLetter(): string {
    let idx = this.state.displayCursorPosition;
    while (idx < this.state.normalizedText.length && this.state.normalizedText[idx] === ' ') {
      idx++;
    }
    return idx < this.state.normalizedText.length ? this.state.normalizedText[idx] : '';
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );
  }

  handlePlayerDisconnect(userId: string): void {
    logger.info({
      event: 'human_keyboard:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });

    // After grace period, redistribute orphaned letters via reshuffle
    if (this.state.phase === 'TYPING' && !this.state.isComplete) {
      this.setTimeout(() => {
        if (!this.isRunning || this.state.phase !== 'TYPING') return;
        const player = this.context.players.get(userId);
        if (player && !player.isConnected) {
          this.performReshuffle();
        }
      }, 5000); // 5s grace period
    }
  }

  handlePlayerReconnect(userId: string): void {
    // State snapshot delivery is handled centrally by ReconnectionHandler
    // via buildReconnectionSnapshot(). Only logging here.
    logger.info({
      event: 'human_keyboard:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    const results = this.computePlayerResults();
    const rankings = this.computeRankings(results.playerResults);
    const awards = this.computeAwards(results.playerResults);
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        completed: this.state.isComplete,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(playerResults: HKPlayerResult[]): PlayerRanking[] {
    return playerResults.map((pr, idx) => ({
      userId: pr.userId,
      userName: pr.userName,
      score: pr.score,
      rank: idx + 1,
      deltas: {},
    }));
  }

  private computeAwards(playerResults: HKPlayerResult[]): Award[] {
    const awards: Award[] = [];

    // Speed Typist — highest effective typing speed
    const fastest = playerResults.reduce(
      (best, pr) => (pr.effectiveSpeed > (best?.effectiveSpeed ?? 0) ? pr : best),
      null as HKPlayerResult | null,
    );
    if (fastest && fastest.effectiveSpeed > 0) {
      awards.push({
        userId: fastest.userId,
        title: 'Speed Typist',
        description: `${fastest.effectiveSpeed.toFixed(2)} effective letters/sec`,
        icon: 'zap',
      });
    }

    // Perfect Fingers — 100% accuracy with at least 1 correct press
    for (const pr of playerResults) {
      if (pr.accuracy === 100 && pr.correctPresses > 0) {
        awards.push({
          userId: pr.userId,
          title: 'Perfect Fingers',
          description: '100% accuracy — no wrong presses',
          icon: 'check-circle',
        });
        break; // Only first
      }
    }

    // Butterfingers — lowest accuracy (only if they actually pressed keys)
    const activePlayers = playerResults.filter((pr) => pr.correctPresses + pr.wrongPresses > 0);
    if (activePlayers.length > 1) {
      const butterfingers = activePlayers.reduce(
        (worst, pr) => (pr.accuracy < (worst?.accuracy ?? 101) ? pr : worst),
        null as HKPlayerResult | null,
      );
      if (butterfingers && butterfingers.accuracy < 100) {
        awards.push({
          userId: butterfingers.userId,
          title: 'Butterfingers',
          description: `${butterfingers.accuracy}% accuracy`,
          icon: 'x-circle',
        });
      }
    }

    // Team Spirit — awarded to ALL players if sentence completed
    if (this.state.isComplete) {
      for (const pr of playerResults) {
        awards.push({
          userId: pr.userId,
          title: 'Team Spirit',
          description: 'Team completed the sentence!',
          icon: 'users',
        });
      }
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
      playerCount: this.context.players.size,
      players,
      initialState: {
        sentence: this.state.targetSentence.text,
        sentenceLength: this.state.targetSentence.letterCount,
        typingDurationSeconds: this.getSetting('typingDuration', HK_TYPING_DURATION_SECONDS),
        reshuffleIntervalSeconds: this.getSetting('reshuffleInterval', HK_RESHUFFLE_INTERVAL_SECONDS),
        playerCount: this.context.players.size,
        initialKeyAssignments: this.initialKeyAssignments,
        gameSettings: this.context.gameSettings,
      },
      actions: this.actionLog,
      finalResults: Array.from(this.state.playerStats.entries()).map(([userId, stats]) => {
        const totalPresses = stats.correctPresses + stats.wrongPresses;
        const accuracy = totalPresses > 0 ? stats.correctPresses / totalPresses : 0;
        const turnTimeSec = stats.turnTimeMs / 1000;
        const typingSpeed = turnTimeSec > 0 ? totalPresses / turnTimeSec : 0;
        return {
          userId,
          userName: this.context.players.get(userId)?.userName ?? 'Unknown',
          correctPresses: stats.correctPresses,
          wrongPresses: stats.wrongPresses,
          accuracy: Math.round(accuracy * 100),
          typingSpeed: Math.round(typingSpeed * 100) / 100,
          effectiveSpeed: Math.round(accuracy * typingSpeed * 100) / 100,
          score: Math.round(accuracy * typingSpeed * HK_EFFECTIVE_SPEED_MULTIPLIER),
        };
      }),
    };
  }
}
