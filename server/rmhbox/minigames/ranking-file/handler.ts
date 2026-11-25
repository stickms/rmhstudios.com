/**
 * RMHbox — Ranking File Minigame Server Handler
 *
 * Every round shows the same five items of one set (planets, rivers, years…)
 * in one shuffled order. Players put them in the order the prompt asks for and
 * lock in; the round ends when all connected players have locked or the timer
 * runs out (an unlocked order counts as it stands). Then the official order is
 * revealed with each item's value and the players' points:
 *
 *   points = (12 - footrule distance) x 50, plus 200 for a perfect order.
 *
 * Phases per round: ORDERING -> REVEAL -> (next round or end).
 *
 * Secrecy: the official order and the values exist only in `state.rounds`
 * until the round is revealed. Nothing a player or a spectator is sent before
 * then carries them: a player's state is the round's shuffled labels and their
 * own order.
 *
 * Join-in-progress policy: join_next_subround — a late joiner watches the round
 * in progress and plays from the next round.
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { loadSets, selectRoundsForGame } from '@/lib/rmhbox/ranking-file/set-loader';
import { LockInputSchema, ReorderInputSchema } from '@/lib/rmhbox/ranking-file/schemas';
import { footrule, pointsForDistance, ranksWithTies } from '@/lib/rmhbox/ranking-file/scoring';
import { RF_REVEAL_SECONDS, RF_ROUND_SECONDS, RF_TOTAL_ROUNDS } from '@/lib/rmhbox/ranking-file/settings';
import { logger } from '../../logger';
import type { GameLogAction, RankingFileState, RFPlayerRoundResult, RFReveal } from './types';

/** Shape version of the stored game log (see GameLog in the history registry). */
const GAME_LOG_VERSION = 1;

export class RankingFileGame extends BaseMinigame {
  private usedSetIds: Set<string> = new Set();
  private state!: RankingFileState;
  private startedAt = 0;
  private actionLog: GameLogAction[] = [];
  private jipQueue: Set<string> = new Set();
  private phaseTransitionHandle: NodeJS.Timeout | null = null;
  /** The settings the match started with (kept for the history's header). */
  private settingsUsed: Record<string, unknown> = {};
  private pausedAt = 0;

  /**
   * Spectator mode: shared-privileged — spectators see the same masked view as
   * the players, without any player's order.
   */
  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const totalRounds = this.getSetting('totalRounds', RF_TOTAL_ROUNDS);
    const category = String(this.getSetting('category', 'all'));
    const rounds = selectRoundsForGame(loadSets(), this.usedSetIds, totalRounds, category);
    for (const round of rounds) this.usedSetIds.add(round.setId);

    const participants = new Set(this.context.players.keys());
    const scores = new Map<string, number>();
    for (const userId of participants) scores.set(userId, 0);

    this.settingsUsed = {
      totalRounds: rounds.length,
      roundSeconds: this.getSetting('roundSeconds', RF_ROUND_SECONDS),
      category,
    };

    this.state = {
      rounds,
      currentRound: -1,
      totalRounds: rounds.length,
      phase: 'ORDERING',
      participants,
      orders: new Map(),
      locked: new Set(),
      scores,
      revealed: [],
      phaseStartedAt: Date.now(),
      phaseEndsAt: 0,
    };

    logger.info({
      event: 'ranking_file:start',
      lobbyId: this.context.lobbyId,
      totalRounds: rounds.length,
      playerCount: participants.size,
    });

    this.startNextRound();
  }

  // ─── Round Flow ──────────────────────────────────────────────

  private schedulePhaseTransition(callback: () => void, delayMs: number): void {
    this.clearTrackedTimeout(this.phaseTransitionHandle);
    this.phaseTransitionHandle = this.setTimeout(callback, delayMs);
  }

  private startNextRound(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;
    const round = this.state.rounds[this.state.currentRound];
    if (!round) {
      this.endGame();
      return;
    }

    // Join-in-progress players take their seat at a round boundary
    for (const userId of this.jipQueue) {
      this.state.participants.add(userId);
      if (!this.state.scores.has(userId)) this.state.scores.set(userId, 0);
    }
    this.jipQueue.clear();

    this.state.phase = 'ORDERING';
    this.state.locked = new Set();
    this.state.orders = new Map();
    for (const userId of this.state.participants) this.state.orders.set(userId, [...round.display]);

    const seconds = this.getSetting('roundSeconds', RF_ROUND_SECONDS);
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + seconds * 1000;

    this.broadcastRound(this.state.currentRound + 1, this.state.totalRounds);

    // The log keeps the round's identity, never its answer: the official order
    // joins it at the reveal.
    this.logAction('round_start', {
      roundIndex: this.state.currentRound,
      setId: round.setId,
      category: round.category,
      prompt: round.prompt,
      labels: round.display,
    });

    this.broadcastGameAction({
      type: 'RF_ROUND',
      roundIndex: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      prompt: round.prompt,
      category: round.category,
      labels: round.display,
      duration: seconds,
    });

    this.startPhaseTimer(seconds);
    this.schedulePhaseTransition(() => this.endRound(), seconds * 1000);
  }

  private endRound(): void {
    if (!this.isRunning) return;
    // Phase guard: a late timer cannot end a round twice
    if (this.state.phase !== 'ORDERING') return;

    this.clearTrackedTimeout(this.phaseTransitionHandle);
    this.phaseTransitionHandle = null;
    this.clearPhaseTimer();

    const round = this.state.rounds[this.state.currentRound];
    const officialLabels = round.official.map((item) => item.label);

    const results: RFPlayerRoundResult[] = [];
    for (const userId of this.state.participants) {
      const order = this.state.orders.get(userId) ?? [...round.display];
      const distance = footrule(officialLabels, order) ?? 0;
      const points = pointsForDistance(distance);
      const total = (this.state.scores.get(userId) ?? 0) + points;
      this.state.scores.set(userId, total);
      results.push({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        order,
        distance,
        points,
        perfect: distance === 0,
        locked: this.state.locked.has(userId),
        newTotalScore: total,
      });
    }
    results.sort((a, b) => a.distance - b.distance || a.userName.localeCompare(b.userName));

    const reveal: RFReveal = {
      roundIndex: this.state.currentRound,
      prompt: round.prompt,
      category: round.category,
      setId: round.setId,
      source: round.source,
      official: round.official.map((item) => ({ label: item.label, value: item.value, unit: round.unit })),
      results,
    };
    this.state.revealed.push(reveal);

    this.state.phase = 'REVEAL';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + RF_REVEAL_SECONDS * 1000;

    this.logAction('round_reveal', {
      roundIndex: reveal.roundIndex,
      setId: reveal.setId,
      prompt: reveal.prompt,
      category: reveal.category,
      unit: round.unit,
      source: reveal.source,
      official: reveal.official,
      results: results.map((r) => ({
        userId: r.userId,
        order: r.order,
        distance: r.distance,
        points: r.points,
        perfect: r.perfect,
        locked: r.locked,
        newTotalScore: r.newTotalScore,
      })),
    });

    logger.info({
      event: 'ranking_file:reveal',
      lobbyId: this.context.lobbyId,
      roundIndex: reveal.roundIndex,
      setId: reveal.setId,
    });

    this.broadcastGameAction({ type: 'RF_REVEAL', ...reveal, duration: RF_REVEAL_SECONDS });
    this.broadcastGameAction({ type: 'RF_SCORE_UPDATE', scores: this.scoresRecord() });

    this.startPhaseTimer(RF_REVEAL_SECONDS);
    this.schedulePhaseTransition(() => {
      if (this.state.currentRound + 1 >= this.state.totalRounds) this.endGame();
      else this.startNextRound();
    }, RF_REVEAL_SECONDS * 1000);
  }

  // ─── Input Handling ──────────────────────────────────────────

  /**
   * `reorder` ({ order }) and `lock` ({}). An action outside the ordering
   * phase, from a player who is not in the round, after they locked, or that
   * fails validation is ignored; so is a reorder that changes nothing.
   */
  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.isRunning || !this.state) return;
    if (this.state.phase !== 'ORDERING') return;
    if (!this.state.participants.has(userId) || this.state.locked.has(userId)) return;

    if (action === 'reorder') this.handleReorder(userId, data);
    else if (action === 'lock') this.handleLock(userId, data);
  }

  private handleReorder(userId: string, data: unknown): void {
    const parsed = ReorderInputSchema.safeParse(data);
    if (!parsed.success) return;
    const { order } = parsed.data;

    const round = this.state.rounds[this.state.currentRound];
    // Exactly this round's labels, each once: a foreign label or a duplicate is refused
    const allowed = new Set(round.display);
    if (new Set(order).size !== order.length || !order.every((label) => allowed.has(label))) return;

    const current = this.state.orders.get(userId) ?? round.display;
    if (order.every((label, i) => label === current[i])) return;

    this.state.orders.set(userId, order);
  }

  private handleLock(userId: string, data: unknown): void {
    if (!LockInputSchema.safeParse(data ?? {}).success) return;

    this.state.locked.add(userId);
    this.logAction('player_lock', { roundIndex: this.state.currentRound, userId });

    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'RF_LOCKED',
      order: this.state.orders.get(userId) ?? [],
    });
    // Everyone learns who has locked, never what they locked
    this.broadcastGameAction({ type: 'RF_PLAYER_LOCKED', userId });

    this.endRoundIfAllLocked();
  }

  /**
   * End the round early once every connected participant has locked. A
   * disconnected player does not hold the round open; their order counts as it
   * stands when the round ends.
   */
  private endRoundIfAllLocked(): void {
    if (this.state.phase !== 'ORDERING') return;
    const active = this.getActivePlayerIds();
    if (active.length === 0) return;
    if (!active.every((id) => this.state.locked.has(id))) return;
    this.endRound();
  }

  // ─── State Masking ───────────────────────────────────────────

  /** What every viewer gets; nothing in it depends on who is looking. */
  private baseState(): Record<string, unknown> {
    const round = this.state.rounds[this.state.currentRound];
    const timer = this.getPhaseTimerSnapshot();
    const fallback = Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000));
    const revealing = this.state.phase === 'REVEAL';
    const reveal = revealing ? (this.state.revealed[this.state.revealed.length - 1] ?? null) : null;

    return {
      phase: this.state.phase,
      currentRoundIndex: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      prompt: round?.prompt ?? '',
      category: round?.category ?? '',
      // The shuffled labels as first shown: never the official order
      labels: round ? [...round.display] : [],
      scores: this.scoresRecord(),
      lockedPlayerIds: Array.from(this.state.locked),
      phaseStartedAt: this.state.phaseStartedAt,
      phaseEndsAt: this.state.phaseEndsAt,
      timeRemaining: timer && !timer.infinite ? timer.remaining : fallback,
      paused: this.isPhaseTimerPaused,
      // Present only once the round is revealed
      reveal,
    };
  }

  getStateForPlayer(userId: string): unknown {
    const base = this.baseState();
    const round = this.state.rounds[this.state.currentRound];
    const ordering = this.state.phase === 'ORDERING';
    return {
      ...base,
      myOrder: ordering && round ? (this.state.orders.get(userId) ?? [...round.display]) : null,
      myLocked: this.state.locked.has(userId),
    };
  }

  getStateForSpectator(): unknown {
    return { ...this.baseState(), myOrder: null, myLocked: false };
  }

  // ─── Pause ───────────────────────────────────────────────────

  pausePhaseTimer(): void {
    if (!this.isPhaseTimerPaused) this.pausedAt = Date.now();
    super.pausePhaseTimer();
  }

  resumePhaseTimer(): void {
    if (this.isPhaseTimerPaused && this.pausedAt > 0 && this.state) {
      this.state.phaseEndsAt += Date.now() - this.pausedAt;
    }
    this.pausedAt = 0;
    super.resumePhaseTimer();
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ────────────

  handlePlayerJoin(userId: string): void {
    this.jipQueue.add(userId);
    this.context.sendToPlayer(userId, 'rmhbox:game:state_snapshot', this.getStateForSpectator());
  }

  handlePlayerDisconnect(_userId: string): void {
    if (!this.isRunning || !this.state) return;
    this.endRoundIfAllLocked();
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
        roundHistory: this.state.revealed,
        gameLog: this.buildGameLog(),
      },
      duration: Date.now() - this.startedAt,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries = Array.from(this.context.players.entries()).map(([userId, player]) => {
      const deltas: Record<string, number> = {};
      for (const reveal of this.state.revealed) {
        const mine = reveal.results.find((r) => r.userId === userId);
        deltas[`round_${reveal.roundIndex + 1}`] = mine?.points ?? 0;
      }
      return { userId, userName: player.userName, score: this.state.scores.get(userId) ?? 0, deltas };
    });
    entries.sort((a, b) => b.score - a.score);
    // Equal scores share a place
    return ranksWithTies(entries);
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const perfect = new Map<string, number>();
    const distance = new Map<string, { total: number; rounds: number }>();
    for (const reveal of this.state.revealed) {
      for (const r of reveal.results) {
        if (r.perfect) perfect.set(r.userId, (perfect.get(r.userId) ?? 0) + 1);
        const d = distance.get(r.userId) ?? { total: 0, rounds: 0 };
        d.total += r.distance;
        d.rounds++;
        distance.set(r.userId, d);
      }
    }

    let topPerfect: { userId: string; count: number } | null = null;
    for (const [userId, count] of perfect) {
      if (!topPerfect || count > topPerfect.count) topPerfect = { userId, count };
    }
    if (topPerfect) {
      awards.push({
        userId: topPerfect.userId,
        title: 'Perfect Order',
        description: `Got ${topPerfect.count} ${topPerfect.count === 1 ? 'round' : 'rounds'} exactly right`,
        icon: 'star',
      });
    }

    let closest: { userId: string; total: number } | null = null;
    for (const [userId, d] of distance) {
      if (d.rounds > 0 && (!closest || d.total < closest.total)) closest = { userId, total: d.total };
    }
    if (closest) {
      awards.push({
        userId: closest.userId,
        title: 'Sharpest Eye',
        description: `Only ${closest.total} places off over the whole match`,
        icon: 'crosshair',
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
      minigameId: 'ranking-file',
      version: GAME_LOG_VERSION,
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      players: Array.from(this.context.players.entries()).map(([userId, p]) => ({
        userId,
        userName: p.userName,
      })),
      initialState: this.settingsUsed,
      actions: this.actionLog,
      finalResults: ranked.map((r) => ({ userId: r.userId, userName: r.userName, score: r.score, rank: r.rank })),
    };
  }

  // ─── End Game ────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;
    logger.info({
      event: 'ranking_file:game_end',
      lobbyId: this.context.lobbyId,
      roundsPlayed: this.state.revealed.length,
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

  /** Connected participants of the current round. */
  private getActivePlayerIds(): string[] {
    const ids: string[] = [];
    for (const userId of this.state.participants) {
      if (this.context.players.get(userId)?.isConnected) ids.push(userId);
    }
    return ids;
  }
}
