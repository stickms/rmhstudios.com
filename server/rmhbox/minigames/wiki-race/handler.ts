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
import type { ArticlePair } from '@/lib/rmhbox/wiki-race/data-loader';
import { selectArticlePair } from '@/lib/rmhbox/wiki-race/data-loader';
import { NavigateSchema, GoBackSchema } from '@/lib/rmhbox/wiki-race/schemas';
import { createArticleCache, fetchArticle } from '@/lib/rmhbox/wiki-race/wikipedia-proxy';
import type { CachedArticle } from '@/lib/rmhbox/wiki-race/wikipedia-proxy';
import type { LRUCache } from 'lru-cache';
import {
  WR_NAV_DURATION,
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

  constructor(context: MinigameContext) {
    super(context);
    this.articleCache = createArticleCache();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();
    this.initializeState();

    logger.info({
      event: 'wiki_race:start',
      lobbyId: this.context.lobbyId,
      articlePair: this.state.articlePair.id,
      playerCount: this.context.players.size,
    });

    // Phase 1: ARTICLE_REVEAL
    this.state.phase = WikiRacePhase.ARTICLE_REVEAL;

    this.context.broadcastToLobby('rmhbox:game:action', {
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

    this.setTimeout(() => this.startNavigation(), WR_REVEAL * 1000);
  }

  private initializeState(): void {
    const articlePair = selectArticlePair([]);
    const playerStates = new Map<string, WRPlayerState>();

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
    }

    this.state = {
      phase: WikiRacePhase.ARTICLE_REVEAL,
      articlePair,
      playerStates,
      timeRemaining: WR_NAV_DURATION,
      finishCounter: 0,
      actionLog: [],
    };
  }

  // ─── Navigation Phase ────────────────────────────────────────

  private startNavigation(): void {
    if (!this.isRunning) return;

    this.state.phase = WikiRacePhase.NAVIGATION;
    this.state.timeRemaining = WR_NAV_DURATION;
    this.navigationStartedAt = Date.now();

    logger.info({
      event: 'wiki_race:navigation_start',
      lobbyId: this.context.lobbyId,
      duration: WR_NAV_DURATION,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'WR_NAVIGATION_START',
      duration: WR_NAV_DURATION,
      timeRemaining: WR_NAV_DURATION,
    });

    // Fetch start article for each player
    const startTitle = this.state.articlePair.startArticle.title;
    this.fetchAndSendArticle(startTitle).then((article) => {
      if (!this.isRunning || !article) return;
      // Populate links for all players from the start article
      for (const ps of this.state.playerStates.values()) {
        ps.currentArticleLinks = new Set(article.links);
      }
      // Send article content to each player privately
      for (const userId of this.state.playerStates.keys()) {
        this.context.sendToPlayer(userId, 'rmhbox:game:action', {
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
    this.startPhaseTimer(WR_NAV_DURATION);

    // End navigation when time expires
    this.setTimeout(() => this.endNavigation(), WR_NAV_DURATION * 1000);
  }

  private endNavigation(): void {
    if (!this.isRunning) return;

    // Clear the phase timer
    this.clearPhaseTimer();

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
      finishedCount: this.state.finishCounter,
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

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'WR_RESULTS',
      playerResults,
      optimalPathLength: this.state.articlePair.optimalPathLength,
      duration: WR_RESULTS,
    });

    // Show results countdown in the header timer
    this.startPhaseTimer(WR_RESULTS);

    this.setTimeout(() => this.endGame(), WR_RESULTS * 1000);
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

    // Update player state
    ps.clickCount++;
    ps.path.push(targetTitle);
    ps.currentArticleTitle = targetTitle;
    ps.currentArticleLinks = new Set<string>(); // Clear until new article loads

    this.logAction('navigate', {
      userId,
      targetTitle,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Broadcast progress (title hidden from other players — they see click count only)
    this.context.broadcastToPlayers('rmhbox:game:action', {
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

    // Fetch article and send to player
    this.fetchAndSendArticle(targetTitle).then((article) => {
      if (!this.isRunning || !article) return;
      const currentPs = this.state.playerStates.get(userId);
      if (!currentPs || currentPs.currentArticleTitle !== targetTitle) return;
      currentPs.currentArticleLinks = new Set(article.links);
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'WR_ARTICLE_CONTENT',
        title: article.title,
        html: article.sanitizedHtml,
        linkCount: article.links.size,
      });
    }).catch(() => {
      // Article fetch error — player stays on current page
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
    ps.currentArticleLinks = new Set<string>();

    this.logAction('go_back', {
      userId,
      targetTitle,
      pathIndex,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Broadcast progress
    this.context.broadcastToPlayers('rmhbox:game:action', {
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
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
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

    this.logAction('player_finished', {
      userId,
      rank: ps.finishRank,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    logger.info({
      event: 'wiki_race:player_finished',
      lobbyId: this.context.lobbyId,
      userId,
      rank: ps.finishRank,
      clickCount: ps.clickCount,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'WR_PLAYER_FINISHED',
      userId,
      rank: ps.finishRank,
      clickCount: ps.clickCount,
      pathLength: ps.path.length,
    });

    // Check if all players finished — end early
    const allFinished = Array.from(this.state.playerStates.values()).every((p) => p.hasFinished);
    if (allFinished) {
      this.logAction('game_end', {
        reason: 'all_finished',
        finishedCount: this.state.finishCounter,
        totalPlayers: this.state.playerStates.size,
      });
      this.clearPhaseTimer();
      this.computeScores();
      this.showResults();
    }
  }

  // ─── Scoring ─────────────────────────────────────────────────

  private computeScores(): void {
    const optimalPath = this.state.articlePair.optimalPathLength;
    const targetTitle = this.state.articlePair.targetArticle.title;

    for (const ps of this.state.playerStates.values()) {
      if (ps.hasFinished) {
        // Base score for finishing
        let score = WR_FINISH_BASE;

        // Speed bonus: seconds remaining when finished
        const elapsedMs = (ps.finishedAt ?? Date.now()) - this.navigationStartedAt;
        const secsRemaining = Math.max(0, WR_NAV_DURATION - Math.floor(elapsedMs / 1000));
        score += WR_SPEED_BONUS_PER_SEC * secsRemaining;

        // Efficiency bonus: fewer clicks relative to optimal
        const efficiencyDelta = Math.max(0, optimalPath + 2 - ps.clickCount);
        score += WR_EFFICIENCY_BONUS * efficiencyDelta;

        ps.score = score;
      } else {
        // DNF scoring
        if (ps.currentArticleLinks.has(targetTitle)) {
          // Target was on the current page but player didn't click it
          ps.score = WR_ONE_AWAY;
        } else {
          // Partial credit based on clicks made
          ps.score = WR_DNF_BASE + WR_DNF_CLICK_BONUS * Math.min(ps.clickCount, optimalPath);
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
      myState: ps
        ? {
            currentArticleTitle: ps.currentArticleTitle,
            path: ps.path,
            clickCount: ps.clickCount,
            hasFinished: ps.hasFinished,
            finishRank: ps.finishRank,
            score: this.state.phase === WikiRacePhase.RESULTS ? ps.score : undefined,
          }
        : null,
      otherPlayers,
    };

    // Only reveal optimal path during RESULTS
    if (this.state.phase === WikiRacePhase.RESULTS) {
      base.optimalPathLength = this.state.articlePair.optimalPathLength;
    }

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
      players: allPlayers,
    };

    // Optimal path hidden until RESULTS
    if (this.state.phase === WikiRacePhase.RESULTS) {
      base.optimalPathLength = this.state.articlePair.optimalPathLength;
    }

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
    // Send full state snapshot
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForPlayer(userId),
    );

    // Re-fetch current article HTML so the player has content to click
    const ps = this.state.playerStates.get(userId);
    if (ps && !ps.hasFinished && this.state.phase === WikiRacePhase.NAVIGATION) {
      this.fetchAndSendArticle(ps.currentArticleTitle).then((article) => {
        if (!this.isRunning || !article) return;
        const currentPs = this.state.playerStates.get(userId);
        if (!currentPs || currentPs.currentArticleTitle !== ps.currentArticleTitle) return;
        currentPs.currentArticleLinks = new Set(article.links);
        this.context.sendToPlayer(userId, 'rmhbox:game:action', {
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
          id: this.state.articlePair.id,
          startArticle: this.state.articlePair.startArticle.title,
          targetArticle: this.state.articlePair.targetArticle.title,
          optimalPathLength: this.state.articlePair.optimalPathLength,
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
      entries.push({
        userId,
        userName: player?.userName ?? 'Unknown',
        score: ps.score,
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

    // Optimal Path — finished with clicks ≤ optimalPathLength
    const optimalPath = this.state.articlePair.optimalPathLength;
    for (const p of finishedPlayers) {
      if (p.clickCount <= optimalPath) {
        awards.push({
          userId: p.userId,
          title: 'Optimal Path',
          description: `Found the optimal route in ${p.clickCount} clicks`,
          icon: 'star',
        });
      }
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
    for (const p of players) {
      if (!p.hasFinished && p.currentArticleLinks.has(targetTitle)) {
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

  private logAction(action: string, data: Record<string, unknown>): void {
    this.state.actionLog.push({
      action,
      timestamp: Date.now(),
      data,
    });
  }

  private buildGameLog(): Record<string, unknown> {
    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      navigationDuration: WR_NAV_DURATION,
      playerCount: this.context.players.size,
      finishedCount: this.state.finishCounter,
      actions: this.state.actionLog,
    };
  }
}
