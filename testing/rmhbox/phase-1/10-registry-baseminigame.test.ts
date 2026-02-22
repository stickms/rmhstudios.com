/**
 * Phase 1 — Section 10: Minigame Registry & BaseMinigame
 *
 * Tests the minigame registry entries and the BaseMinigame abstract class.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MINIGAME_REGISTRY,
  getEligibleMinigames,
} from '../../../lib/rmhbox/minigame-registry';
import {
  BaseMinigame,
  type MinigameContext,
  type MinigameResults,
} from '../../../server/rmhbox/minigames/base-minigame';
import type { RMHboxPlayer } from '../../../server/rmhbox/types';

// ─── Test Subclass ───────────────────────────────────────────────

/** Minimal concrete implementation for testing BaseMinigame */
class TestMinigame extends BaseMinigame {
  public startCalled = false;
  public inputs: Array<{ userId: string; action: string; data: unknown }> = [];

  start(): void {
    this.isRunning = true;
    this.startCalled = true;
  }

  handleInput(userId: string, action: string, data: unknown): void {
    this.inputs.push({ userId, action, data });
  }

  getStateForPlayer(userId: string): unknown {
    return { userId, state: this.gameState };
  }

  getStateForSpectator(): unknown {
    return { spectatorView: true };
  }

  computeResults(): MinigameResults {
    return {
      rankings: [],
      awards: [],
      gameSpecificData: {},
      duration: 1000,
    };
  }

  // Expose protected methods for testing
  public testSetTimeout(fn: () => void, ms: number) {
    return this.setTimeout(fn, ms);
  }

  public testSetInterval(fn: () => void, ms: number) {
    return this.setInterval(fn, ms);
  }

  public testCleanup() {
    this.cleanup();
  }

  public getTimerCount() {
    return this.timers.length;
  }

  public getIntervalCount() {
    return this.intervals.length;
  }

  public getIsRunning() {
    return this.isRunning;
  }
}

function createTestContext(overrides: Partial<MinigameContext> = {}): MinigameContext {
  return {
    lobbyId: 'TEST01',
    players: new Map<string, RMHboxPlayer>(),
    settings: {
      isPublic: false,
      maxPlayers: 8,
      maxSpectators: 20,
      allowMidGameJoin: false,
      allowSpectatorPromotion: true,
      autoStartThreshold: null,
      gameDurationOverride: null,
    },
    broadcastToLobby: vi.fn(),
    broadcastToPlayers: vi.fn(),
    sendToPlayer: vi.fn(),
    sendToSpectators: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

// ─── Registry Tests ──────────────────────────────────────────────

describe('Minigame Registry (§10.1)', () => {
  it('should contain exactly 16 minigames', () => {
    expect(Object.keys(MINIGAME_REGISTRY)).toHaveLength(16);
  });

  it('should have correct IDs matching their keys', () => {
    for (const [key, def] of Object.entries(MINIGAME_REGISTRY)) {
      expect(def.id).toBe(key);
    }
  });

  it('should have valid categories for all games', () => {
    const validCategories = ['word', 'trivia', 'action', 'creative'];
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(validCategories).toContain(def.category);
    }
  });

  it('should have valid joinInProgressPolicy for all games', () => {
    const validPolicies = ['spectate_only', 'join_next_subround', 'join_immediately'];
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(validPolicies).toContain(def.joinInProgressPolicy);
    }
  });

  it('should have minPlayers >= 2 for all games', () => {
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(def.minPlayers).toBeGreaterThanOrEqual(2);
    }
  });

  it('should have maxPlayers >= minPlayers for all games', () => {
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(def.maxPlayers).toBeGreaterThanOrEqual(def.minPlayers);
    }
  });

  it('should have non-empty displayName and description for all games', () => {
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('should have non-empty icon for all games', () => {
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(def.icon.length).toBeGreaterThan(0);
    }
  });

  it('should have positive estimated duration for all games', () => {
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(def.estimatedDurationSeconds).toBeGreaterThan(0);
    }
  });

  it('should contain specific game: rhyme-time', () => {
    const game = MINIGAME_REGISTRY['rhyme-time'];
    expect(game).toBeDefined();
    expect(game.category).toBe('word');
    expect(game.minPlayers).toBe(2);
    expect(game.maxPlayers).toBe(10);
    expect(game.estimatedDurationSeconds).toBe(120);
    expect(game.supportsTeams).toBe(false);
    expect(game.joinInProgressPolicy).toBe('spectate_only');
  });

  it('should contain specific game: undercover-agent with teams', () => {
    const game = MINIGAME_REGISTRY['undercover-agent'];
    expect(game).toBeDefined();
    expect(game.supportsTeams).toBe(true);
    expect(game.minPlayers).toBe(4);
    expect(game.maxPlayers).toBe(16);
  });

  it('should contain specific game: pixel-pushers with join_immediately', () => {
    const game = MINIGAME_REGISTRY['pixel-pushers'];
    expect(game).toBeDefined();
    expect(game.joinInProgressPolicy).toBe('join_immediately');
    expect(game.supportsTeams).toBe(true);
  });

  it('should have preloadAssets defined for all games', () => {
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(def.preloadAssets).toBeDefined();
      expect(Array.isArray(def.preloadAssets.images)).toBe(true);
      expect(Array.isArray(def.preloadAssets.sounds)).toBe(true);
      expect(Array.isArray(def.preloadAssets.data)).toBe(true);
      expect(typeof def.preloadAssets.estimatedSizeBytes).toBe('number');
    }
  });

  it('should have tags array for all games', () => {
    for (const def of Object.values(MINIGAME_REGISTRY)) {
      expect(Array.isArray(def.tags)).toBe(true);
      expect(def.tags.length).toBeGreaterThan(0);
    }
  });
});

describe('getEligibleMinigames', () => {
  it('should return all 16 games for playerCount=4', () => {
    const eligible = getEligibleMinigames(4);
    // Games with minPlayers <= 4 and maxPlayers >= 4
    expect(eligible.length).toBeGreaterThan(0);
    for (const game of eligible) {
      expect(game.minPlayers).toBeLessThanOrEqual(4);
      expect(game.maxPlayers).toBeGreaterThanOrEqual(4);
    }
  });

  it('should exclude games requiring more than 2 players when playerCount=2', () => {
    const eligible = getEligibleMinigames(2);
    for (const game of eligible) {
      expect(game.minPlayers).toBeLessThanOrEqual(2);
    }
    // Games like undercover-agent (min 4) should not be included
    expect(eligible.find((g) => g.id === 'undercover-agent')).toBeUndefined();
  });

  it('should return no games for playerCount=1', () => {
    const eligible = getEligibleMinigames(1);
    expect(eligible).toHaveLength(0);
  });

  it('should return only games supporting 16 players for playerCount=16', () => {
    const eligible = getEligibleMinigames(16);
    for (const game of eligible) {
      expect(game.maxPlayers).toBeGreaterThanOrEqual(16);
    }
    // undercover-agent (max 16) and fact-or-friction (max 16) should be included
    expect(eligible.find((g) => g.id === 'undercover-agent')).toBeDefined();
    expect(eligible.find((g) => g.id === 'fact-or-friction')).toBeDefined();
    // rhyme-time (max 10) should not be included
    expect(eligible.find((g) => g.id === 'rhyme-time')).toBeUndefined();
  });

  it('should include scroll-soul for playerCount=2', () => {
    const eligible = getEligibleMinigames(2);
    expect(eligible.find((g) => g.id === 'scroll-soul')).toBeDefined();
  });
});

// ─── BaseMinigame Tests ──────────────────────────────────────────

describe('BaseMinigame (§10.2)', () => {
  let game: TestMinigame;
  let ctx: MinigameContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createTestContext();
    game = new TestMinigame(ctx);
  });

  afterEach(() => {
    game.testCleanup();
    vi.useRealTimers();
  });

  it('should instantiate without errors', () => {
    expect(game).toBeInstanceOf(BaseMinigame);
  });

  it('should call start() on concrete subclass', () => {
    game.start();
    expect(game.startCalled).toBe(true);
    expect(game.getIsRunning()).toBe(true);
  });

  it('should collect inputs via handleInput()', () => {
    game.handleInput('user-1', 'answer', { text: 'cat' });
    game.handleInput('user-2', 'answer', { text: 'hat' });
    expect(game.inputs).toHaveLength(2);
    expect(game.inputs[0].userId).toBe('user-1');
  });

  it('should return per-player state via getStateForPlayer()', () => {
    const state = game.getStateForPlayer('user-1');
    expect(state).toEqual({ userId: 'user-1', state: {} });
  });

  it('should return spectator state via getStateForSpectator()', () => {
    const state = game.getStateForSpectator();
    expect(state).toEqual({ spectatorView: true });
  });

  it('should return results via computeResults()', () => {
    const results = game.computeResults();
    expect(results.rankings).toEqual([]);
    expect(results.awards).toEqual([]);
    expect(results.duration).toBe(1000);
  });

  it('should track setTimeout calls and clean them up', () => {
    const fn = vi.fn();
    game.testSetTimeout(fn, 1000);
    expect(game.getTimerCount()).toBe(1);

    game.testCleanup();
    expect(game.getTimerCount()).toBe(0);

    // Timer should not fire after cleanup
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should track setInterval calls and clean them up', () => {
    const fn = vi.fn();
    game.testSetInterval(fn, 100);
    expect(game.getIntervalCount()).toBe(1);

    vi.advanceTimersByTime(350);
    expect(fn).toHaveBeenCalledTimes(3);

    game.testCleanup();
    expect(game.getIntervalCount()).toBe(0);

    // Interval should not fire after cleanup
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should catch errors in setTimeout callbacks and call onError', () => {
    const error = new Error('test error');
    game.testSetTimeout(() => {
      throw error;
    }, 100);

    vi.advanceTimersByTime(200);
    expect(ctx.onError).toHaveBeenCalledWith(error);
  });

  it('should catch errors in setInterval callbacks and call onError', () => {
    const error = new Error('interval error');
    game.testSetInterval(() => {
      throw error;
    }, 100);

    vi.advanceTimersByTime(100);
    expect(ctx.onError).toHaveBeenCalledWith(error);
  });

  it('should remove timer from tracking after it fires', () => {
    game.testSetTimeout(() => {}, 100);
    expect(game.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(200);
    expect(game.getTimerCount()).toBe(0);
  });

  it('should set isRunning to false on cleanup', () => {
    game.start();
    expect(game.getIsRunning()).toBe(true);

    game.testCleanup();
    expect(game.getIsRunning()).toBe(false);
  });

  it('should call onComplete with results on forceEnd()', () => {
    game.start();
    game.forceEnd('not enough players');
    expect(ctx.onComplete).toHaveBeenCalledTimes(1);
    expect(game.getIsRunning()).toBe(false);
  });

  it('should send state snapshot on handlePlayerReconnect()', () => {
    game.handlePlayerReconnect('user-1');
    expect(ctx.sendToPlayer).toHaveBeenCalledWith(
      'user-1',
      'rmhbox:game:state_snapshot',
      { userId: 'user-1', state: {} },
    );
  });

  it('should handle handlePlayerDisconnect without errors', () => {
    // Default implementation is a no-op
    expect(() => game.handlePlayerDisconnect('user-1')).not.toThrow();
  });
});
