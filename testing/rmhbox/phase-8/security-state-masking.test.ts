/**
 * Phase 8 — Security State Masking Tests
 *
 * Dedicated security tests verifying that game state information
 * is properly hidden between players:
 *
 * - Pixel Pushers: push counts hidden during ACTIVE phase
 * - Scroll Soul: scores hidden, ads sent only to target player
 *
 * These tests ensure Player A cannot see Player B's hidden data.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PixelPushersMinigame } from '../../../server/rmhbox/minigames/pixel-pushers';
import { ScrollSoulMinigame } from '../../../server/rmhbox/minigames/scroll-soul';
import {
  MOCK_USERS,
  createMockContext,
  findPlayerEvents,
} from './setup';
import { PP_LEVEL_PREVIEW_SECONDS } from '../../../lib/rmhbox/constants';

describe('Phase 8 — Security State Masking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Pixel Pushers ──────────────────────────────────────────

  describe('Pixel Pushers State Masking', () => {
    it('player state should not contain push counts during ACTIVE', () => {
      const ctx = createMockContext();
      const game = new PixelPushersMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);

      // Get state for both Alice and Bob
      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;

      const alicePushers = aliceState.pushers as Array<Record<string, unknown>>;
      const bobPushers = bobState.pushers as Array<Record<string, unknown>>;

      // Neither Alice nor Bob should see pushCount in any pusher during ACTIVE
      for (const p of alicePushers) {
        expect(p).not.toHaveProperty('pushCount');
      }
      for (const p of bobPushers) {
        expect(p).not.toHaveProperty('pushCount');
      }
    });

    it('spectator state SHOULD contain push counts during ACTIVE', () => {
      const ctx = createMockContext();
      const game = new PixelPushersMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      const pushers = spectatorState.pushers as Array<Record<string, unknown>>;

      for (const p of pushers) {
        expect(p).toHaveProperty('pushCount');
      }
    });

    it('all player views should contain myUserId pointing to self', () => {
      const ctx = createMockContext();
      const game = new PixelPushersMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(PP_LEVEL_PREVIEW_SECONDS * 1000 + 100);

      for (const [userId] of ctx.context.players) {
        const state = game.getStateForPlayer(userId) as Record<string, unknown>;
        expect(state.myUserId).toBe(userId);
      }
    });
  });

  // ─── Scroll Soul ─────────────────────────────────────────────

  describe('Scroll Soul State Masking', () => {
    it('player should only see own score during ACTIVE', () => {
      const ctx = createMockContext();
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const scores = aliceState.scores as Array<{ userId: string; score: number }>;

      for (const s of scores) {
        if (s.userId !== MOCK_USERS.alice.userId) {
          expect(s.score).toBe(0); // Others' scores are masked to 0
        }
      }
    });

    it('player should not see ad stats of other players', () => {
      const ctx = createMockContext();
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const players = aliceState.players as Array<Record<string, unknown>>;

      for (const p of players) {
        expect(p).not.toHaveProperty('adsCorrectlyDismissed');
        expect(p).not.toHaveProperty('adsFailed');
      }
    });

    it('spectator should see all scores and ad stats', () => {
      const ctx = createMockContext();
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      const players = spectState.players as Array<Record<string, unknown>>;

      for (const p of players) {
        expect(p).toHaveProperty('adsCorrectlyDismissed');
        expect(p).toHaveProperty('adsFailed');
        expect(p).toHaveProperty('score');
      }
    });

    it('SC_AD_SPAWN events should only be sent to the targeted player', () => {
      const ctx = createMockContext();
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      // Wait for ads to spawn
      vi.advanceTimersByTime(30000);

      // Ad spawn events in playerLog are per-player only
      const aliceAdSpawns = findPlayerEvents(ctx.playerLog, MOCK_USERS.alice.userId).filter(
        (e) => {
          const data = e.data as Record<string, unknown>;
          return data.type === 'SC_AD_SPAWN';
        },
      );
      const bobAdSpawns = findPlayerEvents(ctx.playerLog, MOCK_USERS.bob.userId).filter(
        (e) => {
          const data = e.data as Record<string, unknown>;
          return data.type === 'SC_AD_SPAWN';
        },
      );

      // Ads are sent individually — not every player gets the same ones
      // (they may or may not get any, but the point is they're per-player)
      for (const spawn of aliceAdSpawns) {
        expect(spawn.userId).toBe(MOCK_USERS.alice.userId);
      }
      for (const spawn of bobAdSpawns) {
        expect(spawn.userId).toBe(MOCK_USERS.bob.userId);
      }
    });

    it('myUserId should point to the requesting player', () => {
      const ctx = createMockContext();
      const game = new ScrollSoulMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3500);

      for (const [userId] of ctx.context.players) {
        const state = game.getStateForPlayer(userId) as Record<string, unknown>;
        expect(state.myUserId).toBe(userId);
      }
    });
  });
});
