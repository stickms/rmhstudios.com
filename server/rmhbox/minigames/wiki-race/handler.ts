/**
 * RMHbox — Wiki-Race Minigame Server Handler
 *
 * Players race to navigate from a start Wikipedia article to a target
 * article by clicking only internal wiki links. The server fetches and
 * sanitizes article HTML, validates every navigation against the
 * extracted link set (anti-cheat), and tracks each player's path.
 *
 * Scoring rewards finishing, speed (seconds remaining), and efficiency
 * (fewer clicks relative to the optimal path). Players who do not
 * finish receive partial credit based on progress.
 *
 * Phases:
 *   ARTICLE_REVEAL → NAVIGATION → RESULTS
 *
 * Join-in-progress policy: spectate_only — late joiners receive
 * spectator state and do not participate until the next game.
 *
 * Reference: docs/rmhbox/design-spec/minigames/wiki-race.md
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { selectArticlePair, pairKey } from '@/lib/rmhbox/wiki-race/data-loader';
import { NavigateSchema, GoBackSchema } from '@/lib/rmhbox/wiki-race/schemas';
import { createArticleCache, fetchArticle } from '@/lib/rmhbox/wiki-race/wikipedia-proxy';
import type { CachedArticle } from '@/lib/rmhbox/wiki-race/wikipedia-proxy';
import type { LRUCache } from 'lru-cache';
import {
  WR_NAV_DURATION,
  WR_TOTAL_ROUNDS,
  WR_REVEAL,
  WR_RESULTS,
  WR_FINISH_BASE,
  WR_SPEED_BONUS_PER_SEC,
  WR_EFFICIENCY_BONUS,
  WR_ONE_AWAY,
  WR_DNF_BASE,
  WR_DNF_CLICK_BONUS,
  WR_NAV_RATE_LIMIT,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import {
  WikiRacePhase,
  type WRPlayerState,
  type WikiRaceState,
  type RateLimitEntry,
} from './types';

// ─── Wiki-Race Minigame ──────────────────────────────────────────

export class WikiRaceMinigame extends BaseMinigame {
  private state!: WikiRaceState;
  private startedAt: number = 0;
  private navigationStartedAt: number = 0;
  private articleCache: LRUCache<string, CachedArticle>;
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private navigationTimeoutHandle: NodeJS.Timeout | null = null;

  get spectatorMode(): 'competitive-individual' { return 'competitive-individual'; }

  constructor(context: MinigameContext) {
    super(context);
    this.articleCache = createArticleCache();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  /**
   * Send article content to a player and any spectators following them.
   * This ensures spectators in competitive-individual mode see the same
   * article content as the player they are watching.
   */
  private sendArticleToPlayerAndFollowers(userId: string, data: unknown): void {
    this.context.sendToPlayer(userId, 'rmhbox:game:action', data);
    this.context.sendToSpectatorFollowers(userId, 'rmhbox:game:action', data);
  }

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.initializeState();

    logger.info({
      event: 'wiki_race:start',
      lobbyId: this.context.lobbyId,
      startArticle: this.state.articlePair.startArticle.title,
      targetArticle: this.state.articlePair.targetArticle.title,
      playerCount: this.context.players.size,
    });

    // Phase 1: ARTICLE_REVEAL
    this.state.phase = WikiRacePhase.ARTICLE_REVEAL;

    this.broadcastGameAction({
      type: 'WR_ARTICLES_REVEALED',
      startArticle: {
        title: this.state.articlePair.startArticle.title,
        description: this.state.articlePair.startArticle.description,
      },
      targetArticle: {
        title: this.state.articlePair.targetArticle.title,
        description: this.state.articlePair.targetArticle.description,
      },
      difficulty: this.state.articlePair.difficulty,
      duration: WR_REVEAL,
    });

    // Show reveal countdown in the header timer
    this.startPhaseTimer(WR_REVEAL);

    // Broadcast round info for the footer counter
    this.broadcastRound(this.state.currentRound, this.state.totalRounds);

    this.setTimeout(() => this.startNavigation(), WR_REVEAL * 1000);
  }

  private initializeState(): void {
    const articlePair = selectArticlePair([]);
    const playerStates = new Map<string, WRPlayerState>();
    const cumulativeScores = new Map<string, number>();
    const totalRounds = this.getSetting('totalRounds', WR_TOTAL_ROUNDS);

    for (const userId of this.context.players.keys()) {
      playerStates.set(userId, {
        userId,
        currentArticleTitle: articlePair.startArticle.title,
        currentArticleLinks: new Set<string>(),
        path: [articlePair.startArticle.title],
        clickCount: 0,
        hasFinished: false,
        finishedAt: null,
        finishRank: 0,
        score: 0,
      });
      cumulativeScores.set(userId, 0);
    }

    this.state = {
      phase: WikiRacePhase.ARTICLE_REVEAL,
      articlePair,
      playerStates,
      timeRemaining: this.getSetting('navDuration', WR_NAV_DURATION),
      finishCounter: 0,
      actionLog: [],
      currentRound: 1,
      totalRounds,
      cumulativeScores,
      usedPairKeys: [pairKey(articlePair)],
      roundArticlePairs: [{
        round: 1,
        startArticle: articlePair.startArticle.title,
        targetArticle: articlePair.targetArticle.title,
        difficulty: articlePair.difficulty,
      }],
    };
  }

  // ─── Navigation Phase ────────────────────────────────────────

  private startNavigation(): void {
    if (!this.isRunning) return;

    this.state.phase = WikiRacePhase.NAVIGATION;
    this.state.timeRemaining = this.getSetting('navDuration', WR_NAV_DURATION);
    this.navigationStartedAt = Date.now();

    logger.info({
      event: 'wiki_race:navigation_start',
      lobbyId: this.context.lobbyId,
      duration: this.getSetting('navDuration', WR_NAV_DURATION),
    });

    this.broadcastGameAction({
      type: 'WR_NAVIGATION_START',
      duration: this.getSetting('navDuration', WR_NAV_DURATION),
      timeRemaining: this.getSetting('navDuration', WR_NAV_DURATION),
    });

    this.logAction('round_start', {
      round: this.state.currentRound,
      startArticle: this.state.articlePair.startArticle.title,
      targetArticle: this.state.articlePair.targetArticle.title,
      difficulty: this.state.articlePair.difficulty,
    });

    // Fetch start article for each player
    const startTitle = this.state.articlePair.startArticle.title;
    this.fetchAndSendArticle(startTitle).then((article) => {
      if (!this.isRunning || !article) return;
      // Populate links for all players from the start article
      for (const ps of this.state.playerStates.values()) {
        ps.currentArticleLinks = new Set(article.links);
      }
      // Send article content to each player and their spectator followers
      for (const userId of this.state.playerStates.keys()) {
        this.sendArticleToPlayerAndFollowers(userId, {
          type: 'WR_ARTICLE_CONTENT',
          title: article.title,
          html: article.sanitizedHtml,
          linkCount: article.links.size,
        });
      }
    }).catch(() => {
      // Article fetch failed — logged inside fetchAndSendArticle
    });

    // Timer tick every second — drives the header timer ring
    this.startPhaseTimer(this.getSetting('navDuration', WR_NAV_DURATION));

    // End navigation when time expires
    this.navigationTimeoutHandle = this.setTimeout(() => this.endNavigation(), this.getSetting('navDuration', WR_NAV_DURATION) * 1000);
  }

  private endNavigation(): void {
    if (!this.isRunning) return;

    // Clear the phase timer
    this.clearPhaseTimer();

    // Log timeout for unfinished players in this round (before state
    // is reset by startNextRound). This ensures every round's DNF
    // players are recorded, not just the last round's.
    for (const [userId, ps] of this.state.playerStates) {
      if (!ps.hasFinished) {
        this.logAction('player_timeout', {
          userId,
          lastArticle: ps.currentArticleTitle,
          pathLength: ps.path.length,
          path: [...ps.path],
        });
      }
    }

    this.logAction('game_end', {
      reason: 'time_expired',
      finishedCount: this.state.finishCounter,
      totalPlayers: this.state.playerStates.size,
    });

    this.computeScores();
    this.showResults();
  }

  private showResults(): void {
    this.state.phase = WikiRacePhase.RESULTS;

    logger.info({
      event: 'wiki_race:results',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      finishedCount: this.state.finishCounter,
    });

    // Accumulate round scores into cumulative totals
    for (const [userId, ps] of this.state.playerStates) {
      const prev = this.state.cumulativeScores.get(userId) ?? 0;
      this.state.cumulativeScores.set(userId, prev + ps.score);
    }

    // Log round_end with per-round scores for history reconstruction
    const roundScores: Record<string, number> = {};
    for (const [userId, ps] of this.state.playerStates) {
      roundScores[userId] = ps.score;
    }
    this.logAction('round_end', {
      finishedCount: this.state.finishCounter,
      totalPlayers: this.state.playerStates.size,
      scores: roundScores,
    });

    // Build results payload with all player data visible
    const playerResults: Record<string, unknown> = {};
    for (const [userId, ps] of this.state.playerStates) {
      const player = this.context.players.get(userId);
      playerResults[userId] = {
        userName: player?.userName ?? 'Unknown',
        path: ps.path,
        clickCount: ps.clickCount,
        hasFinished: ps.hasFinished,
        finishRank: ps.finishRank,
        score: ps.score,
      };
    }

    const hasMoreRounds = this.state.currentRound < this.state.totalRounds;

    this.broadcastGameAction({
      type: 'WR_RESULTS',
      playerResults,
      duration: WR_RESULTS,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      hasMoreRounds,
    });

    // Show results countdown in the header timer
    this.startPhaseTimer(WR_RESULTS);

    if (hasMoreRounds) {
      this.setTimeout(() => this.startNextRound(), WR_RESULTS * 1000);
    } else {
      this.setTimeout(() => this.endGame(), WR_RESULTS * 1000);
    }
  }

  /** Advance to the next round with a new article pair. */
  private startNextRound(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;

    // Select a new article pair, avoiding previously used ones
    const newPair = selectArticlePair(this.state.usedPairKeys);
    this.state.usedPairKeys.push(pairKey(newPair));
    this.state.articlePair = newPair;
    this.state.finishCounter = 0;

    // Track the new round's article pair for history reconstruction
    this.state.roundArticlePairs.push({
      round: this.state.currentRound,
      startArticle: newPair.startArticle.title,
      targetArticle: newPair.targetArticle.title,
      difficulty: newPair.difficulty,
    });

    // Reset player states for the new round
    for (const [userId, ps] of this.state.playerStates) {
      ps.currentArticleTitle = newPair.startArticle.title;
      ps.currentArticleLinks = new Set<string>();
      ps.path = [newPair.startArticle.title];
      ps.clickCount = 0;
      ps.hasFinished = false;
      ps.finishedAt = null;
      ps.finishRank = 0;
      ps.score = 0;
      void userId; // used as map key
    }

    // Clear rate limits for the new round
    this.rateLimits.clear();

    logger.info({
      event: 'wiki_race:next_round',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      startArticle: newPair.startArticle.title,
      targetArticle: newPair.targetArticle.title,
    });

    // Broadcast round info
    this.broadcastRound(this.state.currentRound, this.state.totalRounds);

    // Enter ARTICLE_REVEAL for the new round
    this.state.phase = WikiRacePhase.ARTICLE_REVEAL;
    this.broadcastGameAction({
      type: 'WR_ARTICLES_REVEALED',
      startArticle: {
        title: newPair.startArticle.title,
        description: newPair.startArticle.description,
      },
      targetArticle: {
        title: newPair.targetArticle.title,
        description: newPair.targetArticle.description,
      },
      difficulty: newPair.difficulty,
      duration: WR_REVEAL,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
    });

    this.startPhaseTimer(WR_REVEAL);
    this.setTimeout(() => this.startNavigation(), WR_REVEAL * 1000);
  }

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'wiki_race:game_end',
      lobbyId: this.context.lobbyId,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ──────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    switch (action) {
      case 'NAVIGATE':
        return this.handleNavigate(userId, data);
      case 'GO_BACK':
        return this.handleGoBack(userId, data);
      default:
        return;
    }
  }

  private handleNavigate(userId: string, data: unknown): void {
    if (this.state.phase !== WikiRacePhase.NAVIGATION) return;

    const ps = this.state.playerStates.get(userId);
    if (!ps || ps.hasFinished) return;

    const parsed = NavigateSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_NAVIGATE_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { targetTitle } = parsed.data;

    // Anti-cheat: validate target is in current article's links
    if (!ps.currentArticleLinks.has(targetTitle)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_NAVIGATE_REJECTED',
        reason: 'link_not_found',
      });
      return;
    }

    // Rate limiting: max WR_NAV_RATE_LIMIT navigations per second
    if (!this.checkRateLimit(userId)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_NAVIGATE_REJECTED',
        reason: 'rate_limited',
      });
      return;
    }

    // Save previous state for rollback if fetch fails
    const prevTitle = ps.currentArticleTitle;
    const prevLinks = ps.currentArticleLinks;
    const prevClickCount = ps.clickCount;

    // Update player state
    ps.clickCount++;
    ps.path.push(targetTitle);
    ps.currentArticleTitle = targetTitle;
    // Keep existing links until new article loads (avoids empty links on game end)

    this.logAction('navigate', {
      userId,
      fromArticle: ps.path[ps.path.length - 2] ?? '',
      toArticle: targetTitle,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Broadcast progress (title hidden from other players — they see click count only)
    this.broadcastGameAction({
      type: 'WR_PLAYER_PROGRESS',
      userId,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Check if target reached
    const targetArticleTitle = this.state.articlePair.targetArticle.title;
    if (targetTitle === targetArticleTitle) {
      this.handlePlayerFinished(userId, ps);
      return;
    }

    // Rollback player state on fetch failure and notify client
    const rollbackNavigation = () => {
      if (!this.isRunning) return;
      const currentPs = this.state.playerStates.get(userId);
      if (!currentPs || currentPs.currentArticleTitle !== targetTitle) return;
      currentPs.path.pop();
      currentPs.clickCount = prevClickCount;
      currentPs.currentArticleTitle = prevTitle;
      currentPs.currentArticleLinks = prevLinks;
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_NAVIGATE_REJECTED',
        reason: 'This article is unavailable. Try another link.',
      });
      this.broadcastGameAction({
        type: 'WR_PLAYER_PROGRESS',
        userId,
        clickCount: currentPs.clickCount,
        pathLength: currentPs.path.length,
      });
    };

    // Fetch article and send to player
    this.fetchAndSendArticle(targetTitle).then((article) => {
      if (!this.isRunning) return;
      if (!article) {
        rollbackNavigation();
        return;
      }
      const currentPs = this.state.playerStates.get(userId);
      if (!currentPs || currentPs.currentArticleTitle !== targetTitle) return;
      currentPs.currentArticleLinks = new Set(article.links);
      this.sendArticleToPlayerAndFollowers(userId, {
        type: 'WR_ARTICLE_CONTENT',
        title: article.title,
        html: article.sanitizedHtml,
        linkCount: article.links.size,
      });
    }).catch(() => {
      rollbackNavigation();
    });
  }

  private handleGoBack(userId: string, data: unknown): void {
    if (this.state.phase !== WikiRacePhase.NAVIGATION) return;

    const ps = this.state.playerStates.get(userId);
    if (!ps || ps.hasFinished) return;

    const parsed = GoBackSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_NAVIGATE_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { targetTitle, pathIndex } = parsed.data;

    // Validate pathIndex is in bounds
    if (pathIndex < 0 || pathIndex >= ps.path.length) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_NAVIGATE_REJECTED',
        reason: 'invalid_path_index',
      });
      return;
    }

    // Verify title matches path at index
    if (ps.path[pathIndex] !== targetTitle) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_NAVIGATE_REJECTED',
        reason: 'path_mismatch',
      });
      return;
    }

    // Going back costs a click
    ps.clickCount++;

    // Truncate path to the target index
    ps.path = ps.path.slice(0, pathIndex + 1);
    ps.currentArticleTitle = targetTitle;
    // Keep existing links until new article loads (avoids empty links on game end)

    this.logAction('back_click', {
      userId,
      toArticle: targetTitle,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Broadcast progress
    this.broadcastGameAction({
      type: 'WR_PLAYER_PROGRESS',
      userId,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Fetch and send the article at the back-tracked position
    this.fetchAndSendArticle(targetTitle).then((article) => {
      if (!this.isRunning || !article) return;
      const currentPs = this.state.playerStates.get(userId);
      if (!currentPs || currentPs.currentArticleTitle !== targetTitle) return;
      currentPs.currentArticleLinks = new Set(article.links);
      this.sendArticleToPlayerAndFollowers(userId, {
        type: 'WR_ARTICLE_CONTENT',
        title: article.title,
        html: article.sanitizedHtml,
        linkCount: article.links.size,
      });
    }).catch(() => {
      // Article fetch error
    });
  }

  // ─── Player Finished ─────────────────────────────────────────

  private handlePlayerFinished(userId: string, ps: WRPlayerState): void {
    this.state.finishCounter++;
    ps.hasFinished = true;
    ps.finishedAt = Date.now();
    ps.finishRank = this.state.finishCounter;

    this.logAction('player_finish', {
      userId,
      pathLength: ps.path.length,
      timeMs: (ps.finishedAt ?? Date.now()) - this.navigationStartedAt,
      path: [...ps.path],
      rank: ps.finishRank,
      clickCount: ps.clickCount,
    });

    logger.info({
      event: 'wiki_race:player_finished',
      lobbyId: this.context.lobbyId,
      userId,
      rank: ps.finishRank,
      clickCount: ps.clickCount,
    });

    this.broadcastGameAction({
      type: 'WR_PLAYER_FINISHED',
      userId,
      rank: ps.finishRank,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Send the target article to the winning player so they can read it
    // while waiting for other players. Intentionally skips the isRunning
    // check — the player should see the target even if the game ends.
    const targetTitle = this.state.articlePair.targetArticle.title;
    this.fetchAndSendArticle(targetTitle).then((article) => {
      if (!article) return;
      this.sendArticleToPlayerAndFollowers(userId, {
        type: 'WR_ARTICLE_CONTENT',
        title: article.title,
        html: article.sanitizedHtml,
        linkCount: article.links.size,
      });
    }).catch(() => {
      // Ignore — player just won't see the target article
    });

    // Check if all players finished — end early
    const allFinished = Array.from(this.state.playerStates.values()).every((p) => p.hasFinished);
    if (allFinished) {
      this.logAction('game_end', {
        reason: 'all_finished',
        finishedCount: this.state.finishCounter,
        totalPlayers: this.state.playerStates.size,
      });
      this.clearTrackedTimeout(this.navigationTimeoutHandle);
      this.navigationTimeoutHandle = null;
      this.clearPhaseTimer();
      this.computeScores();
      this.showResults();
    }
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeScores(): void {
    const targetTitle = this.state.articlePair.targetArticle.title;
    const finishedPlayers = Array.from(this.state.playerStates.values()).filter((p) => p.hasFinished);
    const fewestClicks = finishedPlayers.length > 0
      ? Math.min(...finishedPlayers.map((p) => p.clickCount))
      : 0;

    for (const ps of this.state.playerStates.values()) {
      if (ps.hasFinished) {
        // Base score for finishing
        let score = WR_FINISH_BASE;

        // Speed bonus: seconds remaining when finished
        const elapsedMs = (ps.finishedAt ?? Date.now()) - this.navigationStartedAt;
        const secsRemaining = Math.max(0, this.getSetting('navDuration', WR_NAV_DURATION) - Math.floor(elapsedMs / 1000));
        score += WR_SPEED_BONUS_PER_SEC * secsRemaining;

        // Efficiency bonus: fewer clicks relative to the best finisher
        if (this.getSetting('enableEfficiencyBonus', WR_EFFICIENCY_BONUS > 0)) {
          const efficiencyDelta = Math.max(0, fewestClicks + 3 - ps.clickCount);
          score += WR_EFFICIENCY_BONUS * efficiencyDelta;
        }

        ps.score = score;
      } else {
        // DNF scoring: base + click bonus
        ps.score = WR_DNF_BASE + WR_DNF_CLICK_BONUS * Math.min(ps.clickCount, 10);

        // One-away bonus: target was on the current page but player didn't click it
        const normalizedTarget = targetTitle.replace(/ /g, '_');
        if (this.getSetting('enableOneAwayPoints', WR_ONE_AWAY > 0) && (ps.currentArticleLinks.has(targetTitle) || ps.currentArticleLinks.has(normalizedTarget))) {
          ps.score += WR_ONE_AWAY;
        }
      }
    }
  }

  // ─── Rate Limiting ───────────────────────────────────────────

  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    let entry = this.rateLimits.get(userId);
    if (!entry) {
      entry = { timestamps: [] };
      this.rateLimits.set(userId, entry);
    }

    // Remove timestamps older than 1 second
    entry.timestamps = entry.timestamps.filter((t) => now - t < 1000);

    if (entry.timestamps.length >= WR_NAV_RATE_LIMIT) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  // ─── Article Fetching Helper ─────────────────────────────────

  private async fetchAndSendArticle(title: string): Promise<CachedArticle | null> {
    const article = await fetchArticle(title, this.articleCache);
    if (!article) {
      logger.warn({
        event: 'wiki_race:article_fetch_failed',
        lobbyId: this.context.lobbyId,
        title,
      });
    }
    return article;
  }

  // ─── State Masking ───────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const ps = this.state.playerStates.get(userId);

    // Other players' data: hide currentArticleTitle and path
    const otherPlayers: Record<string, unknown> = {};
    for (const [otherId, otherPs] of this.state.playerStates) {
      if (otherId === userId) continue;
      otherPlayers[otherId] = {
        userId: otherId,
        userName: this.context.players.get(otherId)?.userName ?? 'Unknown',
        clickCount: otherPs.clickCount,
        pathLength: otherPs.path.length,
        hasFinished: otherPs.hasFinished,
        finishRank: otherPs.finishRank,
        // currentArticleTitle and path are HIDDEN
      };
    }

    // Include current article HTML from cache so reconnecting clients
    // can render immediately without waiting for an async fetch.
    let currentArticleHtml: string | undefined;
    if (ps && this.state.phase === WikiRacePhase.NAVIGATION) {
      const normalizedTitle = ps.currentArticleTitle.replace(/ /g, '_');
      const cached = this.articleCache.get(normalizedTitle);
      if (cached) {
        currentArticleHtml = cached.sanitizedHtml;
      }
    }

    const base: Record<string, unknown> = {
      phase: this.state.phase,
      startArticle: {
        title: this.state.articlePair.startArticle.title,
        description: this.state.articlePair.startArticle.description,
      },
      targetArticle: {
        title: this.state.articlePair.targetArticle.title,
        description: this.state.articlePair.targetArticle.description,
      },
      difficulty: this.state.articlePair.difficulty,
      timeRemaining: this.state.timeRemaining,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      myState: ps
        ? {
            currentArticleTitle: ps.currentArticleTitle,
            currentArticleHtml,
            path: ps.path,
            clickCount: ps.clickCount,
            hasFinished: ps.hasFinished,
            finishRank: ps.finishRank,
            score: this.state.phase === WikiRacePhase.RESULTS ? ps.score : undefined,
          }
        : null,
      otherPlayers,
    };

    return base;
  }

  getStateForSpectator(): unknown {
    // Spectators can see all players' currentArticleTitle and paths
    const allPlayers: Record<string, unknown> = {};
    for (const [userId, ps] of this.state.playerStates) {
      allPlayers[userId] = {
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        currentArticleTitle: ps.currentArticleTitle,
        path: ps.path,
        clickCount: ps.clickCount,
        hasFinished: ps.hasFinished,
        finishRank: ps.finishRank,
        score: this.state.phase === WikiRacePhase.RESULTS ? ps.score : undefined,
      };
    }

    const base: Record<string, unknown> = {
      phase: this.state.phase,
      startArticle: {
        title: this.state.articlePair.startArticle.title,
        description: this.state.articlePair.startArticle.description,
      },
      targetArticle: {
        title: this.state.articlePair.targetArticle.title,
        description: this.state.articlePair.targetArticle.description,
      },
      difficulty: this.state.articlePair.difficulty,
      timeRemaining: this.state.timeRemaining,
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      players: allPlayers,
    };

    return base;
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
    // State preserved; scored as DNF at end if not finished
    logger.info({
      event: 'wiki_race:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
      hasFinished: this.state.playerStates.get(userId)?.hasFinished ?? false,
    });
  }

  handlePlayerReconnect(userId: string): void {
    // Re-fetch current article HTML so the player has content to click
    // and restore server-side currentArticleLinks for anti-cheat validation.
    // State snapshot delivery is handled centrally by ReconnectionHandler.
    const ps = this.state.playerStates.get(userId);
    if (ps && !ps.hasFinished && this.state.phase === WikiRacePhase.NAVIGATION) {
      this.fetchAndSendArticle(ps.currentArticleTitle).then((article) => {
        if (!this.isRunning || !article) return;
        const currentPs = this.state.playerStates.get(userId);
        if (!currentPs || currentPs.currentArticleTitle !== ps.currentArticleTitle) return;
        currentPs.currentArticleLinks = new Set(article.links);
        this.sendArticleToPlayerAndFollowers(userId, {
          type: 'WR_ARTICLE_CONTENT',
          title: article.title,
          html: article.sanitizedHtml,
          linkCount: article.links.size,
        });
      }).catch(() => {
        // Reconnection article fetch failed
      });
    }

    logger.info({
      event: 'wiki_race:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
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
        articlePair: {
          startArticle: this.state.articlePair.startArticle.title,
          targetArticle: this.state.articlePair.targetArticle.title,
          difficulty: this.state.articlePair.difficulty,
        },
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    for (const [userId, ps] of this.state.playerStates) {
      const player = this.context.players.get(userId);
      // Use cumulative scores across all rounds
      const totalScore = this.state.cumulativeScores.get(userId) ?? ps.score;
      entries.push({
        userId,
        userName: player?.userName ?? 'Unknown',
        score: totalScore,
        rank: 0,
        deltas: {
          clickCount: ps.clickCount,
          pathLength: ps.path.length,
          hasFinished: ps.hasFinished ? 1 : 0,
          finishRank: ps.finishRank,
        },
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];
    const players = Array.from(this.state.playerStates.values());
    const finishedPlayers = players.filter((p) => p.hasFinished);
    const targetTitle = this.state.articlePair.targetArticle.title;

    // Speed Runner — first to finish
    const firstFinisher = finishedPlayers.find((p) => p.finishRank === 1);
    if (firstFinisher) {
      awards.push({
        userId: firstFinisher.userId,
        title: 'Speed Runner',
        description: 'First to reach the target article',
        icon: 'person-standing',
      });
    }

    // Efficiency Expert — fewest clicks among finishers
    if (finishedPlayers.length > 0) {
      const fewestClicks = finishedPlayers.reduce((min, p) =>
        p.clickCount < min.clickCount ? p : min,
      );
      awards.push({
        userId: fewestClicks.userId,
        title: 'Efficiency Expert',
        description: `Reached the target in only ${fewestClicks.clickCount} clicks`,
        icon: 'target',
      });
    }

    // Tourist — most clicks overall
    if (players.length > 0) {
      const mostClicks = players.reduce((max, p) =>
        p.clickCount > max.clickCount ? p : max,
      );
      if (mostClicks.clickCount > 0) {
        awards.push({
          userId: mostClicks.userId,
          title: 'Tourist',
          description: `Explored ${mostClicks.clickCount} articles along the way`,
          icon: 'map',
        });
      }
    }

    // Almost There — target was in links but player didn't finish (DNF)
    const normalizedTargetAward = targetTitle.replace(/ /g, '_');
    for (const p of players) {
      if (!p.hasFinished && (p.currentArticleLinks.has(targetTitle) || p.currentArticleLinks.has(normalizedTargetAward))) {
        awards.push({
          userId: p.userId,
          title: 'Almost There',
          description: 'Target article was just one click away',
          icon: 'alert-circle',
        });
      }
    }

    return awards;
  }

  // ─── Action Log / Game Log ───────────────────────────────────

  private actionSeq = 0;

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.state.actionLog.push({
      seq: ++this.actionSeq,
      type,
      timestamp: Date.now(),
      payload: { ...payload, round: this.state.currentRound },
    });
  }

  private buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    // Timeout events are now logged inline at the end of each round
    // (in endNavigation), so no need to add them here.

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      navigationDuration: this.getSetting('navDuration', WR_NAV_DURATION),
      playerCount: this.context.players.size,
      finishedCount: this.state.finishCounter,
      players,
      initialState: {
        totalRounds: this.state.totalRounds,
        timeLimitSeconds: this.getSetting('navDuration', WR_NAV_DURATION),
        // Per-round article pairs for history reconstruction
        rounds: this.state.roundArticlePairs,
        // Backward-compat: keep flat fields pointing to the last round
        startArticle: this.state.articlePair.startArticle.title,
        targetArticle: this.state.articlePair.targetArticle.title,
        difficulty: this.state.articlePair.difficulty,
      },
      actions: this.state.actionLog,
      finalResults: Array.from(this.state.playerStates.entries()).map(([userId, ps]) => ({
        userId,
        userName: this.context.players.get(userId)?.userName ?? 'Unknown',
        score: this.state.cumulativeScores.get(userId) ?? ps.score ?? 0,
      })),
    };
  }
}
