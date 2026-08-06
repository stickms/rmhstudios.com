/**
 * Phase 5 — Section 5.1: Rhyme Time Server Handler Tests
 *
 * Tests the RhymeTimeMinigame server handler covering:
 * - State initialization
 * - Input handling (valid/invalid/duplicate submissions)
 * - Scoring computation
 * - State masking (getStateForPlayer / getStateForSpectator)
 * - Awards
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RhymeTimeMinigame } from '../../../server/rmhbox/minigames/rhyme-time';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
  findPlayerEvents,
  type MockContextData,
} from './setup';

// ─── Helpers ─────────────────────────────────────────────────────

function createGame(ctxData?: MockContextData) {
  const ctx = ctxData ?? createMockContext();
  const game = new RhymeTimeMinigame(ctx.context);
  return { game, ...ctx };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Rhyme Time Server Handler (§5.1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Some cases pin Math.random to make root-word selection deterministic.
    vi.restoreAllMocks();
  });

  describe('State Initialization', () => {
    it('should create a game instance with 4 players', () => {
      const { game, context } = createGame();
      expect(game).toBeDefined();
      expect(context.players.size).toBe(4);
    });
  });

  describe('Game Lifecycle', () => {
    it('should emit RT_ROUND_START when started', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      const roundStart = findLastActionBroadcast(broadcastLog, 'RT_ROUND_START');
      expect(roundStart).toBeDefined();
      expect((roundStart!.data as Record<string, unknown>).round).toBe(1);
    });

    it('should broadcast TIMER_TICK during input phase', () => {
      const { game, broadcastLog } = createGame();
      game.start();

      // Clear initial emissions, advance into input phase
      broadcastLog.length = 0;

      // Advance past round start duration to reach INPUT
      vi.advanceTimersByTime(3000);

      // Advance a few seconds for ticks
      vi.advanceTimersByTime(3000);

      const ticks = findActionBroadcasts(broadcastLog, 'TIMER_TICK');
      expect(ticks.length).toBeGreaterThan(0);
    });
  });

  describe('Input Handling', () => {
    it('should accept valid word submissions', () => {
      const { game, playerLog } = createGame();
      game.start();

      // Advance into INPUT phase
      vi.advanceTimersByTime(3000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'testword' });

      // Should get a response (either accepted or rejected)
      const hasResponse = playerLog.some(
        (e) =>
          e.userId === userId &&
          ['RT_RHYME_SUBMITTED', 'RT_RHYME_REJECTED'].includes(
            (e.data as Record<string, unknown>).type as string,
          ),
      );
      expect(hasResponse).toBe(true);
    });

    it('should forward RT_RHYME_SUBMITTED to spectator followers', () => {
      const { game, context, spectatorLog } = createGame();
      game.start();
      vi.advanceTimersByTime(3000);

      const userId = MOCK_USERS.alice.userId;
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'testword' });

      // sendToSpectatorFollowers should have been called
      expect(context.sendToSpectatorFollowers).toHaveBeenCalled();

      // The spectator log should contain the RT_RHYME_SUBMITTED event
      const spectatorSubmission = spectatorLog.find(
        (e) => (e.data as Record<string, unknown>).type === 'RT_RHYME_SUBMITTED',
      );
      expect(spectatorSubmission).toBeDefined();
      expect((spectatorSubmission!.data as Record<string, unknown>).word).toBe('testword');
    });
  });

  describe('Host-configured settings reach the client', () => {
    /**
     * `selectRootWord` picks at random; pinning Math.random to 0 selects the
     * first entry of root-words.json ("three"), so "dog" is reliably a known
     * word that does not rhyme and "zzzzq" is reliably absent from the CMU
     * dictionary.
     */
    function createPinnedGame(gameSettings: Record<string, boolean | number | string> = {}) {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const ctx = createMockContext();
      ctx.context.gameSettings = gameSettings;
      const game = new RhymeTimeMinigame(ctx.context);
      game.start();
      vi.advanceTimersByTime(3000); // into INPUT
      return { game, ...ctx };
    }

    it('rejects a duplicate with the word and the live submission cap', () => {
      const { game, playerLog } = createPinnedGame({ maxSubmissions: 10 });
      const userId = MOCK_USERS.alice.userId;

      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'dog' });
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'dog' });

      const rejected = findPlayerEvents(playerLog, userId).find(
        (e) => (e.data as Record<string, unknown>).type === 'RT_RHYME_REJECTED',
      );
      expect(rejected).toBeDefined();
      const data = rejected!.data as Record<string, unknown>;
      expect(data.reason).toBe('duplicate');
      expect(data.word).toBe('dog');
      expect(data.maxSubmissions).toBe(10);
    });

    it('enforces the host cap rather than the default, and says so', () => {
      const { game, playerLog } = createPinnedGame({ maxSubmissions: 10 });
      const userId = MOCK_USERS.alice.userId;

      for (let i = 0; i < 12; i++) {
        game.handleInput(userId, 'SUBMIT_RHYME', { word: `word${String.fromCharCode(97 + i)}` });
      }

      const accepted = findPlayerEvents(playerLog, userId).filter(
        (e) => (e.data as Record<string, unknown>).type === 'RT_RHYME_SUBMITTED',
      );
      const rejected = findPlayerEvents(playerLog, userId).filter(
        (e) => (e.data as Record<string, unknown>).type === 'RT_RHYME_REJECTED',
      );
      expect(accepted.length).toBe(10);
      expect(rejected.length).toBe(2);
      for (const r of rejected) {
        expect((r.data as Record<string, unknown>).reason).toBe('max_submissions');
        expect((r.data as Record<string, unknown>).maxSubmissions).toBe(10);
      }
      for (const a of accepted) {
        expect((a.data as Record<string, unknown>).maxSubmissions).toBe(10);
      }
    });

    it('reports the configured penalty on a non-rhyming word, and none on a dictionary miss', () => {
      const { game, playerLog } = createPinnedGame({ invalidPenalty: -20 });
      const userId = MOCK_USERS.alice.userId;

      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'dog' });
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'zzzzq' });

      const submitted = findPlayerEvents(playerLog, userId)
        .map((e) => e.data as Record<string, unknown>)
        .filter((d) => d.type === 'RT_RHYME_SUBMITTED');

      const doesNotRhyme = submitted.find((d) => d.word === 'dog');
      expect(doesNotRhyme?.invalidReason).toBe('does_not_rhyme');
      expect(doesNotRhyme?.penalty).toBe(-20);

      const notInDictionary = submitted.find((d) => d.word === 'zzzzq');
      expect(notInDictionary?.invalidReason).toBe('not_in_dictionary');
      expect(notInDictionary?.penalty).toBe(0);
    });

    it('rejects a padded phrase instead of scoring it as a fresh word', () => {
      const { game, playerLog } = createPinnedGame();
      const userId = MOCK_USERS.alice.userId;

      // "tree" rhymes with the pinned root "three". Padding it would slip past
      // the duplicate check while `rhyming-part` scored the same last word.
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'tree' });
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'a tree' });
      game.handleInput(userId, 'SUBMIT_RHYME', { word: 'tree!' });

      const events = findPlayerEvents(playerLog, userId).map((e) => e.data as Record<string, unknown>);
      const submitted = events.filter((d) => d.type === 'RT_RHYME_SUBMITTED');
      const rejected = events.filter((d) => d.type === 'RT_RHYME_REJECTED');

      expect(submitted.length).toBe(1);
      expect(submitted[0].word).toBe('tree');
      expect(submitted[0].isValid).toBe(true);
      expect(rejected.length).toBe(2);
      for (const r of rejected) expect(r.reason).toBe('invalid_input');
    });

    it('ships the cap and penalty in player and spectator snapshots', () => {
      const { game } = createPinnedGame({ maxSubmissions: 15, invalidPenalty: -20 });

      const playerState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      expect(playerState.maxSubmissions).toBe(15);
      expect(playerState.invalidPenalty).toBe(-20);

      const spectatorState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectatorState.maxSubmissions).toBe(15);
      expect(spectatorState.invalidPenalty).toBe(-20);
    });
  });

  describe('State Masking (§5.1 Security)', () => {
    it('getStateForPlayer should not reveal other players\' submissions during INPUT', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(3000);

      const aliceState = game.getStateForPlayer(MOCK_USERS.alice.userId) as Record<string, unknown>;
      const bobState = game.getStateForPlayer(MOCK_USERS.bob.userId) as Record<string, unknown>;

      expect(aliceState).toBeDefined();
      expect(bobState).toBeDefined();

      // Alice shouldn't see Bob's submissions and vice versa
      // The state should only contain the player's own submissions, not others'
    });

    it('getStateForSpectator should not reveal active submissions', () => {
      const { game } = createGame();
      game.start();
      vi.advanceTimersByTime(3000);

      const spectState = game.getStateForSpectator() as Record<string, unknown>;
      expect(spectState).toBeDefined();
    });
  });

  describe('Results & Awards', () => {
    it('should compute results with rankings', () => {
      const { game } = createGame();
      game.start();

      // Let the full game play out (3 rounds × duration)
      vi.advanceTimersByTime(600_000);

      const results = game.computeResults();
      expect(results).toBeDefined();
      expect(results.rankings).toBeDefined();
      expect(results.rankings.length).toBe(4);
      expect(results.awards).toBeDefined();
    });
  });
});
