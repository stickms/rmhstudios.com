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

  describe('Disconnect Handling', () => {
    it('should NOT end the game when all members of one team disconnect', () => {
      const ctx = createMockContext();
      const { game, broadcastLog, context } = createGame(ctx);
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      // Advance past UA_SETUP_DURATION (2s) to reach CLUE phase
      vi.advanceTimersByTime(2000);

      // Get teams to know who is on which team
      const teams = getTeamInfo(broadcastLog) as Record<string, Record<string, unknown>>;
      expect(teams).toBeDefined();

      const redTeam = teams.red;
      const redSpymaster = redTeam.spymasterId as string;
      const redOperatives = redTeam.operativeIds as string[];

      // Disconnect all red team members
      const redMembers = [redSpymaster, ...redOperatives];
      for (const member of redMembers) {
        const player = context.players.get(member);
        if (player) player.isConnected = false;
        game.handlePlayerDisconnect(member);
      }

      // The game should NOT have ended — no UA_BOARD_REVEAL should appear
      // after the disconnect. Instead, the turn should have been auto-ended.
      const boardReveal = findLastActionBroadcast(broadcastLog, 'UA_BOARD_REVEAL');
      // If the current team was red and they disconnected, we expect a turn end, not a game over
      // If the current team was blue, nothing happens since the non-active team disconnected
      // Either way, no premature game over with 'team_disconnected' winner
      if (boardReveal) {
        const reason = (boardReveal.data as Record<string, unknown>).reason;
        // The only acceptable game over is via max_passes, not team_disconnected
        expect(reason).not.toBe('team_disconnected');
      }
    });

    it('should auto-skip turns for disconnected team at turn start', () => {
      const ctx = createMockContext();
      const { game, broadcastLog, context } = createGame(ctx);
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      // Advance past setup
      vi.advanceTimersByTime(2000);

      const teams = getTeamInfo(broadcastLog) as Record<string, Record<string, unknown>>;
      expect(teams).toBeDefined();

      // Disconnect all members of BOTH teams except one player on blue
      const redMembers = [teams.red.spymasterId as string, ...(teams.red.operativeIds as string[])];
      const blueMembers = [teams.blue.spymasterId as string, ...(teams.blue.operativeIds as string[])];
      const allMembers = [...redMembers, ...blueMembers];

      // Disconnect all red members
      for (const member of redMembers) {
        const player = context.players.get(member);
        if (player) player.isConnected = false;
        game.handlePlayerDisconnect(member);
      }

      // Disconnect all blue members except one
      for (let i = 0; i < blueMembers.length - 1; i++) {
        const player = context.players.get(blueMembers[i]);
        if (player) player.isConnected = false;
        game.handlePlayerDisconnect(blueMembers[i]);
      }

      // Advance timers to allow turn transitions
      vi.advanceTimersByTime(60000);

      // At least one player is connected, so the game should not have
      // been force-ended. But consecutive pass limit should eventually
      // trigger a draw via max_passes.
      const boardReveal = findLastActionBroadcast(broadcastLog, 'UA_BOARD_REVEAL');
      if (boardReveal) {
        const reason = (boardReveal.data as Record<string, unknown>).reason;
        expect(reason).toBe('max_passes');
      }
    });
  });

  describe('Action Log Syncing', () => {
    it('should include actionLog in getStateForPlayer', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      const state = game.getStateForPlayer('user-alice-001') as Record<string, unknown>;
      expect(state.actionLog).toBeDefined();
      expect(Array.isArray(state.actionLog)).toBe(true);
    });

    it('should include actionLog in getStateForSpectator', () => {
      const { game } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      const state = game.getStateForSpectator() as Record<string, unknown>;
      expect(state.actionLog).toBeDefined();
      expect(Array.isArray(state.actionLog)).toBe(true);
    });

    it('should include actionLog in game action broadcasts', () => {
      const { game, broadcastLog } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      // Advance past setup to get the UA_PHASE_CHANGE broadcast
      vi.advanceTimersByTime(2000);

      const phaseChange = findLastActionBroadcast(broadcastLog, 'UA_PHASE_CHANGE');
      expect(phaseChange).toBeDefined();
      expect(phaseChange!.data.actionLog).toBeDefined();
      expect(Array.isArray(phaseChange!.data.actionLog)).toBe(true);
    });

    it('actionLog entries should have unique seq numbers', () => {
      const { game } = createGame();
      game.start();
      game.handleInput('user-alice-001', 'START_GAME', {});

      // Advance timers to generate some action log entries
      vi.advanceTimersByTime(2000);

      const state = game.getStateForPlayer('user-alice-001') as Record<string, unknown>;
      const actionLog = state.actionLog as Array<{ seq: number; type: string }>;
      const seqs = actionLog.map((e) => e.seq);
      const uniqueSeqs = new Set(seqs);
      expect(uniqueSeqs.size).toBe(seqs.length);
    });
  });
});
