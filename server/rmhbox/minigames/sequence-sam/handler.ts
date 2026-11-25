/**
 * RMHbox — Sequence Sam Minigame Server Handler
 *
 * Every round the server draws one sequence of four pads (round 1 has three
 * steps, each round adds one) and shows it to everybody at once, one step at a
 * time. Then the recall opens for `recallSeconds`: each player taps the
 * sequence back and the server judges every tap as it arrives.
 *
 *   correct full sequence = 100 x length + a speed bonus of up to 50
 *   a miss                = 60 x correct steps
 *
 * Two misses in a match and a player is out: they watch the rest. The match
 * ends after `rounds` rounds, or when at most one player is still in.
 *
 * Phases per round: SHOW -> RECALL -> RESULT -> (next round or end).
 *
 * Secrecy: the sequences live only in `state.sequences`. A step is sent when it
 * is shown and not before; a player's or a spectator's state carries only the
 * steps already shown, the player's own taps, and (after a round) every result.
 * The speed bonus is timed on this server from the recall opening; the client's
 * clock is never read.
 *
 * Join-in-progress policy: spectate_only.
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { TapInputSchema } from '@/lib/rmhbox/sequence-sam/schemas';
import {
  SS_MAX_MISSES,
  generateSequence,
  isOut,
  judgeTap,
  lengthForRound,
  litMsFor,
  matchIsOver,
  scoreRound,
} from '@/lib/rmhbox/sequence-sam/sequence';
import {
  SS_DEFAULT_RECALL_SECONDS,
  SS_DEFAULT_ROUNDS,
  SS_DEFAULT_STEP_MS,
  SS_RESULT_SECONDS,
  SS_SHOW_LEAD_MS,
} from '@/lib/rmhbox/sequence-sam/settings';
import { ranksWithTies } from '@/lib/rmhbox/ranking-file/scoring';
import { logger } from '../../logger';
import type { GameLogAction, SequenceSamState, SSPlayerRoundResult, SSRoundResult } from './types';

/** Shape version of the stored game log (see GameLog in the history registry). */
const GAME_LOG_VERSION = 1;

export class SequenceSamGame extends BaseMinigame {
  private state!: SequenceSamState;
  private startedAt = 0;
  private actionLog: GameLogAction[] = [];
  private phaseHandle: NodeJS.Timeout | null = null;
  private stepHandle: NodeJS.Timeout | null = null;
  private settingsUsed: Record<string, unknown> = {};
  private pausedAt = 0;

  /** Everyone is on equal footing: a spectator sees the same masked view as a player. */
  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const totalRounds = this.getSetting('rounds', SS_DEFAULT_ROUNDS);
    const recallSeconds = this.getSetting('recallSeconds', SS_DEFAULT_RECALL_SECONDS);
    const stepMs = this.getSetting('stepMs', SS_DEFAULT_STEP_MS);

    const seed = Math.floor(Math.random() * 0xffffffff);
    const sequences: number[][] = [];
    for (let r = 0; r < totalRounds; r++) sequences.push(generateSequence(seed + r * 7919, lengthForRound(r)));

    const participants = new Set(this.context.players.keys());
    const scores = new Map<string, number>();
    const misses = new Map<string, number>();
    for (const userId of participants) {
      scores.set(userId, 0);
      misses.set(userId, 0);
    }

    this.settingsUsed = { rounds: totalRounds, recallSeconds, stepMs };

    this.state = {
      sequences,
      currentRound: -1,
      totalRounds,
      phase: 'SHOW',
      participants,
      misses,
      out: new Set(),
      inRound: new Set(),
      shown: 0,
      taps: new Map(),
      correct: new Map(),
      finished: new Set(),
      elapsed: new Map(),
      scores,
      results: [],
      recallStartedAt: 0,
      phaseStartedAt: Date.now(),
      phaseEndsAt: 0,
      stepMs,
      recallSeconds,
    };

    logger.info({
      event: 'sequence_sam:start',
      lobbyId: this.context.lobbyId,
      totalRounds,
      playerCount: participants.size,
    });

    this.startNextRound();
  }

  // ─── Round Flow ──────────────────────────────────────────────

  private schedulePhase(callback: () => void, delayMs: number): void {
    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = this.setTimeout(callback, delayMs);
  }

  private startNextRound(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;
    if (this.state.currentRound >= this.state.totalRounds) {
      this.endGame();
      return;
    }
    const round = this.state.currentRound;
    const length = this.state.sequences[round]!.length;

    this.state.phase = 'SHOW';
    this.state.shown = 0;
    this.state.recallStartedAt = 0;
    this.state.taps = new Map();
    this.state.correct = new Map();
    this.state.finished = new Set();
    this.state.elapsed = new Map();
    this.state.inRound = new Set();
    for (const userId of this.state.participants) {
      if (this.state.out.has(userId)) continue;
      this.state.inRound.add(userId);
      this.state.taps.set(userId, []);
      this.state.correct.set(userId, 0);
    }

    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = 0;
    this.clearPhaseTimer();

    this.broadcastRound(round + 1, this.state.totalRounds);
    // The log keeps the round's length, never its sequence: the sequence joins it at the result.
    this.logAction('round_start', { roundIndex: round, length, playersIn: [...this.state.inRound] });

    this.broadcastGameAction({
      type: 'SS_ROUND',
      roundIndex: round,
      totalRounds: this.state.totalRounds,
      length,
      stepMs: this.state.stepMs,
      litMs: litMsFor(this.state.stepMs),
      recallSeconds: this.state.recallSeconds,
      playersIn: [...this.state.inRound],
      playersOut: [...this.state.out],
    });

    this.schedulePhase(() => this.showStep(0), SS_SHOW_LEAD_MS);
  }

  /** Send step `index` to everyone as it is shown, then wait for the next one. */
  private showStep(index: number): void {
    if (!this.isRunning || this.state.phase !== 'SHOW') return;
    const sequence = this.state.sequences[this.state.currentRound]!;
    const pad = sequence[index];
    if (pad === undefined) return;

    this.state.shown = index + 1;
    this.broadcastGameAction({
      type: 'SS_STEP',
      roundIndex: this.state.currentRound,
      step: index,
      pad,
      litMs: litMsFor(this.state.stepMs),
      stepMs: this.state.stepMs,
    });

    const isLast = index + 1 >= sequence.length;
    this.schedulePhase(() => (isLast ? this.openRecall() : this.showStep(index + 1)), this.state.stepMs);
  }

  private openRecall(): void {
    if (!this.isRunning || this.state.phase !== 'SHOW') return;
    const now = Date.now();
    this.state.phase = 'RECALL';
    this.state.recallStartedAt = now;
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + this.state.recallSeconds * 1000;

    this.broadcastGameAction({
      type: 'SS_RECALL',
      roundIndex: this.state.currentRound,
      duration: this.state.recallSeconds,
    });
    this.startPhaseTimer(this.state.recallSeconds);
    this.schedulePhase(() => this.endRound(), this.state.recallSeconds * 1000);
  }

  private endRound(): void {
    if (!this.isRunning) return;
    // Phase guard: a late timer cannot end a round twice
    if (this.state.phase !== 'RECALL') return;

    this.clearTrackedTimeout(this.phaseHandle);
    this.phaseHandle = null;
    this.clearPhaseTimer();

    const round = this.state.currentRound;
    const sequence = this.state.sequences[round]!;
    const results: SSPlayerRoundResult[] = [];

    for (const userId of this.state.inRound) {
      const correctSteps = this.state.correct.get(userId) ?? 0;
      const completed = correctSteps === sequence.length;
      const elapsed = this.state.elapsed.get(userId);
      const { points, bonus } = scoreRound({
        length: sequence.length,
        correctSteps,
        completed,
        elapsedMs: elapsed ?? 0,
        recallSeconds: this.state.recallSeconds,
      });
      // A round not played to the end (a wrong tap, or the time ran out) is a miss
      let misses = this.state.misses.get(userId) ?? 0;
      if (!completed) misses++;
      this.state.misses.set(userId, misses);
      const out = isOut(misses);
      if (out) this.state.out.add(userId);

      const total = (this.state.scores.get(userId) ?? 0) + points;
      this.state.scores.set(userId, total);
      results.push({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        correctSteps,
        completed,
        points,
        bonus,
        elapsedMs: elapsed ?? null,
        misses,
        out,
        newTotalScore: total,
      });
    }
    results.sort((a, b) => b.points - a.points || a.userName.localeCompare(b.userName));

    const result: SSRoundResult = { roundIndex: round, length: sequence.length, sequence: [...sequence], results };
    this.state.results.push(result);

    this.state.phase = 'RESULT';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + SS_RESULT_SECONDS * 1000;

    this.logAction('round_result', {
      roundIndex: round,
      length: sequence.length,
      sequence: [...sequence],
      results: results.map((r) => ({ ...r })),
    });

    logger.info({ event: 'sequence_sam:round_result', lobbyId: this.context.lobbyId, roundIndex: round });

    this.broadcastGameAction({ type: 'SS_RESULT', ...result, duration: SS_RESULT_SECONDS });
    this.broadcastGameAction({ type: 'SS_SCORE_UPDATE', scores: this.scoresRecord() });

    const over = matchIsOver(this.state.results.length, this.state.totalRounds, this.playersIn());
    this.startPhaseTimer(SS_RESULT_SECONDS);
    this.schedulePhase(() => (over ? this.endGame() : this.startNextRound()), SS_RESULT_SECONDS * 1000);
  }

  // ─── Input Handling ──────────────────────────────────────────

  /**
   * `tap` ({ pad }). A tap before the recall opens, from a player who is not in
   * the round or is already finished, a pad outside 0-3, or a tap past the
   * sequence's last step is ignored.
   */
  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning || !this.state) return;
    if (action !== 'tap' && action !== 'input') return;
    if (this.state.phase !== 'RECALL') return;
    if (!this.state.inRound.has(userId) || this.state.finished.has(userId)) return;

    const parsed = TapInputSchema.safeParse(data);
    if (!parsed.success) return;
    const { pad } = parsed.data;

    const sequence = this.state.sequences[this.state.currentRound]!;
    const taps = this.state.taps.get(userId) ?? [];
    // More taps than the sequence has steps: ignored
    if (taps.length >= sequence.length) return;

    const judged = judgeTap(sequence, this.state.correct.get(userId) ?? 0, pad);
    taps.push(pad);
    this.state.taps.set(userId, taps);
    this.state.correct.set(userId, judged.correctSteps);
    if (judged.correct) this.state.elapsed.set(userId, Date.now() - this.state.recallStartedAt);
    if (judged.finished) this.state.finished.add(userId);

    this.logAction('player_tap', {
      roundIndex: this.state.currentRound,
      userId,
      pad,
      correct: judged.correct,
      correctSteps: judged.correctSteps,
    });

    // The tapper learns how it went; nobody learns the next step
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'SS_TAP',
      pad,
      correct: judged.correct,
      correctSteps: judged.correctSteps,
      finished: judged.finished,
      complete: judged.complete,
    });
    if (judged.finished) {
      // Everyone learns who has finished, never how it went until the result
      this.broadcastGameAction({ type: 'SS_PLAYER_DONE', userId });
      this.endRoundIfAllFinished();
    }
  }

  /**
   * End the round early once every connected player still in has finished. A
   * disconnected player does not hold the round open.
   */
  private endRoundIfAllFinished(): void {
    if (this.state.phase !== 'RECALL') return;
    const active = this.getActivePlayerIds();
    if (active.length === 0) return;
    if (!active.every((id) => this.state.finished.has(id))) return;
    this.endRound();
  }

  // ─── State Masking ───────────────────────────────────────────

  private baseState(): Record<string, unknown> {
    const timer = this.getPhaseTimerSnapshot();
    const fallback = Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000));
    const lastResult = this.state.results[this.state.results.length - 1] ?? null;
    const round = this.state.currentRound;
    const sequence = this.state.sequences[round];

    return {
      phase: this.state.phase,
      currentRoundIndex: round,
      totalRounds: this.state.totalRounds,
      length: sequence ? sequence.length : 0,
      // Only the steps already shown, in order
      shownSteps: sequence ? sequence.slice(0, this.state.shown) : [],
      stepMs: this.state.stepMs,
      litMs: litMsFor(this.state.stepMs),
      recallSeconds: this.state.recallSeconds,
      playersIn: Array.from(this.state.inRound),
      playersOut: Array.from(this.state.out),
      finishedPlayerIds: Array.from(this.state.finished),
      scores: this.scoresRecord(),
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
      timeRemaining: timer && !timer.infinite ? timer.remaining : fallback,
      paused: this.isPhaseTimerPaused,
      // Present only once the round has ended
      result: this.state.phase === 'RESULT' ? lastResult : null,
    };
  }

  getStateForPlayer(userId: string): unknown {
    const base = this.baseState();
    const mine = this.state.inRound.has(userId);
    return {
      ...base,
      myTaps: mine ? [...(this.state.taps.get(userId) ?? [])] : [],
      myCorrect: mine ? (this.state.correct.get(userId) ?? 0) : 0,
      myFinished: this.state.finished.has(userId),
      imIn: mine,
      imOut: this.state.out.has(userId),
    };
  }

  getStateForSpectator(): unknown {
    return { ...this.baseState(), myTaps: [], myCorrect: 0, myFinished: false, imIn: false, imOut: false };
  }

  // ─── Pause ───────────────────────────────────────────────────

  pausePhaseTimer(): void {
    if (!this.isPhaseTimerPaused) this.pausedAt = Date.now();
    super.pausePhaseTimer();
  }

  /** Time spent paused is not the player's: the speed bonus clock and the round's end move with it. */
  resumePhaseTimer(): void {
    if (this.isPhaseTimerPaused && this.pausedAt > 0 && this.state) {
      const paused = Date.now() - this.pausedAt;
      this.state.phaseEndsAt += paused;
      if (this.state.recallStartedAt > 0) this.state.recallStartedAt += paused;
    }
    this.pausedAt = 0;
    super.resumePhaseTimer();
  }

  // ─── Reconnection / Disconnect ───────────────────────────────

  handlePlayerDisconnect(_userId: string): void {
    if (!this.isRunning || !this.state) return;
    this.endRoundIfAllFinished();
  }

  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForPlayer(userId));
  }

  // ─── Results & Awards ────────────────────────────────────────

  computeResults(): MinigameResults {
    return {
      rankings: this.computeRankings(),
      awards: this.computeAwards(),
      gameSpecificData: {
        totalRounds: this.state.totalRounds,
        roundHistory: this.state.results,
        gameLog: this.buildGameLog(),
      },
      duration: Date.now() - this.startedAt,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries = Array.from(this.context.players.entries()).map(([userId, player]) => {
      const deltas: Record<string, number> = {};
      for (const result of this.state.results) {
        const mine = result.results.find((r) => r.userId === userId);
        deltas[`round_${result.roundIndex + 1}`] = mine?.points ?? 0;
      }
      return { userId, userName: player.userName, score: this.state.scores.get(userId) ?? 0, deltas };
    });
    entries.sort((a, b) => b.score - a.score);
    return ranksWithTies(entries);
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    let longest: { userId: string; steps: number } | null = null;
    let quickest: { userId: string; bonus: number } | null = null;
    for (const result of this.state.results) {
      for (const r of result.results) {
        if (!longest || r.correctSteps > longest.steps) longest = { userId: r.userId, steps: r.correctSteps };
        if (r.completed && (!quickest || r.bonus > quickest.bonus)) quickest = { userId: r.userId, bonus: r.bonus };
      }
    }
    if (longest && longest.steps > 0) {
      awards.push({
        userId: longest.userId,
        title: 'Longest Memory',
        description: `Played ${longest.steps} steps in a row`,
        icon: 'brain',
      });
    }
    if (quickest && quickest.bonus > 0) {
      awards.push({
        userId: quickest.userId,
        title: 'Quick Fingers',
        description: `A speed bonus of ${quickest.bonus}`,
        icon: 'zap',
      });
    }
    return awards;
  }

  // ─── Game Log ────────────────────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.actionLog.push({ seq: this.actionLog.length + 1, type, payload, timestamp: Date.now() });
  }

  private buildGameLog(): Record<string, unknown> {
    const ranked = this.computeRankings();
    return {
      minigameId: 'sequence-sam',
      version: GAME_LOG_VERSION,
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      players: Array.from(this.context.players.entries()).map(([userId, p]) => ({
        userId,
        userName: p.userName,
      })),
      initialState: { ...this.settingsUsed, maxMisses: SS_MAX_MISSES },
      actions: this.actionLog,
      finalResults: ranked.map((r) => ({ userId: r.userId, userName: r.userName, score: r.score, rank: r.rank })),
    };
  }

  // ─── End Game ────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;
    logger.info({
      event: 'sequence_sam:game_end',
      lobbyId: this.context.lobbyId,
      roundsPlayed: this.state.results.length,
    });
    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private scoresRecord(): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const [uid, score] of this.state.scores) scores[uid] = score;
    return scores;
  }

  /** Players still in the match (not out). */
  private playersIn(): number {
    let n = 0;
    for (const userId of this.state.participants) if (!this.state.out.has(userId)) n++;
    return n;
  }

  /** Connected players of the current round who are not finished or out. */
  private getActivePlayerIds(): string[] {
    const ids: string[] = [];
    for (const userId of this.state.inRound) {
      if (this.context.players.get(userId)?.isConnected) ids.push(userId);
    }
    return ids;
  }
}
