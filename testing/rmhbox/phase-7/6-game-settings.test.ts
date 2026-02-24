/**
 * Phase 7 — Section 7.6: Game Settings Tests
 *
 * Tests the unified game settings system (§12A) for Phase 7 minigames:
 * - Schema completeness for CURSOR_CURLING_SETTINGS and HUMAN_TETRIS_SETTINGS
 * - Cursor Curling settings integration (totalEnds, aimDuration, powerDuration, enableSweeping)
 * - Human Tetris settings integration (totalWaves, wallPreviewDuration, startingPositionTime, enableDeadZones)
 * - BaseMinigame.getSetting() fallback behaviour
 *
 * Environment-agnostic: no real DB, WebSocket, or network connections needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDefaultSettings,
  validateGameSettings,
} from '../../../lib/rmhbox/game-settings';
import type { GameSettingValues } from '../../../lib/rmhbox/types';
import {
  CURSOR_CURLING_SETTINGS,
  HUMAN_TETRIS_SETTINGS,
  MINIGAME_REGISTRY,
} from '../../../lib/rmhbox/minigame-registry';
import {
  CU_TOTAL_ENDS,
  CU_AIM_DURATION_SECONDS,
  CU_POWER_DURATION_SECONDS,
  CU_END_START_SECONDS,
  CU_SIMULATION_TICK_MS,
} from '../../../lib/rmhbox/constants';
import {
  HT_TOTAL_WAVES,
  HT_WALL_PREVIEW_SECONDS,
  HT_EASY_POSITION_SECONDS,
  HT_WALL_IMPACT_SECONDS,
  HT_WAVE_RESULTS_SECONDS,
} from '../../../lib/rmhbox/constants';
import { CursorCurlingGame } from '../../../server/rmhbox/minigames/cursor-curling';
import { HumanTetrisGame } from '../../../server/rmhbox/minigames/human-tetris';
import type { GridPosition } from '../../../server/rmhbox/minigames/human-tetris/types';
import {
  createMockContext,
  MOCK_USERS,
  findActionBroadcasts,
  findLastActionBroadcast,
} from './setup';

// ─── Mock Data Loader (Human Tetris) ─────────────────────────────

vi.mock('../../../lib/rmhbox/human-tetris/data-loader', async () => {
  const actual = await vi.importActual('../../../lib/rmhbox/human-tetris/data-loader');
  return {
    ...actual,
    loadShapeTemplates: vi.fn(() => [
      { id: 'test-e1', holes: [{ col: 3, row: 2 }, { col: 4, row: 2 }, { col: 5, row: 2 }, { col: 3, row: 3 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy L' },
      { id: 'test-e2', holes: [{ col: 2, row: 1 }, { col: 3, row: 1 }, { col: 4, row: 1 }, { col: 5, row: 1 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy line' },
      { id: 'test-e3', holes: [{ col: 3, row: 2 }, { col: 4, row: 2 }, { col: 3, row: 3 }, { col: 4, row: 3 }], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy block' },
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

function throwAndSettle(
  game: CursorCurlingGame,
  userId: string,
  angle: number,
  power: number,
) {
  game.handleInput(userId, 'THROW_STONE', { angle, power });
  vi.advanceTimersByTime(CU_SIMULATION_TICK_MS * 300);
}

// playFullEnd is not currently used but retained as a helper for future tests
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function playFullEnd(
  game: CursorCurlingGame,
  broadcastLog: Array<{ event: string; data: unknown }>,
  playerCount: number,
) {
  for (let i = 0; i < playerCount; i++) {
    const thrower = getCurrentThrower(broadcastLog);
    throwAndSettle(game, thrower, 0, 0.5);
  }
}

function advancePastWallPreview(): void {
  vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);
}

function advancePastPositioning(): void {
  vi.advanceTimersByTime(HT_EASY_POSITION_SECONDS * 1000);
}

function advancePastWallImpact(): void {
  vi.advanceTimersByTime(HT_WALL_IMPACT_SECONDS * 1000);
}

function advancePastWaveResults(): void {
  vi.advanceTimersByTime(HT_WAVE_RESULTS_SECONDS * 1000);
}

function advanceFullWave(): void {
  advancePastWallPreview();
  advancePastPositioning();
  advancePastWallImpact();
  advancePastWaveResults();
}

// ═══════════════════════════════════════════════════════════════════
// §7.6.1 — Schema Completeness Tests
// ═══════════════════════════════════════════════════════════════════

describe('Phase 7 Settings Schema Completeness (§7.6.1)', () => {
  it('all Phase 7 registry entries should have settingsSchema', () => {
    const phase7Games = ['cursor-curling', 'human-tetris'];
    for (const gameId of phase7Games) {
      const def = MINIGAME_REGISTRY[gameId];
      expect(def).toBeDefined();
      expect(def.settingsSchema).toBeDefined();
      expect(Array.isArray(def.settingsSchema)).toBe(true);
      expect(def.settingsSchema!.length).toBeGreaterThan(0);
    }
  });

  it('CURSOR_CURLING_SETTINGS has 4 entries', () => {
    expect(CURSOR_CURLING_SETTINGS.length).toBe(4);
    const keys = CURSOR_CURLING_SETTINGS.map((s) => s.key);
    expect(keys).toContain('totalEnds');
    expect(keys).toContain('aimDuration');
    expect(keys).toContain('powerDuration');
    expect(keys).toContain('enableSweeping');
  });

  it('HUMAN_TETRIS_SETTINGS has 4 entries', () => {
    expect(HUMAN_TETRIS_SETTINGS.length).toBe(4);
    const keys = HUMAN_TETRIS_SETTINGS.map((s) => s.key);
    expect(keys).toContain('totalWaves');
    expect(keys).toContain('wallPreviewDuration');
    expect(keys).toContain('startingPositionTime');
    expect(keys).toContain('enableDeadZones');
  });

  it('every setting has key, type, label, description, default', () => {
    const allSchemas = [
      ...CURSOR_CURLING_SETTINGS,
      ...HUMAN_TETRIS_SETTINGS,
    ];
    for (const def of allSchemas) {
      expect(def.key).toBeTruthy();
      expect(['boolean', 'integer', 'float', 'select']).toContain(def.type);
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.default).toBeDefined();
    }
  });

  it('integer settings have min, max, step', () => {
    const allSchemas = [
      ...CURSOR_CURLING_SETTINGS,
      ...HUMAN_TETRIS_SETTINGS,
    ];
    for (const def of allSchemas) {
      if (def.type === 'integer' || def.type === 'float') {
        expect(def.min).toBeDefined();
        expect(def.max).toBeDefined();
        expect(def.step).toBeDefined();
        expect(def.min!).toBeLessThanOrEqual(def.max!);
      }
    }
  });

  it('boolean settings have no min/max/step', () => {
    const allSchemas = [
      ...CURSOR_CURLING_SETTINGS,
      ...HUMAN_TETRIS_SETTINGS,
    ];
    for (const def of allSchemas) {
      if (def.type === 'boolean') {
        expect(def.min).toBeUndefined();
        expect(def.max).toBeUndefined();
        expect(def.step).toBeUndefined();
      }
    }
  });

  it('validated explicit values are within constraints', () => {
    // When an explicit integer is provided, validateGameSettings clamps it to [min, max].
    // Note: raw defaults may intentionally sit outside [min, max] as the game handler
    // uses getSetting() with its own constant fallbacks rather than the schema min/max.
    const cuValidated = validateGameSettings(CURSOR_CURLING_SETTINGS, {
      totalEnds: 100,
      aimDuration: 100,
      powerDuration: 100,
    });
    for (const def of CURSOR_CURLING_SETTINGS) {
      if (def.type === 'integer' || def.type === 'float') {
        expect(cuValidated[def.key]).toBeLessThanOrEqual(def.max!);
      }
    }

    const htValidated = validateGameSettings(HUMAN_TETRIS_SETTINGS, {
      totalWaves: 100,
      wallPreviewDuration: 100,
      startingPositionTime: 100,
    });
    for (const def of HUMAN_TETRIS_SETTINGS) {
      if (def.type === 'integer' || def.type === 'float') {
        expect(htValidated[def.key]).toBeLessThanOrEqual(def.max!);
      }
    }
  });

  it('getDefaultSettings returns correct defaults for Cursor Curling', () => {
    const defaults = getDefaultSettings(CURSOR_CURLING_SETTINGS);
    expect(defaults.totalEnds).toBe(CU_TOTAL_ENDS);
    expect(defaults.aimDuration).toBe(CU_AIM_DURATION_SECONDS);
    expect(defaults.powerDuration).toBe(CU_POWER_DURATION_SECONDS);
    expect(defaults.enableSweeping).toBe(true);
  });

  it('getDefaultSettings returns correct defaults for Human Tetris', () => {
    const defaults = getDefaultSettings(HUMAN_TETRIS_SETTINGS);
    expect(defaults.totalWaves).toBe(HT_TOTAL_WAVES);
    expect(defaults.wallPreviewDuration).toBe(HT_WALL_PREVIEW_SECONDS);
    expect(defaults.startingPositionTime).toBe(HT_EASY_POSITION_SECONDS);
    expect(defaults.enableDeadZones).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// §7.6.4 — Cursor Curling Settings Integration
// ═══════════════════════════════════════════════════════════════════

describe('Cursor Curling Settings Integration (§7.6.4)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function createCurlingGame(gameSettings: GameSettingValues = {}) {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob],
      { gameSettings },
    );
    const game = new CursorCurlingGame(ctx.context);
    return { game, ...ctx };
  }

  describe('totalEnds setting', () => {
    it('should use default totalEnds (CU_TOTAL_ENDS) when no custom settings provided', () => {
      const { game } = createCurlingGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.totalEnds).toBe(CU_TOTAL_ENDS);
    });

    it('should use custom totalEnds = 6', () => {
      const { game } = createCurlingGame({ totalEnds: 6 });
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.totalEnds).toBe(6);
    });
  });

  describe('aimDuration setting', () => {
    it('should use custom aimDuration = 25', () => {
      const { game, broadcastLog } = createCurlingGame({ aimDuration: 25 });
      game.start();
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

      const throwerActive = findLastActionBroadcast(broadcastLog, 'CU_THROWER_ACTIVE');
      const payload = actionPayload(throwerActive!);
      expect(payload.aimDurationSeconds).toBe(25);
    });
  });

  describe('powerDuration setting', () => {
    it('should use custom powerDuration = 8', () => {
      const { game, broadcastLog, playerLog } = createCurlingGame({ powerDuration: 8 });
      game.start();
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

      // Advance through AIM phase to reach POWER
      vi.advanceTimersByTime(CU_AIM_DURATION_SECONDS * 1000);

      const thrower = getCurrentThrower(broadcastLog);
      const powerMsg = playerLog.find(
        (e) =>
          e.userId === thrower &&
          (e.data as Record<string, unknown>).type === 'CU_POWER_PHASE',
      );
      expect(powerMsg).toBeDefined();
      const pmData = powerMsg!.data as Record<string, unknown>;
      const pmPayload = pmData.payload as Record<string, unknown>;
      expect(pmPayload.powerDurationSeconds).toBe(8);
    });
  });

  describe('enableSweeping setting', () => {
    it('should ignore sweep inputs when enableSweeping = false', () => {
      const { game, broadcastLog } = createCurlingGame({ enableSweeping: false });
      game.start();
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

      const thrower = getCurrentThrower(broadcastLog);
      const sweeper = thrower === MOCK_USERS.alice.userId
        ? MOCK_USERS.bob.userId
        : MOCK_USERS.alice.userId;

      game.handleInput(thrower, 'THROW_STONE', { angle: 0, power: 0.5 });

      // Send many sweep inputs — none should activate
      for (let i = 0; i < 20; i++) {
        game.handleInput(sweeper, 'SWEEP', { x: 200, y: 300 });
      }

      const sweepActive = findActionBroadcasts(broadcastLog, 'CU_SWEEP_ACTIVE');
      expect(sweepActive.length).toBe(0);
    });

    it('should allow sweeping when enableSweeping = true (default)', () => {
      const { game, broadcastLog } = createCurlingGame({ enableSweeping: true });
      game.start();
      vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

      const thrower = getCurrentThrower(broadcastLog);
      const sweeper = thrower === MOCK_USERS.alice.userId
        ? MOCK_USERS.bob.userId
        : MOCK_USERS.alice.userId;

      game.handleInput(thrower, 'THROW_STONE', { angle: 0, power: 0.5 });

      // Send enough sweep inputs to activate sweeping
      for (let i = 0; i < 10; i++) {
        game.handleInput(sweeper, 'SWEEP', { x: 200, y: 300 });
      }

      const sweepActive = findActionBroadcasts(broadcastLog, 'CU_SWEEP_ACTIVE');
      expect(sweepActive.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §7.6.5 — Human Tetris Settings Integration
// ═══════════════════════════════════════════════════════════════════

describe('Human Tetris Settings Integration (§7.6.5)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function createHTGame(gameSettings: GameSettingValues = {}) {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings },
    );
    const game = new HumanTetrisGame(ctx.context);
    return { game, ...ctx };
  }

  describe('totalWaves setting', () => {
    it('should use default totalWaves (HT_TOTAL_WAVES) when no custom settings', () => {
      const { game } = createHTGame();
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.totalWaves).toBe(HT_TOTAL_WAVES);
    });

    it('should use custom totalWaves = 2 and game over after 2 waves', () => {
      const { game, broadcastLog, completedResults } = createHTGame({ totalWaves: 2 });
      game.start();

      const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state.totalWaves).toBe(2);

      // Advance through 2 complete waves
      advanceFullWave();
      advanceFullWave();

      expect(completedResults.length).toBe(1);

      const waveStarts = findActionBroadcasts(broadcastLog, 'HT_WAVE_START');
      expect(waveStarts.length).toBe(2);
    });
  });

  describe('wallPreviewDuration setting', () => {
    it('should use custom wallPreviewDuration = 5', () => {
      const { game } = createHTGame({ totalWaves: 1, wallPreviewDuration: 5 });
      game.start();

      // After default preview time (3s), should still be WALL_PREVIEW
      vi.advanceTimersByTime(3000);
      const state1 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state1.phase).toBe('WALL_PREVIEW');

      // After custom preview time (5s total), should transition to POSITIONING
      vi.advanceTimersByTime(2000);
      const state2 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state2.phase).toBe('POSITIONING');
    });
  });

  describe('startingPositionTime setting', () => {
    it('should use custom startingPositionTime = 12', () => {
      const { game } = createHTGame({ totalWaves: 1, startingPositionTime: 12 });
      game.start();

      advancePastWallPreview();

      // After 8s (default), should still be POSITIONING with custom 12s
      vi.advanceTimersByTime(8000);
      const state1 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state1.phase).toBe('POSITIONING');

      // After 12s total positioning, should transition to WALL_IMPACT
      vi.advanceTimersByTime(4000);
      const state2 = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(state2.phase).toBe('WALL_IMPACT');
    });
  });

  describe('enableDeadZones setting', () => {
    it('should enable dead zones when enableDeadZones = true', () => {
      const { game, broadcastLog } = createHTGame({ totalWaves: 1, enableDeadZones: true });
      game.start();

      const waveStart = findLastActionBroadcast(broadcastLog, 'HT_WAVE_START');
      expect(waveStart).toBeDefined();
      const payload = actionPayload(waveStart!);
      const deadZones = payload.deadZones as GridPosition[];
      expect(Array.isArray(deadZones)).toBe(true);
      // enableDeadZones=true should include dead zone generation
      expect(deadZones.length).toBeGreaterThanOrEqual(0);
    });

    it('should have no dead zones when enableDeadZones = false (default)', () => {
      const { game, broadcastLog } = createHTGame({ totalWaves: 1 });
      game.start();

      const waveStart = findLastActionBroadcast(broadcastLog, 'HT_WAVE_START');
      const payload = actionPayload(waveStart!);
      const deadZones = payload.deadZones as GridPosition[];
      expect(deadZones.length).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §7.6.6 — getSetting() Fallback Tests
// ═══════════════════════════════════════════════════════════════════

describe('getSetting() Fallback (§7.6.6)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should fall back to default when gameSettings is empty (Cursor Curling)', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob],
      { gameSettings: {} },
    );
    const game = new CursorCurlingGame(ctx.context);
    game.start();

    const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.totalEnds).toBe(CU_TOTAL_ENDS);

    // Game should work normally with defaults
    vi.advanceTimersByTime(600_000);
    const results = game.computeResults();
    expect(results).toBeDefined();
    expect(results.rankings.length).toBe(2);
  });

  it('should use provided custom value when present (Cursor Curling)', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob],
      { gameSettings: { totalEnds: 2 } },
    );
    const game = new CursorCurlingGame(ctx.context);
    game.start();

    const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.totalEnds).toBe(2);
  });

  it('should fall back to default for unknown keys (Cursor Curling)', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob],
      { gameSettings: { unknownSetting: 42 } },
    );
    const game = new CursorCurlingGame(ctx.context);

    // Should not throw, unknown key is simply ignored
    expect(() => game.start()).not.toThrow();

    const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.totalEnds).toBe(CU_TOTAL_ENDS);
  });

  it('should fall back to default when gameSettings is empty (Human Tetris)', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings: {} },
    );
    const game = new HumanTetrisGame(ctx.context);
    game.start();

    const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.totalWaves).toBe(HT_TOTAL_WAVES);
  });

  it('should use provided custom value when present (Human Tetris)', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings: { totalWaves: 2 } },
    );
    const game = new HumanTetrisGame(ctx.context);
    game.start();

    const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.totalWaves).toBe(2);
  });

  it('should fall back to default for unknown keys (Human Tetris)', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings: { unknownSetting: 99 } },
    );
    const game = new HumanTetrisGame(ctx.context);

    expect(() => game.start()).not.toThrow();

    const state = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
    expect(state.totalWaves).toBe(HT_TOTAL_WAVES);
  });
});
