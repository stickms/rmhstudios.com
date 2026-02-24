/**
 * RMHbox — Ranking File Minigame Server Handler
 *
 * Players rank a set of items within a category (e.g. "Best Pizza Toppings")
 * from 1–5. After all players submit, the group average determines the
 * "consensus" order. Points are awarded based on how close a player's
 * ranking is to the group average (Manhattan distance), with bonuses for
 * exact matches and outlier uniqueness.
 *
 * Phases per round:
 *   CATEGORY_REVEAL → RANKING → LOCK_IN → RESULTS_REVEAL → TRANSITION → (next round or GAME_OVER)
 *
 * Join-in-progress policy: join_next_subround — late joiners participate
 * starting from the next round.
 *
 * Reference: docs/rmhbox/design-spec/phase-8.md §8.2.6–8.2.12
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '../../../../lib/rmhbox/types';
import { logger } from '../../logger';
import { RFSubmitSchema, RFUpdateSchema, type RankingCategory } from '../../../../lib/rmhbox/ranking-file/schemas';
import { loadCategories, selectCategoriesForGame } from '../../../../lib/rmhbox/ranking-file/category-loader';
import {
  RF_TOTAL_ROUNDS,
  RF_ITEMS_PER_CATEGORY,
  RF_CATEGORY_REVEAL_SECONDS,
  RF_RANKING_SECONDS,
  RF_LOCK_IN_SECONDS,
  RF_RESULTS_SECONDS,
  RF_TRANSITION_SECONDS,
  RF_MAX_ROUND_POINTS,
  RF_EXACT_MATCH_BONUS,
  RF_OUTLIER_BONUS,
  RF_MAX_THEORETICAL_DISTANCE,
} from '../../../../lib/rmhbox/constants';

// ─── Phase & Type Definitions ────────────────────────────────────

export type RFPhase =
  | 'CATEGORY_REVEAL'
  | 'RANKING'
  | 'LOCK_IN'
  | 'RESULTS_REVEAL'
  | 'TRANSITION'
  | 'GAME_OVER';

/** Per-player result for a single round. */
export interface RFPlayerResult {
  userId: string;
  userName: string;
  ranking: number[];
  distance: number;
  score: number;
  exactMatch: boolean;
  isOutlier: boolean;
}

/** Full result of a single round. */
export interface RFRoundResult {
  roundNumber: number;
  category: RankingCategory;
  averageRanking: number[];
  consensusOrder: number[];
  playerResults: Record<string, RFPlayerResult>;
  outlierId: string | null;
}

/** Final ranking entry for a player across all rounds. */
export interface RFFinalRanking {
  userId: string;
  userName: string;
  totalScore: number;
  rank: number;
}

/** Internal game state. */
export interface RankingFileState {
  phase: RFPhase;
  currentRound: number;
  totalRounds: number;
  categories: RankingCategory[];
  currentCategory: RankingCategory | null;
  /** Per-player rankings for the current round: userId → position array (1-indexed). */
  rankings: Record<string, number[]>;
  /** Live preview rankings (not yet locked in). */
  liveRankings: Record<string, number[]>;
  /** Whether a player has locked in their ranking this round. */
  lockedIn: Record<string, boolean>;
  /** Cumulative scores. */
  scores: Record<string, number>;
  /** Per-round results history. */
  roundResults: RFRoundResult[];
  /** Tracks which players are active each round (for JIP). */
  activePlayerIds: Set<string>;
  /** Players joining next round. */
  pendingJoinIds: Set<string>;
  /** Structured action log for game replay. */
  actionLog: Array<{ seq: number; type: string; timestamp: number; payload: Record<string, unknown> }>;
}

// ─── Ranking File Minigame ───────────────────────────────────────

export class RankingFileGame extends BaseMinigame {
  private state!: RankingFileState;
  private startedAt: number = 0;
  private usedCategoryIds: Set<string> = new Set();

  constructor(context: MinigameContext) {
    super(context);
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const totalRounds = this.getSetting('totalRounds', RF_TOTAL_ROUNDS);

    // Load and select categories for all rounds
    const pool = loadCategories();
    const categories = selectCategoriesForGame(pool, totalRounds, this.usedCategoryIds);
    for (const cat of categories) {
      this.usedCategoryIds.add(cat.id);
    }

    this.initializeState(categories, totalRounds);

    logger.info({
      event: 'ranking_file:start',
      roomId: this.context.lobbyId,
      totalRounds,
      playerCount: this.context.players.size,
      categoryIds: categories.map((c) => c.id),
    });

    this.startNextRound();
  }

  private initializeState(categories: RankingCategory[], totalRounds: number): void {
    const scores: Record<string, number> = {};
    for (const userId of this.context.players.keys()) {
      scores[userId] = 0;
    }

    this.state = {
      phase: 'CATEGORY_REVEAL',
      currentRound: 0,
      totalRounds,
      categories,
      currentCategory: null,
      rankings: {},
      liveRankings: {},
      lockedIn: {},
      scores,
      roundResults: [],
      activePlayerIds: new Set(this.context.players.keys()),
      pendingJoinIds: new Set(),
      actionLog: [],
    };
  }

  // ─── Round Flow ─────────────────────────────────────────────

  private startNextRound(): void {
    if (!this.isRunning) return;

    // Admit pending JIP players
    for (const userId of this.state.pendingJoinIds) {
      this.state.activePlayerIds.add(userId);
      if (this.state.scores[userId] === undefined) {
        this.state.scores[userId] = 0;
      }
    }
    this.state.pendingJoinIds.clear();

    this.state.currentRound++;
    const category = this.state.categories[this.state.currentRound - 1];
    this.state.currentCategory = category;
    this.state.phase = 'CATEGORY_REVEAL';

    // Reset per-round state
    this.state.rankings = {};
    this.state.liveRankings = {};
    this.state.lockedIn = {};
    for (const userId of this.state.activePlayerIds) {
      this.state.lockedIn[userId] = false;
    }

    this.logAction('round_start', {
      round: this.state.currentRound,
      categoryId: category.id,
      categoryName: category.name,
      items: category.items,
    });

    logger.info({
      event: 'ranking_file:round_start',
      roomId: this.context.lobbyId,
      round: this.state.currentRound,
      categoryId: category.id,
      categoryName: category.name,
    });

    this.broadcastRound(this.state.currentRound, this.state.totalRounds);

    this.context.broadcastAction({
      type: 'RF_CATEGORY_REVEAL',
      payload: {
        round: this.state.currentRound,
        totalRounds: this.state.totalRounds,
        category: {
          id: category.id,
          name: category.name,
          items: category.items,
          emoji: category.emoji,
        },
        duration: RF_CATEGORY_REVEAL_SECONDS,
      },
    });

    this.startPhaseTimer(RF_CATEGORY_REVEAL_SECONDS);
    this.setTimeout(() => this.startRankingPhase(), RF_CATEGORY_REVEAL_SECONDS * 1000);
  }

  private startRankingPhase(): void {
    if (!this.isRunning) return;

    const rankingDuration = this.getSetting('rankingDuration', RF_RANKING_SECONDS);
    this.state.phase = 'RANKING';

    logger.info({
      event: 'ranking_file:ranking_phase',
      roomId: this.context.lobbyId,
      round: this.state.currentRound,
      duration: rankingDuration,
    });

    this.context.broadcastAction({
      type: 'RF_RANKING_START',
      payload: {
        duration: rankingDuration,
        timeRemaining: rankingDuration,
      },
    });

    this.startPhaseTimer(rankingDuration);
    this.setTimeout(() => this.startLockInPhase(), rankingDuration * 1000);
  }

  private startLockInPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'LOCK_IN';

    logger.info({
      event: 'ranking_file:lock_in_phase',
      roomId: this.context.lobbyId,
      round: this.state.currentRound,
      duration: RF_LOCK_IN_SECONDS,
    });

    this.context.broadcastAction({
      type: 'RF_LOCK_IN',
      payload: {
        duration: RF_LOCK_IN_SECONDS,
        timeRemaining: RF_LOCK_IN_SECONDS,
      },
    });

    this.startPhaseTimer(RF_LOCK_IN_SECONDS);
    this.setTimeout(() => this.endRankingPhase(), RF_LOCK_IN_SECONDS * 1000);
  }

  private endRankingPhase(): void {
    if (!this.isRunning) return;

    this.clearPhaseTimer();

    // Auto-assign default ranking (1,2,3,4,5) for players who didn't submit
    const itemCount = this.getSetting('itemsPerCategory', RF_ITEMS_PER_CATEGORY);
    const defaultRanking = Array.from({ length: itemCount }, (_, i) => i + 1);

    for (const userId of this.state.activePlayerIds) {
      if (!this.state.rankings[userId]) {
        // Use live preview if available, otherwise default
        if (this.state.liveRankings[userId]) {
          this.state.rankings[userId] = [...this.state.liveRankings[userId]];
        } else {
          this.state.rankings[userId] = [...defaultRanking];
        }
        this.state.lockedIn[userId] = true;
      }
    }

    this.computeRoundResults();
  }

  // ─── Scoring Logic ──────────────────────────────────────────

  /**
   * Compute the average ranking across all submissions.
   * Returns an array where index i = average rank assigned to item i.
   */
  private computeAverageRanking(): number[] {
    const itemCount = this.getSetting('itemsPerCategory', RF_ITEMS_PER_CATEGORY);
    const sums = new Array<number>(itemCount).fill(0);
    const playerIds = Object.keys(this.state.rankings);
    const count = playerIds.length;

    if (count === 0) return sums;

    for (const userId of playerIds) {
      const ranking = this.state.rankings[userId];
      for (let i = 0; i < itemCount; i++) {
        sums[i] += ranking[i];
      }
    }

    return sums.map((s) => s / count);
  }

  /**
   * Manhattan distance between a player's ranking and the average.
   */
  private computeDistance(playerRanking: number[], averageRanking: number[]): number {
    let distance = 0;
    for (let i = 0; i < playerRanking.length; i++) {
      distance += Math.abs(playerRanking[i] - averageRanking[i]);
    }
    return distance;
  }

  /**
   * Convert distance to score: distance 0 → max points, max distance → 0 (linear).
   */
  private computeRoundScore(distance: number): number {
    const maxDist = RF_MAX_THEORETICAL_DISTANCE;
    const normalized = Math.min(distance, maxDist) / maxDist;
    return Math.round(RF_MAX_ROUND_POINTS * (1 - normalized));
  }

  /**
   * Sort item indices by their average rank to produce the consensus order.
   * Returns array of item indices sorted ascending by average rank.
   */
  private computeConsensusOrder(averageRanking: number[]): number[] {
    const indices = averageRanking.map((_, i) => i);
    indices.sort((a, b) => averageRanking[a] - averageRanking[b]);
    return indices;
  }

  /**
   * Check if a player's ranking exactly matches the consensus order.
   */
  private isExactMatch(playerRanking: number[], consensusOrder: number[]): boolean {
    // Build the consensus ranking: for each item, what rank does consensus give it?
    const consensusRanking = new Array<number>(consensusOrder.length);
    for (let rank = 0; rank < consensusOrder.length; rank++) {
      consensusRanking[consensusOrder[rank]] = rank + 1;
    }
    for (let i = 0; i < playerRanking.length; i++) {
      if (playerRanking[i] !== consensusRanking[i]) return false;
    }
    return true;
  }

  /**
   * Score all players for the current round and broadcast results.
   */
  private computeRoundResults(): void {
    const category = this.state.currentCategory!;
    const averageRanking = this.computeAverageRanking();
    const consensusOrder = this.computeConsensusOrder(averageRanking);

    const playerResults: Record<string, RFPlayerResult> = {};
    let maxDistance = -1;
    let outlierId: string | null = null;
    const enableOutlierBonus = this.getSetting('enableOutlierBonus', true);

    // First pass: compute distances and scores
    for (const userId of this.state.activePlayerIds) {
      const ranking = this.state.rankings[userId];
      if (!ranking) continue;

      const player = this.context.players.get(userId);
      const userName = player?.userName ?? 'Unknown';
      const distance = this.computeDistance(ranking, averageRanking);
      let score = this.computeRoundScore(distance);
      const exactMatch = this.isExactMatch(ranking, consensusOrder);

      if (exactMatch) {
        score += RF_EXACT_MATCH_BONUS;
      }

      if (distance > maxDistance) {
        maxDistance = distance;
        outlierId = userId;
      }

      playerResults[userId] = {
        userId,
        userName,
        ranking,
        distance,
        score,
        exactMatch,
        isOutlier: false,
      };
    }

    // Mark outlier and apply bonus
    if (outlierId && playerResults[outlierId]) {
      playerResults[outlierId].isOutlier = true;
      if (enableOutlierBonus) {
        playerResults[outlierId].score += RF_OUTLIER_BONUS;
      }
    }

    // Update cumulative scores
    for (const [userId, result] of Object.entries(playerResults)) {
      this.state.scores[userId] = (this.state.scores[userId] ?? 0) + result.score;
    }

    const roundResult: RFRoundResult = {
      roundNumber: this.state.currentRound,
      category,
      averageRanking,
      consensusOrder,
      playerResults,
      outlierId,
    };

    this.state.roundResults.push(roundResult);
    this.state.phase = 'RESULTS_REVEAL';

    this.logAction('round_result', {
      round: this.state.currentRound,
      categoryId: category.id,
      averageRanking,
      consensusOrder,
      outlierId,
      playerScores: Object.fromEntries(
        Object.entries(playerResults).map(([uid, r]) => [uid, { distance: r.distance, score: r.score, exactMatch: r.exactMatch }]),
      ),
    });

    logger.info({
      event: 'ranking_file:round_results',
      roomId: this.context.lobbyId,
      round: this.state.currentRound,
      outlierId,
    });

    this.context.broadcastAction({
      type: 'RF_ROUND_RESULTS',
      payload: {
        round: this.state.currentRound,
        category: {
          id: category.id,
          name: category.name,
          items: category.items,
          emoji: category.emoji,
        },
        averageRanking,
        consensusOrder,
        playerResults,
        scores: { ...this.state.scores },
        duration: RF_RESULTS_SECONDS,
      },
    });

    this.startPhaseTimer(RF_RESULTS_SECONDS);
    this.setTimeout(() => {
      if (this.state.currentRound >= this.state.totalRounds) {
        this.endGame();
      } else {
        this.startTransition();
      }
    }, RF_RESULTS_SECONDS * 1000);
  }

  // ─── Transition & End ───────────────────────────────────────

  private startTransition(): void {
    if (!this.isRunning) return;

    this.state.phase = 'TRANSITION';

    logger.info({
      event: 'ranking_file:transition',
      roomId: this.context.lobbyId,
      round: this.state.currentRound,
    });

    this.context.broadcastAction({
      type: 'RF_TRANSITION',
      payload: {
        nextRound: this.state.currentRound + 1,
        scores: { ...this.state.scores },
        duration: RF_TRANSITION_SECONDS,
      },
    });

    this.startPhaseTimer(RF_TRANSITION_SECONDS);
    this.setTimeout(() => this.startNextRound(), RF_TRANSITION_SECONDS * 1000);
  }

  private endGame(): void {
    if (!this.isRunning) return;

    this.state.phase = 'GAME_OVER';

    this.logAction('game_complete', {
      totalRounds: this.state.totalRounds,
      finalScores: { ...this.state.scores },
    });

    logger.info({
      event: 'ranking_file:game_end',
      roomId: this.context.lobbyId,
      rounds: this.state.currentRound,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ─────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    if (!this.state.activePlayerIds.has(userId)) return;

    switch (action) {
      case 'RF_SUBMIT_RANKING':
        this.handleSubmitRanking(userId, data);
        break;
      case 'RF_UPDATE_RANKING':
        this.handleUpdateRanking(userId, data);
        break;
      default:
        break;
    }
  }

  private handleSubmitRanking(userId: string, data: unknown): void {
    if (this.state.phase !== 'RANKING' && this.state.phase !== 'LOCK_IN') return;
    if (this.state.lockedIn[userId]) return;

    const parsed = RFSubmitSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'RF_RANKING_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    this.state.rankings[userId] = parsed.data.ranking;
    this.state.lockedIn[userId] = true;

    this.logAction('ranking_submitted', {
      round: this.state.currentRound,
      userId,
      ranking: parsed.data.ranking,
    });

    logger.info({
      event: 'ranking_file:ranking_submitted',
      roomId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
    });

    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'RF_RANKING_CONFIRMED',
      ranking: parsed.data.ranking,
    });

    // Broadcast lock-in count
    const lockedCount = Object.values(this.state.lockedIn).filter(Boolean).length;
    const totalActive = this.state.activePlayerIds.size;
    this.context.broadcastAction({
      type: 'RF_LOCK_IN_COUNT',
      payload: { lockedIn: lockedCount, total: totalActive },
    });
  }

  private handleUpdateRanking(userId: string, data: unknown): void {
    if (this.state.phase !== 'RANKING' && this.state.phase !== 'LOCK_IN') return;
    if (this.state.lockedIn[userId]) return;

    const parsed = RFUpdateSchema.safeParse(data);
    if (!parsed.success) return;

    this.state.liveRankings[userId] = parsed.data.ranking;

    // Send live update to spectators only (god view)
    this.context.sendToSpectators('rmhbox:game:action', {
      type: 'RF_LIVE_RANKING_UPDATE',
      userId,
      ranking: parsed.data.ranking,
    });
  }

  // ─── State Masking ──────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      currentCategory: this.state.currentCategory
        ? {
            id: this.state.currentCategory.id,
            name: this.state.currentCategory.name,
            items: this.state.currentCategory.items,
            emoji: this.state.currentCategory.emoji,
          }
        : null,
      scores: { ...this.state.scores },
    };

    // During RANKING/LOCK_IN: player sees only their own ranking
    if (this.state.phase === 'RANKING' || this.state.phase === 'LOCK_IN') {
      return {
        ...base,
        myRanking: this.state.rankings[userId] ?? this.state.liveRankings[userId] ?? null,
        myLockedIn: this.state.lockedIn[userId] ?? false,
        lockedInCount: Object.values(this.state.lockedIn).filter(Boolean).length,
        totalActive: this.state.activePlayerIds.size,
        roundResults: this.state.roundResults,
      };
    }

    // RESULTS_REVEAL, TRANSITION, GAME_OVER: show full round results
    return {
      ...base,
      myRanking: this.state.rankings[userId] ?? null,
      myLockedIn: true,
      lockedInCount: this.state.activePlayerIds.size,
      totalActive: this.state.activePlayerIds.size,
      roundResults: this.state.roundResults,
    };
  }

  getStateForSpectator(): unknown {
    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      currentCategory: this.state.currentCategory
        ? {
            id: this.state.currentCategory.id,
            name: this.state.currentCategory.name,
            items: this.state.currentCategory.items,
            emoji: this.state.currentCategory.emoji,
          }
        : null,
      scores: { ...this.state.scores },
    };

    // GOD VIEW: spectators see all live rankings during RANKING/LOCK_IN
    if (this.state.phase === 'RANKING' || this.state.phase === 'LOCK_IN') {
      return {
        ...base,
        allRankings: { ...this.state.rankings },
        allLiveRankings: { ...this.state.liveRankings },
        lockedIn: { ...this.state.lockedIn },
        lockedInCount: Object.values(this.state.lockedIn).filter(Boolean).length,
        totalActive: this.state.activePlayerIds.size,
        roundResults: this.state.roundResults,
      };
    }

    return {
      ...base,
      allRankings: { ...this.state.rankings },
      allLiveRankings: {},
      lockedIn: { ...this.state.lockedIn },
      lockedInCount: this.state.activePlayerIds.size,
      totalActive: this.state.activePlayerIds.size,
      roundResults: this.state.roundResults,
    };
  }

  // ─── Join-in-Progress / Disconnect / Reconnect ──────────────

  handlePlayerJoin(userId: string): void {
    // JIP: player joins at next round start
    this.state.pendingJoinIds.add(userId);

    logger.info({
      event: 'ranking_file:player_join_pending',
      roomId: this.context.lobbyId,
      userId,
      nextRound: this.state.currentRound + 1,
    });

    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );
  }

  handlePlayerDisconnect(userId: string): void {
    logger.info({
      event: 'ranking_file:player_disconnect',
      roomId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
      hadSubmission: !!this.state.rankings[userId],
    });
  }

  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForPlayer(userId),
    );

    logger.info({
      event: 'ranking_file:player_reconnect',
      roomId: this.context.lobbyId,
      userId,
      round: this.state.currentRound,
      phase: this.state.phase,
    });
  }

  // ─── Results & Awards ───────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeFinalRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        roundResults: this.state.roundResults,
        totalRounds: this.state.totalRounds,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeFinalRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    for (const userId of this.context.players.keys()) {
      const player = this.context.players.get(userId)!;
      const score = this.state.scores[userId] ?? 0;

      const deltas: Record<string, number> = {};
      for (const rr of this.state.roundResults) {
        const pr = rr.playerResults[userId];
        deltas[`round_${rr.roundNumber}`] = pr?.score ?? 0;
      }

      entries.push({
        userId,
        userName: player.userName,
        score,
        rank: 0,
        deltas,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => { e.rank = i + 1; });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const playerIds = Array.from(this.context.players.keys());
    if (playerIds.length === 0) return awards;

    // Aggregate stats across all rounds
    const stats: Record<string, {
      totalDistance: number;
      exactMatchCount: number;
      outlierCount: number;
      distances: number[];
      maxSingleDistance: number;
      roundsPlayed: number;
    }> = {};

    for (const userId of playerIds) {
      stats[userId] = {
        totalDistance: 0,
        exactMatchCount: 0,
        outlierCount: 0,
        distances: [],
        maxSingleDistance: 0,
        roundsPlayed: 0,
      };
    }

    for (const rr of this.state.roundResults) {
      for (const [userId, pr] of Object.entries(rr.playerResults)) {
        if (!stats[userId]) continue;
        stats[userId].totalDistance += pr.distance;
        stats[userId].distances.push(pr.distance);
        stats[userId].roundsPlayed++;
        if (pr.exactMatch) stats[userId].exactMatchCount++;
        if (pr.isOutlier) stats[userId].outlierCount++;
        if (pr.distance > stats[userId].maxSingleDistance) {
          stats[userId].maxSingleDistance = pr.distance;
        }
      }
    }

    // Closest to average — lowest total distance across all rounds
    const closestToAverage = this.findTop(stats, (s) => s.roundsPlayed > 0 ? -s.totalDistance : -Infinity);
    if (closestToAverage) {
      awards.push({
        userId: closestToAverage.userId,
        title: 'Closest to Average',
        description: 'Ranked closest to the group consensus overall',
        icon: 'users',
      });
    }

    // Trendsetter — most outlier rounds
    const trendsetter = this.findTop(stats, (s) => s.outlierCount);
    if (trendsetter && trendsetter.value > 0) {
      awards.push({
        userId: trendsetter.userId,
        title: 'Trendsetter',
        description: `Most unique rankings in ${trendsetter.value} round${trendsetter.value > 1 ? 's' : ''}`,
        icon: 'snowflake',
      });
    }

    // Mind Meld — most exact matches
    const mindMeld = this.findTop(stats, (s) => s.exactMatchCount);
    if (mindMeld && mindMeld.value > 0) {
      awards.push({
        userId: mindMeld.userId,
        title: 'Mind Meld',
        description: `Matched consensus exactly ${mindMeld.value} time${mindMeld.value > 1 ? 's' : ''}`,
        icon: 'brain',
      });
    }

    // Consistent — lowest distance variance across rounds
    const consistent = this.findTop(stats, (s) => {
      if (s.distances.length < 2) return -Infinity;
      const mean = s.totalDistance / s.distances.length;
      const variance = s.distances.reduce((sum, d) => sum + (d - mean) ** 2, 0) / s.distances.length;
      return -variance; // lower variance = better
    });
    if (consistent && stats[consistent.userId].distances.length >= 2) {
      awards.push({
        userId: consistent.userId,
        title: 'Consistent',
        description: 'Most consistent rankings across all rounds',
        icon: 'ruler',
      });
    }

    // Hot Take — single round highest distance
    const hotTake = this.findTop(stats, (s) => s.maxSingleDistance);
    if (hotTake && hotTake.value > 0) {
      awards.push({
        userId: hotTake.userId,
        title: 'Hot Take',
        description: 'Most unique ranking in a single round',
        icon: 'flame',
      });
    }

    return awards;
  }

  private findTop<T>(
    stats: Record<string, T>,
    getValue: (s: T) => number,
  ): { userId: string; value: number } | null {
    let topUserId: string | null = null;
    let topValue = -Infinity;
    for (const [userId, s] of Object.entries(stats)) {
      const v = getValue(s);
      if (v > topValue) {
        topValue = v;
        topUserId = userId;
      }
    }
    return topUserId ? { userId: topUserId, value: topValue } : null;
  }

  // ─── Action Log / Game Log ──────────────────────────────────

  private actionSeq = 0;

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
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
      totalRounds: this.state.totalRounds,
      roundsPlayed: this.state.currentRound,
      playerCount: this.context.players.size,
      players,
      settings: {
        totalRounds: this.getSetting('totalRounds', RF_TOTAL_ROUNDS),
        rankingDuration: this.getSetting('rankingDuration', RF_RANKING_SECONDS),
        itemsPerCategory: this.getSetting('itemsPerCategory', RF_ITEMS_PER_CATEGORY),
        enableOutlierBonus: this.getSetting('enableOutlierBonus', true),
      },
      actions: this.state.actionLog,
      finalResults: Array.from(this.context.players.keys()).map((userId) => ({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        score: this.state.scores[userId] ?? 0,
      })),
    };
  }
}
