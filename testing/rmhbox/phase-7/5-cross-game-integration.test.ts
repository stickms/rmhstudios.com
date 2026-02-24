/**
 * Phase 7 — Section 7.5: Cross-Game Integration Tests
 *
 * Verifies that the 2 Phase 7 minigames (Cursor Curling, Human Tetris) are
 * correctly registered, can be instantiated, respect player count constraints,
 * coexist with Phase 5 games, and produce valid game history logs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MINIGAME_REGISTRY,
  getEligibleMinigames,
} from '../../../lib/rmhbox/minigame-registry';
import { MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { CursorCurlingGame } from '../../../server/rmhbox/minigames/cursor-curling';
import { HumanTetrisGame } from '../../../server/rmhbox/minigames/human-tetris';
import { createMockContext, MOCK_USERS } from './setup';
import {
  CU_END_START_SECONDS,
  CU_END_RESULTS_SECONDS,
  CU_TRANSITION_SECONDS,
  CU_SIMULATION_TICK_MS,
  HT_WALL_PREVIEW_SECONDS,
  HT_EASY_POSITION_SECONDS,
  HT_WALL_IMPACT_SECONDS,
  HT_WAVE_RESULTS_SECONDS,
} from '../../../lib/rmhbox/constants';

// ─── Mock Data Loader (Human Tetris) ─────────────────────────────

vi.mock('../../../lib/rmhbox/human-tetris/data-loader', async () => {
  const actual = await vi.importActual('../../../lib/rmhbox/human-tetris/data-loader');
  return {
    ...actual,
    loadShapeTemplates: vi.fn(() => [
      { id: 'test-e1', holes: [{col:3,row:2},{col:4,row:2},{col:5,row:2},{col:3,row:3}], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy L' },
      { id: 'test-e2', holes: [{col:2,row:1},{col:3,row:1},{col:4,row:1},{col:5,row:1}], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy line' },
      { id: 'test-e3', holes: [{col:3,row:2},{col:4,row:2},{col:3,row:3},{col:4,row:3}], requiredPlayers: 4, difficulty: 'easy', description: 'Test easy block' },
    ]),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────

function actionPayload(entry: { data: Record<string, unknown> }): Record<string, unknown> {
  return entry.data.payload as Record<string, unknown>;
}

function findLastActionBroadcast(
  log: Array<{ event: string; data: unknown }>,
  type: string,
): { event: string; data: Record<string, unknown> } | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.event === 'action' && (e.data as Record<string, unknown>).type === type) {
      return e as { event: string; data: Record<string, unknown> };
    }
  }
  return undefined;
}

function getCurrentThrower(broadcastLog: Array<{ event: string; data: unknown }>): string {
  const active = findLastActionBroadcast(broadcastLog, 'CU_THROWER_ACTIVE');
  return actionPayload(active!).userId as string;
}

function throwAndSettle(game: CursorCurlingGame, userId: string, angle: number, power: number) {
  game.handleInput(userId, 'THROW_STONE', { angle, power });
  vi.advanceTimersByTime(CU_SIMULATION_TICK_MS * 300);
}

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

function advanceFullWave(): void {
  vi.advanceTimersByTime(HT_WALL_PREVIEW_SECONDS * 1000);
  vi.advanceTimersByTime(HT_EASY_POSITION_SECONDS * 1000);
  vi.advanceTimersByTime(HT_WALL_IMPACT_SECONDS * 1000);
  vi.advanceTimersByTime(HT_WAVE_RESULTS_SECONDS * 1000);
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Cross-Game Integration — Phase 7 (§7.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── §7.5.1 Registry Verification ──────────────────────────

  describe('Registry Verification (§7.5.1)', () => {
    const PHASE_7_GAMES = ['cursor-curling', 'human-tetris'];

    it('should have both Phase 7 games registered', () => {
      for (const id of PHASE_7_GAMES) {
        expect(MINIGAME_REGISTRY[id]).toBeDefined();
        expect(MINIGAME_REGISTRY[id].id).toBe(id);
      }
    });

    it('should have correct metadata for cursor-curling', () => {
      const cc = MINIGAME_REGISTRY['cursor-curling'];
      expect(cc.category).toBe('action');
      expect(cc.minPlayers).toBe(2);
      expect(cc.maxPlayers).toBe(8);
      expect(cc.estimatedDurationSeconds).toBe(120);
    });

    it('should have correct metadata for human-tetris', () => {
      const ht = MINIGAME_REGISTRY['human-tetris'];
      expect(ht.category).toBe('action');
      expect(ht.minPlayers).toBe(4);
      expect(ht.maxPlayers).toBe(10);
      expect(ht.estimatedDurationSeconds).toBe(120);
      expect(ht.supportsTeams).toBe(true);
    });

    it('all games should have displayName, description, icon, and tags', () => {
      for (const id of PHASE_7_GAMES) {
        const game = MINIGAME_REGISTRY[id];
        expect(game.displayName).toBeDefined();
        expect(game.displayName.length).toBeGreaterThan(0);
        expect(game.description).toBeDefined();
        expect(game.description.length).toBeGreaterThan(0);
        expect(game.icon).toBeDefined();
        expect(game.tags).toBeDefined();
        expect(game.tags.length).toBeGreaterThan(0);
      }
    });

    it('all games should have joinInProgressPolicy', () => {
      for (const id of PHASE_7_GAMES) {
        const game = MINIGAME_REGISTRY[id];
        expect(game.joinInProgressPolicy).toBeDefined();
        expect(['spectate_only', 'join_immediately', 'join_next_subround']).toContain(
          game.joinInProgressPolicy,
        );
      }
    });

    it('each game should have a settingsSchema attached', () => {
      for (const id of PHASE_7_GAMES) {
        const game = MINIGAME_REGISTRY[id];
        expect(game.settingsSchema).toBeDefined();
        expect(Array.isArray(game.settingsSchema)).toBe(true);
        expect(game.settingsSchema!.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── §7.5.2 Player Count Filtering ─────────────────────────

  describe('Player Count Filtering (§7.5.2)', () => {
    it('with 4 players, both games should be eligible', () => {
      const eligible = getEligibleMinigames(4);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('cursor-curling');
      expect(ids).toContain('human-tetris');
    });

    it('with 2 players, cursor-curling eligible, human-tetris excluded (min 4)', () => {
      const eligible = getEligibleMinigames(2);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('cursor-curling');
      expect(ids).not.toContain('human-tetris');
    });

    it('with 3 players, cursor-curling eligible, human-tetris excluded (min 4)', () => {
      const eligible = getEligibleMinigames(3);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('cursor-curling');
      expect(ids).not.toContain('human-tetris');
    });

    it('with 9 players, cursor-curling excluded (max 8), human-tetris eligible', () => {
      const eligible = getEligibleMinigames(9);
      const ids = eligible.map((g) => g.id);
      expect(ids).not.toContain('cursor-curling');
      expect(ids).toContain('human-tetris');
    });
  });

  // ─── §7.5.1 Handler Instantiation ──────────────────────────

  describe('Handler Instantiation (§7.5.1)', () => {
    it('CursorCurlingGame can be instantiated with valid context', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      expect(game).toBeDefined();
    });

    it('HumanTetrisGame can be instantiated with valid context', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      expect(game).toBeDefined();
    });

    it('CursorCurlingGame implements start, handleInput, getStateForPlayer, getStateForSpectator, computeResults', () => {
      const ctx = createMockContext();
      const game = new CursorCurlingGame(ctx.context);
      expect(typeof game.start).toBe('function');
      expect(typeof game.handleInput).toBe('function');
      expect(typeof game.getStateForPlayer).toBe('function');
      expect(typeof game.getStateForSpectator).toBe('function');
      expect(typeof game.computeResults).toBe('function');
    });

    it('HumanTetrisGame implements start, handleInput, getStateForPlayer, getStateForSpectator, computeResults', () => {
      const ctx = createMockContext();
      const game = new HumanTetrisGame(ctx.context);
      expect(typeof game.start).toBe('function');
      expect(typeof game.handleInput).toBe('function');
      expect(typeof game.getStateForPlayer).toBe('function');
      expect(typeof game.getStateForSpectator).toBe('function');
      expect(typeof game.computeResults).toBe('function');
    });
  });

  // ─── §7.5.8 Phase 5 + Phase 7 Coexistence ──────────────────

  describe('Phase 5 + Phase 7 Coexistence (§7.5.8)', () => {
    const ALL_IMPLEMENTED = [
      'rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race',
      'cursor-curling', 'human-tetris',
    ];

    it('registry contains all 6 implemented games (4 Phase 5 + 2 Phase 7)', () => {
      for (const id of ALL_IMPLEMENTED) {
        expect(MINIGAME_REGISTRY[id]).toBeDefined();
        expect(MINIGAME_REGISTRY[id].id).toBe(id);
      }
    });

    it('no naming collisions among all registered games', () => {
      const registeredIds = Object.keys(MINIGAME_REGISTRY);
      const uniqueIds = new Set(registeredIds);
      expect(uniqueIds.size).toBe(registeredIds.length);

      // Verify all 6 are present
      for (const id of ALL_IMPLEMENTED) {
        expect(uniqueIds.has(id)).toBe(true);
      }
    });
  });

  // ─── §7.5.12 Server Registry Completeness ──────────────────

  describe('Server Registry Completeness (§7.5.12)', () => {
    it('CursorCurlingGame is registered as cursor-curling in server registry', () => {
      expect(MINIGAME_SERVER_REGISTRY.has('cursor-curling')).toBe(true);
      const GameClass = MINIGAME_SERVER_REGISTRY.get('cursor-curling')!;
      expect(GameClass).toBe(CursorCurlingGame);
    });

    it('HumanTetrisGame is registered as human-tetris in server registry', () => {
      expect(MINIGAME_SERVER_REGISTRY.has('human-tetris')).toBe(true);
      const GameClass = MINIGAME_SERVER_REGISTRY.get('human-tetris')!;
      expect(GameClass).toBe(HumanTetrisGame);
    });

    it('server registry entries instantiate with BaseMinigame interface', () => {
      const ctx = createMockContext();

      const CurlingClass = MINIGAME_SERVER_REGISTRY.get('cursor-curling')!;
      const curling = new CurlingClass(ctx.context);
      expect(typeof curling.start).toBe('function');
      expect(typeof curling.handleInput).toBe('function');
      expect(typeof curling.getStateForPlayer).toBe('function');
      expect(typeof curling.getStateForSpectator).toBe('function');
      expect(typeof curling.computeResults).toBe('function');

      const TetrisClass = MINIGAME_SERVER_REGISTRY.get('human-tetris')!;
      const tetris = new TetrisClass(ctx.context);
      expect(typeof tetris.start).toBe('function');
      expect(typeof tetris.handleInput).toBe('function');
      expect(typeof tetris.getStateForPlayer).toBe('function');
      expect(typeof tetris.getStateForSpectator).toBe('function');
      expect(typeof tetris.computeResults).toBe('function');
    });
  });

  // ─── §7.5.9 Game History Integration ────────────────────────

  describe('Game History Integration (§7.5.9)', () => {
    describe('Cursor Curling game log', () => {
      function runCurlingToCompletion() {
        const ctx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob]);
        ctx.context.gameSettings = { totalEnds: 1 };
        const broadcastLog = ctx.broadcastLog;
        const completedResults = ctx.completedResults;
        const game = new CursorCurlingGame(ctx.context);
        game.start();
        vi.advanceTimersByTime(CU_END_START_SECONDS * 1000);

        playFullEnd(game, broadcastLog, 2);
        vi.advanceTimersByTime(CU_END_RESULTS_SECONDS * 1000);
        vi.advanceTimersByTime(CU_TRANSITION_SECONDS * 1000);

        return { game, completedResults };
      }

      it('computeResults produces gameSpecificData with gameLog', () => {
        const { completedResults } = runCurlingToCompletion();
        expect(completedResults.length).toBe(1);

        const gameSpecific = completedResults[0].gameSpecificData as Record<string, unknown>;
        const gameLog = gameSpecific.gameLog as Record<string, unknown>;
        expect(gameLog).toBeDefined();
      });

      it('game log has minigameId, version, players, initialState, actions', () => {
        const { completedResults } = runCurlingToCompletion();
        const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;

        expect(gameLog.minigameId).toBe('cursor-curling');
        expect(gameLog.version).toBe(1);
        expect(gameLog.players).toBeDefined();
        expect(Array.isArray(gameLog.players)).toBe(true);
        expect(gameLog.initialState).toBeDefined();
        expect(gameLog.actions).toBeDefined();
        expect(Array.isArray(gameLog.actions)).toBe(true);
      });

      it('actions include end_start, throw, stone_rest, end_result, game_end', () => {
        const { completedResults } = runCurlingToCompletion();
        const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;
        const actions = gameLog.actions as Array<{ seq: number; type: string; timestamp: number; payload: unknown }>;

        expect(actions.length).toBeGreaterThan(0);
        const types = new Set(actions.map((a) => a.type));
        expect(types.has('end_start')).toBe(true);
        expect(types.has('throw')).toBe(true);
        expect(types.has('stone_rest')).toBe(true);
        expect(types.has('end_result')).toBe(true);
        expect(types.has('game_end')).toBe(true);
      });
    });

    describe('Human Tetris game log', () => {
      function runTetrisToCompletion() {
        const ctx = createMockContext();
        ctx.context.gameSettings = { totalWaves: 1 };
        const completedResults = ctx.completedResults;
        const game = new HumanTetrisGame(ctx.context);
        game.start();

        advanceFullWave();

        return { game, completedResults };
      }

      it('computeResults produces gameSpecificData with gameLog', () => {
        const { completedResults } = runTetrisToCompletion();
        expect(completedResults.length).toBe(1);

        const gameSpecific = completedResults[0].gameSpecificData as Record<string, unknown>;
        const gameLog = gameSpecific.gameLog as Record<string, unknown>;
        expect(gameLog).toBeDefined();
      });

      it('game log has minigameId, version, players, initialState, actions', () => {
        const { completedResults } = runTetrisToCompletion();
        const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;

        expect(gameLog.minigameId).toBe('human-tetris');
        expect(gameLog.version).toBe(1);
        expect(gameLog.players).toBeDefined();
        expect(Array.isArray(gameLog.players)).toBe(true);
        expect(gameLog.initialState).toBeDefined();
        expect(gameLog.actions).toBeDefined();
        expect(Array.isArray(gameLog.actions)).toBe(true);
      });

      it('actions include wave_start, wave_impact, wave_result, game_end', () => {
        const { completedResults } = runTetrisToCompletion();
        const gameLog = (completedResults[0].gameSpecificData as Record<string, unknown>).gameLog as Record<string, unknown>;
        const actions = gameLog.actions as Array<{ seq: number; type: string; timestamp: number; payload: unknown }>;

        expect(actions.length).toBeGreaterThan(0);
        const types = new Set(actions.map((a) => a.type));
        expect(types.has('wave_start')).toBe(true);
        expect(types.has('wave_impact')).toBe(true);
        expect(types.has('wave_result')).toBe(true);
        expect(types.has('game_end')).toBe(true);
      });
    });
  });
});
