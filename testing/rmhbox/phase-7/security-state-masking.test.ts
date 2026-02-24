/**
 * Phase 7 — Security & State Masking Tests
 *
 * Ensures no information leakage across the 2 Phase 7 minigames:
 * - Cursor Curling: aim/power data hidden from non-throwers; canSweep masking
 * - Human Tetris: cooperative game with minimal masking; isMe field scoping
 *
 * Reference: docs/rmhbox/design-spec/minigames-3.md §3–§4 (security requirements)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CursorCurlingGame } from '../../../server/rmhbox/minigames/cursor-curling';
import { HumanTetrisGame } from '../../../server/rmhbox/minigames/human-tetris';
import { createMockContext, MOCK_USERS, findLastActionBroadcast } from './setup';
import {
  CU_END_START_SECONDS,
  CU_AIM_DURATION_SECONDS,
  CU_SIMULATION_TICK_MS,
  HT_WALL_PREVIEW_SECONDS,
} from '../../../lib/rmhbox/constants';

// ─── Mock Human Tetris Data Loader ───────────────────────────────

vi.mock('../../../lib/rmhbox/human-tetris/data-loader', async () => {
  const actual = await vi.importActual('../../../lib/rmhbox/human-tetris/data-loader');
  return {
    ...actual,
    loadShapeTemplates: vi.fn(() => [
      { id: 'test-e1', holes: [{ col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 3, row: 3 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy L' },
      { id: 'test-e2', holes: [{ col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy line' },
    ]),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────

function actionPayload(entry: { data: Record<string, unknown> }): Record<string, unknown> {
  return entry.data.payload as Record<string, unknown>;
}

function getCurrentThrower(broadcastLog: Array<{ event: string; data: unknown }>): string {
  const active = findLastActionBroadcast(broadcastLog, 'CU_THROWER_ACTIVE');
  return actionPayload(active!).userId as string;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Security — State Masking (Phase 7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── Cursor Curling Security ─────────────────────────────────

  describe('Cursor Curling — State Masking', () => {
    it('during AIM phase: non-thrower state does NOT contain aim-related secret data', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      game.start();

      // Advance past END_START into AIM phase
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

      const throwerId = getCurrentThrower(ctx.broadcastLog);
      const nonThrowerIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ].filter((id) => id !== throwerId);

      // Thrower should see isMyTurn = true
      const throwerState = game.getStateForPlayer(throwerId) as Record<string, unknown>;
      expect(throwerState.isMyTurn).toBe(true);
      expect(throwerState.phase).toBe('AIM');

      // Non-throwers should see isMyTurn = false and NOT have aim direction data
      for (const nonThrowerId of nonThrowerIds) {
        const state = game.getStateForPlayer(nonThrowerId) as Record<string, unknown>;
        expect(state.isMyTurn).toBe(false);
        expect(state.phase).toBe('AIM');

        // Aim-related fields should not be present for non-throwers
        const stateJson = JSON.stringify(state);
        expect(state).not.toHaveProperty('aimAngle');
        expect(state).not.toHaveProperty('aimDirection');
        expect(state).not.toHaveProperty('powerLevel');
        // Verify no accidental leakage in serialized form
        expect(stateJson).not.toContain('"aimAngle"');
        expect(stateJson).not.toContain('"aimDirection"');
      }
    });

    it('during POWER phase: non-thrower state does NOT contain power info', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      game.start();

      // Advance past END_START into AIM, then into POWER
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);
      vi.advanceTimersByTime(CU_AIM_DURATION_SECONDS * 1000);

      const throwerId = getCurrentThrower(ctx.broadcastLog);
      const nonThrowerIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ].filter((id) => id !== throwerId);

      for (const nonThrowerId of nonThrowerIds) {
        const state = game.getStateForPlayer(nonThrowerId) as Record<string, unknown>;
        expect(state.phase).toBe('POWER');

        // Power-related fields should not be present
        expect(state).not.toHaveProperty('powerLevel');
        expect(state).not.toHaveProperty('power');
        expect(state).not.toHaveProperty('aimAngle');
      }
    });

    it('all players can see all stone positions (public state)', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      game.start();

      // Advance into AIM phase
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);
      const throwerId = getCurrentThrower(ctx.broadcastLog);

      // Throw a stone to create a stone on the rink
      game.handleInput(throwerId, 'THROW_STONE', { angle: 0, power: 0.5 });

      // Let simulation settle
      vi.advanceTimersByTime(CU_SIMULATION_TICK_MS * 300);

      // All players should see the stone positions
      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      for (const userId of allUserIds) {
        const state = game.getStateForPlayer(userId) as Record<string, unknown>;
        const stones = state.stones as Array<Record<string, unknown>>;
        expect(stones).toBeDefined();
        expect(Array.isArray(stones)).toBe(true);
        expect(stones.length).toBeGreaterThanOrEqual(1);
        // Each stone should have position data
        for (const stone of stones) {
          expect(stone.x).toBeDefined();
          expect(stone.y).toBeDefined();
          expect(stone.userId).toBeDefined();
        }
      }
    });

    it('during SIMULATION: thrower has canSweep=false, non-thrower has canSweep=true', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      game.start();

      // Advance into AIM phase
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);
      const throwerId = getCurrentThrower(ctx.broadcastLog);

      // Execute throw to enter SIMULATION
      game.handleInput(throwerId, 'THROW_STONE', { angle: 0, power: 0.5 });

      // Still in SIMULATION (before stone settles)
      const throwerState = game.getStateForPlayer(throwerId) as Record<string, unknown>;
      expect(throwerState.phase).toBe('SIMULATION');
      // Thrower should NOT be able to sweep their own stone
      expect(throwerState.canSweep).toBe(false);

      const nonThrowerIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ].filter((id) => id !== throwerId);

      for (const nonThrowerId of nonThrowerIds) {
        const state = game.getStateForPlayer(nonThrowerId) as Record<string, unknown>;
        expect(state.phase).toBe('SIMULATION');
        expect(state.canSweep).toBe(true);
      }
    });

    it('spectator view includes throwerName, all stone positions, and sweep data', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      game.start();

      // Advance into AIM phase
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;

      // Spectator should see thrower info (omniscient view)
      expect(spectatorState.throwerId).toBeDefined();
      expect(spectatorState.throwerName).toBeDefined();
      expect(spectatorState.stones).toBeDefined();
      expect(Array.isArray(spectatorState.stones)).toBe(true);
      expect(spectatorState.sweepingPlayers).toBeDefined();
      expect(Array.isArray(spectatorState.sweepingPlayers)).toBe(true);
      expect(spectatorState.endResults).toBeDefined();
    });

    it('Player A state should not contain Player B hidden data', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      game.start();

      // Advance into AIM phase
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;

      const aliceJson = JSON.stringify(aliceState);
      const bobJson = JSON.stringify(bobState);

      // Neither player's state should contain hidden aim/power fields of the other
      expect(aliceJson).not.toContain('"aimAngle"');
      expect(aliceJson).not.toContain('"powerLevel"');
      expect(bobJson).not.toContain('"aimAngle"');
      expect(bobJson).not.toContain('"powerLevel"');
    });
  });

  // ─── Human Tetris Security ──────────────────────────────────

  describe('Human Tetris — State Masking', () => {
    it('Player A sees isMe=true only for their own entry in playerPositions', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      game.start();

      // Advance past wall preview into positioning
      vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const positions = aliceState.playerPositions as Array<Record<string, unknown>>;

      expect(positions).toBeDefined();
      expect(positions.length).toBeGreaterThanOrEqual(4);

      const aliceEntry = positions.find((p) => p.userId === MOCK_USERS.alice.userId);
      expect(aliceEntry).toBeDefined();
      expect(aliceEntry!.isMe).toBe(true);

      // All other entries should NOT have isMe=true
      const otherEntries = positions.filter((p) => p.userId !== MOCK_USERS.alice.userId);
      for (const entry of otherEntries) {
        expect(entry.isMe).toBe(false);
      }
    });

    it('Player B sees isMe=true only for their own entry', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      game.start();

      vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);

      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;
      const positions = bobState.playerPositions as Array<Record<string, unknown>>;

      expect(positions).toBeDefined();

      const bobEntry = positions.find((p) => p.userId === MOCK_USERS.bob.userId);
      expect(bobEntry).toBeDefined();
      expect(bobEntry!.isMe).toBe(true);

      const otherEntries = positions.filter((p) => p.userId !== MOCK_USERS.bob.userId);
      for (const entry of otherEntries) {
        expect(entry.isMe).toBe(false);
      }
    });

    it('no player sees isMe=true for another player', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      game.start();

      vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);

      const allUsers = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];

      for (const user of allUsers) {
        const state = game.getStateForPlayer(user.userId) as Record<string, unknown>;
        const positions = state.playerPositions as Array<Record<string, unknown>>;

        for (const entry of positions) {
          if (entry.userId === user.userId) {
            expect(entry.isMe).toBe(true);
          } else {
            expect(entry.isMe).toBe(false);
          }
        }
      }
    });

    it('spectator view has no isMe=true for any player', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      game.start();

      vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);

      // getStateForSpectator calls getStateForPlayer('__spectator__')
      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      const positions = spectatorState.playerPositions as Array<Record<string, unknown>>;

      expect(positions).toBeDefined();
      expect(positions.length).toBeGreaterThanOrEqual(4);

      // No entry should have isMe=true since '__spectator__' is not a real player
      for (const entry of positions) {
        expect(entry.isMe).toBe(false);
      }
    });

    it('all players see same wall shape and holes', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      game.start();

      vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);

      const allUsers = [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana];
      const wallViews: string[] = [];

      for (const user of allUsers) {
        const state = game.getStateForPlayer(user.userId) as Record<string, unknown>;
        const wall = state.wall as Record<string, unknown>;
        expect(wall).toBeDefined();
        wallViews.push(JSON.stringify(wall));
      }

      // All players should see the same wall shape
      for (let i = 1; i < wallViews.length; i++) {
        expect(wallViews[i]).toBe(wallViews[0]);
      }
    });

    it('all players see all other player positions (cooperative, no hiding)', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      game.start();

      vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);

      const allUserIds = [
        MOCK_USERS.alice.userId,
        MOCK_USERS.bob.userId,
        MOCK_USERS.charlie.userId,
        MOCK_USERS.diana.userId,
      ];

      for (const userId of allUserIds) {
        const state = game.getStateForPlayer(userId) as Record<string, unknown>;
        const positions = state.playerPositions as Array<Record<string, unknown>>;

        // Each player's view should contain entries for all players
        const visibleUserIds = positions.map((p) => p.userId as string);
        for (const otherId of allUserIds) {
          expect(visibleUserIds).toContain(otherId);
        }
      }
    });
  });
});
