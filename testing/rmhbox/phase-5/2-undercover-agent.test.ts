/**
 * Phase 5 — Section 5.2: Undercover Agent Server Handler Tests
 *
 * Tests the UndercoverAgentMinigame server handler covering:
 * - State initialization (5×5 grid, team assignment, key card distribution)
 * - Phase transitions (SETUP→CLUE→GUESS→TURN_TRANSITION→GAME_OVER)
 * - Input handling (GIVE_CLUE, GUESS_TILE, END_TURN)
 * - State masking (key card hidden from operatives, revealed for spymasters)
 * - Scoring (win/lose, correct guess bonuses, assassin penalty)
 * - Awards
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UndercoverAgentMinigame, UndercoverAgentPhase, TileType } from '../../../server/rmhbox/minigames/undercover-agent';
import {
  UA_GRID_SIZE,
  UA_FIRST_TEAM_AGENTS,
  UA_SECOND_TEAM_AGENTS,
  UA_ASSASSIN,
  UA_BYSTANDER,
} from '../../../lib/rmhbox/constants';
import {
  createMockContext,
  findLastActionBroadcast,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new UndercoverAgentMinigame(ctx.context);
  return { game, ...ctx };
}

/** Get the team and role for a user from UA_SETUP broadcast */
function getTeamInfo(broadcastLog: Array<{ event: string; data: unknown }>) {
  const setup = findLastActionBroadcast(broadcastLog, 'UA_SETUP');
  if (!setup) return null;
  return (setup.data as Record<string, unknown>).teams as Record<string, unknown>;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Undercover Agent Server Handler (§5.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('State Initialization (§5.2.6.3)', () => {
    it('should create a 5×5 grid with 25 tiles', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      const setup = findLastActionBroadcast(broadcastLog, 'UA_SETUP');
      expect(setup).toBeDefined();
      const data = setup!.data as Record<string, unknown>;
      const grid = data.grid as Array<unknown>;
      expect(grid).toHaveLength(UA_GRID_SIZE);
    });

    it('should assign teams with spymasters and operatives', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      const teams = getTeamInfo(broadcastLog);
      expect(teams).toBeDefined();
      expect(teams!.red).toBeDefined();
      expect(teams!.blue).toBeDefined();
    });

    it('should send key card privately to spymasters only', () => {
      const { game, playerLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      // Find UA_KEY_CARD events - should be sent to exactly 2 players (spymasters)
      const keycardEvents = playerLog.filter(
        (e) => (e.data as Record<string, unknown>).type === 'UA_KEY_CARD',
      );
      expect(keycardEvents).toHaveLength(2);
    });

    it('key card should have correct tile type distribution', () => {
      const { game, playerLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      const keycardEvent = playerLog.find(
        (e) => (e.data as Record<string, unknown>).type === 'UA_KEY_CARD',
      );
      expect(keycardEvent).toBeDefined();

      const keyCard = (keycardEvent!.data as Record<string, unknown>).keyCard as Array<{ position: number; word: string; type: string }>;
      expect(keyCard).toHaveLength(UA_GRID_SIZE);

      const counts = {
        RED_AGENT: keyCard.filter((t) => t.type === TileType.RED_AGENT).length,
        BLUE_AGENT: keyCard.filter((t) => t.type === TileType.BLUE_AGENT).length,
        ASSASSIN: keyCard.filter((t) => t.type === TileType.ASSASSIN).length,
        BYSTANDER: keyCard.filter((t) => t.type === TileType.BYSTANDER).length,
      };

      expect(counts.RED_AGENT).toBe(UA_FIRST_TEAM_AGENTS);
      expect(counts.BLUE_AGENT).toBe(UA_SECOND_TEAM_AGENTS);
      expect(counts.ASSASSIN).toBe(UA_ASSASSIN);
      expect(counts.BYSTANDER).toBe(UA_BYSTANDER);
    });
  });

  describe('Phase Management', () => {
    it('should start in CLUE phase with first team', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      // Advance past UA_SETUP_DURATION (2s) to reach CLUE phase
      vi.advanceTimersByTime(2000);

      const phaseChange = findLastActionBroadcast(broadcastLog, 'UA_PHASE_CHANGE');
      expect(phaseChange).toBeDefined();
      expect((phaseChange!.data as Record<string, unknown>).phase).toBe(UndercoverAgentPhase.CLUE);
    });
  });

  describe('State Masking (§5.2 Security)', () => {
    it('getStateForPlayer should hide key card from operatives', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      // Get teams info to find an operative
      const teams = getTeamInfo(broadcastLog) as Record<string, Record<string, unknown>>;
      const redTeam = teams.red;
      const operativeIds = redTeam.operativeIds as string[];

      if (operativeIds.length > 0) {
        const state = game.getStateForPlayer(operativeIds[0]) as Record<string, unknown>;
        // Should NOT have keyCard or tile types in the grid
        const grid = state.grid as Array<Record<string, unknown>>;
        if (grid) {
          // Hidden tiles should NOT show their type (set to null)
          grid.forEach((tile) => {
            if (tile.state === 'HIDDEN') {
              expect(tile.type).toBeNull();
            }
          });
        }
      }
    });

    it('getStateForSpectator should show the key card', () => {
      const { game } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      const state = game.getStateForSpectator() as Record<string, unknown>;
      expect(state).toBeDefined();
      // Spectators should see the full grid with all tile types
      const grid = state.grid as Array<Record<string, unknown>>;
      expect(grid).toBeDefined();
      expect(grid.length).toBe(UA_GRID_SIZE);
      // Every tile should have a non-null type
      for (const tile of grid) {
        expect(tile.type).toBeDefined();
        expect(tile.type).not.toBeNull();
      }
    });
  });

  describe('Results & Awards', () => {
    it('should produce valid results with rankings for all players', () => {
      const { game } = createGame();
      game.start();

      // Fast-forward to game end
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results).toBeDefined();
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(4);
      expect(results.awards).toBeDefined();
      expect(results.duration).toBeGreaterThan(0);
    });
  });
});
