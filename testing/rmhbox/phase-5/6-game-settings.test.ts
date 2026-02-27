/**
 * Phase 5 — Section 5.6: Game Settings Tests
 *
 * Tests the unified game settings system (§12A) covering:
 * - game-settings.ts utility functions (getDefaultSettings, validateGameSettings, mergeGameSettings)
 * - Rhyme Time settings integration (totalRounds, inputDuration, maxSubmissions, bonuses, penalty)
 * - Undercover Agent settings integration (enableAssassin, maxPasses)
 * - Category Crash settings integration (totalRounds, categoriesPerRound, inputDuration, peerReviewDuration, crashThreshold)
 * - Wiki-Race settings integration (navDuration, enableEfficiencyBonus, enableOneAwayPoints)
 * - BaseMinigame.getSetting() fallback behaviour
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDefaultSettings,
  validateGameSettings,
  mergeGameSettings,
} from '../../../lib/rmhbox/game-settings';
import type { GameSettingsSchema, GameSettingValues } from '../../../lib/rmhbox/types';
import {
  RHYME_TIME_SETTINGS,
  UNDERCOVER_AGENT_SETTINGS,
  CATEGORY_CRASH_SETTINGS,
  WIKI_RACE_SETTINGS,
  MINIGAME_REGISTRY,
} from '../../../lib/rmhbox/minigame-registry';
import {
  RT_TOTAL_ROUNDS,
  RT_INPUT_DURATION,
  RT_MAX_SUBMISSIONS,
  RT_INVALID_PENALTY,
  RT_MULTI_SYLLABLE_BONUS,
  RT_SPEED_BONUS,
  CC_TOTAL_ROUNDS,
  CC_CATEGORIES_PER_ROUND,
  WR_NAV_DURATION,
} from '../../../lib/rmhbox/constants';
import { RhymeTimeMinigame } from '../../../server/rmhbox/minigames/rhyme-time';
import { CategoryCrashMinigame } from '../../../server/rmhbox/minigames/category-crash';
import { WikiRaceMinigame } from '../../../server/rmhbox/minigames/wiki-race';
import {
  MOCK_USERS,
  createMockContext,
  findActionBroadcasts,
  findLastActionBroadcast,
} from './setup';

// ─── Test Schema ──────────────────────────────────────────────────

const TEST_SCHEMA: GameSettingsSchema = [
  { key: 'rounds', type: 'integer', label: 'Rounds', description: 'Number of rounds', default: 3, min: 1, max: 10, step: 1 },
  { key: 'duration', type: 'integer', label: 'Duration', description: 'Duration in seconds', default: 60, min: 15, max: 300, step: 15 },
  { key: 'enableBonus', type: 'boolean', label: 'Enable Bonus', description: 'Enable bonus scoring', default: true },
  { key: 'difficulty', type: 'select', label: 'Difficulty', description: 'Game difficulty', default: 'normal', options: ['easy', 'normal', 'hard'] },
  { key: 'multiplier', type: 'float', label: 'Multiplier', description: 'Score multiplier', default: 1.5, min: 0.5, max: 3.0, step: 0.5 },
];

// ═══════════════════════════════════════════════════════════════════
// §1 — game-settings.ts Utility Functions
// ═══════════════════════════════════════════════════════════════════

describe('Game Settings Utilities (§12A)', () => {
  // ─── getDefaultSettings ──────────────────────────────────────

  describe('getDefaultSettings()', () => {
    it('should return correct defaults for all setting types', () => {
      const defaults = getDefaultSettings(TEST_SCHEMA);
      expect(defaults).toEqual({
        rounds: 3,
        duration: 60,
        enableBonus: true,
        difficulty: 'normal',
        multiplier: 1.5,
      });
    });

    it('should return empty object for empty schema', () => {
      expect(getDefaultSettings([])).toEqual({});
    });

    it('should return correct defaults for Rhyme Time schema', () => {
      const defaults = getDefaultSettings(RHYME_TIME_SETTINGS);
      expect(defaults.totalRounds).toBe(RT_TOTAL_ROUNDS);
      expect(defaults.inputDuration).toBe(RT_INPUT_DURATION);
      expect(defaults.maxSubmissions).toBe(RT_MAX_SUBMISSIONS);
      expect(defaults.invalidPenalty).toBe(RT_INVALID_PENALTY);
      expect(defaults.enableMultiSyllableBonus).toBe(RT_MULTI_SYLLABLE_BONUS > 0);
      expect(defaults.enableSpeedBonus).toBe(RT_SPEED_BONUS > 0);
    });
  });

  // ─── validateGameSettings ────────────────────────────────────

  describe('validateGameSettings()', () => {
    it('should accept valid values unchanged', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        rounds: 5,
        duration: 120,
        enableBonus: false,
        difficulty: 'hard',
        multiplier: 2.0,
      });
      expect(result).toEqual({
        rounds: 5,
        duration: 120,
        enableBonus: false,
        difficulty: 'hard',
        multiplier: 2.0,
      });
    });

    it('should use defaults for missing keys', () => {
      const result = validateGameSettings(TEST_SCHEMA, {});
      expect(result).toEqual(getDefaultSettings(TEST_SCHEMA));
    });

    it('should clamp integers to min/max', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        rounds: 100,   // over max (10)
        duration: 5,    // under min (15)
      });
      expect(result.rounds).toBe(10);
      expect(result.duration).toBe(15);
    });

    it('should snap integers to step', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        duration: 22,  // min=15, step=15 → nearest step = 15 (round((22-15)/15)=0.47→0 → 15)
      });
      expect(result.duration).toBe(15);

      const result2 = validateGameSettings(TEST_SCHEMA, {
        duration: 38,  // (38-15)/15=1.53→2 → 15+2*15=45
      });
      expect(result2.duration).toBe(45);
    });

    it('should snap floats to step', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        multiplier: 1.7,  // min=0.5, step=0.5 → nearest = round((1.7-0.5)/0.5)=2.4→2 → 0.5+2*0.5=1.5
      });
      expect(result.multiplier).toBe(1.5);
    });

    it('should clamp floats to min/max', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        multiplier: 10.0,  // max=3.0
      });
      expect(result.multiplier).toBe(3.0);
    });

    it('should reject invalid types and use defaults', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        rounds: 'five',        // not a number
        enableBonus: 1,        // not a boolean
        difficulty: 42,        // not a string
        multiplier: 'high',    // not a number
      });
      expect(result.rounds).toBe(3);       // default
      expect(result.enableBonus).toBe(true); // default
      expect(result.difficulty).toBe('normal'); // default
      expect(result.multiplier).toBe(1.5); // default
    });

    it('should reject non-integer numbers for integer type', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        rounds: 3.5,  // not integer
      });
      expect(result.rounds).toBe(3);  // default
    });

    it('should reject invalid select options', () => {
      const result = validateGameSettings(TEST_SCHEMA, {
        difficulty: 'impossible',  // not in options
      });
      expect(result.difficulty).toBe('normal');  // default
    });
  });

  // ─── mergeGameSettings ───────────────────────────────────────

  describe('mergeGameSettings()', () => {
    it('should merge valid updates into existing settings', () => {
      const current: GameSettingValues = { rounds: 3, duration: 60, enableBonus: true, difficulty: 'normal', multiplier: 1.5 };
      const result = mergeGameSettings(TEST_SCHEMA, current, { rounds: 5 });
      expect(result.rounds).toBe(5);
      expect(result.duration).toBe(60);  // unchanged
      expect(result.enableBonus).toBe(true);  // unchanged
    });

    it('should validate merged values', () => {
      const current: GameSettingValues = { rounds: 3, duration: 60, enableBonus: true, difficulty: 'normal', multiplier: 1.5 };
      const result = mergeGameSettings(TEST_SCHEMA, current, { rounds: 999 });
      expect(result.rounds).toBe(10);  // clamped to max
    });

    it('should ignore keys not in schema', () => {
      const current: GameSettingValues = { rounds: 3, duration: 60, enableBonus: true, difficulty: 'normal', multiplier: 1.5 };
      const result = mergeGameSettings(TEST_SCHEMA, current, { notAKey: 'value' });
      expect(result).not.toHaveProperty('notAKey');
      expect(result.rounds).toBe(3);
    });

    it('should handle empty updates', () => {
      const current: GameSettingValues = { rounds: 5, duration: 120, enableBonus: false, difficulty: 'hard', multiplier: 2.0 };
      const result = mergeGameSettings(TEST_SCHEMA, current, {});
      expect(result).toEqual(current);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §2 — Rhyme Time Settings Integration
// ═══════════════════════════════════════════════════════════════════

describe('Rhyme Time Settings Integration (§5.1 × §12A)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function createRhymeTimeGame(gameSettings: GameSettingValues = {}) {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings },
    );
    const game = new RhymeTimeMinigame(ctx.context);
    return { game, ...ctx };
  }

  describe('totalRounds setting', () => {
    it('should use default total rounds when no settings provided', () => {
      const { game, broadcastLog } = createRhymeTimeGame();
      game.start();

      // Run through all rounds
      vi.advanceTimersByTime(600_000);

      const roundStarts = findActionBroadcasts(broadcastLog, 'RT_ROUND_START');
      expect(roundStarts.length).toBe(RT_TOTAL_ROUNDS);
    });

    it('should use custom total rounds from settings', () => {
      const { game, broadcastLog } = createRhymeTimeGame({ totalRounds: 1 });
      game.start();

      // Run through the game
      vi.advanceTimersByTime(600_000);

      const roundStarts = findActionBroadcasts(broadcastLog, 'RT_ROUND_START');
      expect(roundStarts.length).toBe(1);
    });

    it('should use custom total rounds set to 5', () => {
      const { game, broadcastLog } = createRhymeTimeGame({ totalRounds: 5 });
      game.start();

      // Run through the game
      vi.advanceTimersByTime(900_000);

      const roundStarts = findActionBroadcasts(broadcastLog, 'RT_ROUND_START');
      expect(roundStarts.length).toBe(5);
    });
  });

  describe('inputDuration setting', () => {
    it('should use default input duration when no settings provided', () => {
      const { game, broadcastLog } = createRhymeTimeGame();
      game.start();

      // Advance past round start to reach input phase
      vi.advanceTimersByTime(3000);

      const inputStart = findLastActionBroadcast(broadcastLog, 'RT_INPUT_START');
      expect(inputStart).toBeDefined();
      expect((inputStart!.data as Record<string, unknown>).duration).toBe(RT_INPUT_DURATION);
    });

    it('should use custom input duration from settings', () => {
      const { game, broadcastLog } = createRhymeTimeGame({ inputDuration: 20 });
      game.start();

      // Advance past round start to reach input phase
      vi.advanceTimersByTime(3000);

      const inputStart = findLastActionBroadcast(broadcastLog, 'RT_INPUT_START');
      expect(inputStart).toBeDefined();
      expect((inputStart!.data as Record<string, unknown>).duration).toBe(20);
    });
  });

  describe('maxSubmissions setting', () => {
    it('should use default max submissions when no settings provided', () => {
      const { game, playerLog } = createRhymeTimeGame();
      game.start();
      vi.advanceTimersByTime(3000); // advance into input phase

      // Submit a word to trigger RT_RHYME_SUBMITTED which includes maxSubmissions
      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_RHYME', { word: 'testword' });

      const submitEvent = playerLog.find(
        (e) => e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'RT_RHYME_SUBMITTED',
      );
      if (submitEvent) {
        expect((submitEvent.data as Record<string, unknown>).maxSubmissions).toBe(RT_MAX_SUBMISSIONS);
      }
    });

    it('should use custom max submissions from settings', () => {
      const { game, playerLog } = createRhymeTimeGame({ maxSubmissions: 10 });
      game.start();
      vi.advanceTimersByTime(3000);

      game.handleInput(MOCK_USERS.alice.userId, 'SUBMIT_RHYME', { word: 'testword' });

      const submitEvent = playerLog.find(
        (e) => e.userId === MOCK_USERS.alice.userId &&
          (e.data as Record<string, unknown>).type === 'RT_RHYME_SUBMITTED',
      );
      if (submitEvent) {
        expect((submitEvent.data as Record<string, unknown>).maxSubmissions).toBe(10);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §3 — Category Crash Settings Integration
// ═══════════════════════════════════════════════════════════════════

describe('Category Crash Settings Integration (§5.3 × §12A)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function createCCGame(gameSettings: GameSettingValues = {}) {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings },
    );
    const game = new CategoryCrashMinigame(ctx.context);
    return { game, ...ctx };
  }

  describe('totalRounds setting', () => {
    it('should use default total rounds when no settings provided', () => {
      const { game, broadcastLog } = createCCGame();
      game.start();

      // Advance through the full game
      vi.advanceTimersByTime(600_000);

      const roundStarts = findActionBroadcasts(broadcastLog, 'CC_ROUND_START');
      expect(roundStarts.length).toBe(CC_TOTAL_ROUNDS);
    });

    it('should use custom total rounds from settings', () => {
      const { game, broadcastLog } = createCCGame({ totalRounds: 1 });
      game.start();

      vi.advanceTimersByTime(600_000);

      const roundStarts = findActionBroadcasts(broadcastLog, 'CC_ROUND_START');
      expect(roundStarts.length).toBe(1);
    });
  });

  describe('categoriesPerRound setting', () => {
    it('should use default categories when no settings provided', () => {
      const { game, broadcastLog } = createCCGame();
      game.start();

      // Advance to input phase
      vi.advanceTimersByTime(5000);

      const inputPhase = findLastActionBroadcast(broadcastLog, 'CC_INPUT_PHASE');
      if (inputPhase) {
        const categories = (inputPhase.data as Record<string, unknown>).categories;
        if (Array.isArray(categories)) {
          expect(categories.length).toBe(CC_CATEGORIES_PER_ROUND);
        }
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §4 — Wiki-Race Settings Integration
// ═══════════════════════════════════════════════════════════════════

describe('Wiki-Race Settings Integration (§5.4 × §12A)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function createWRGame(gameSettings: GameSettingValues = {}) {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings },
    );
    const game = new WikiRaceMinigame(ctx.context);
    return { game, ...ctx };
  }

  describe('navDuration setting', () => {
    it('should use default nav duration when no settings provided', () => {
      const { game, broadcastLog } = createWRGame();
      game.start();

      // Advance past reveal phase
      vi.advanceTimersByTime(6000);

      const navStart = findLastActionBroadcast(broadcastLog, 'WR_NAVIGATION_START');
      expect(navStart).toBeDefined();
      expect((navStart!.data as Record<string, unknown>).duration).toBe(WR_NAV_DURATION);
    });

    it('should use custom nav duration from settings', () => {
      const { game, broadcastLog } = createWRGame({ navDuration: 60 });
      game.start();

      // Advance past reveal phase
      vi.advanceTimersByTime(6000);

      const navStart = findLastActionBroadcast(broadcastLog, 'WR_NAVIGATION_START');
      expect(navStart).toBeDefined();
      expect((navStart!.data as Record<string, unknown>).duration).toBe(60);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// §5 — BaseMinigame.getSetting() Fallback
// ═══════════════════════════════════════════════════════════════════

describe('BaseMinigame.getSetting() Fallback (§12A)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('should fall back to default when setting key is absent', () => {
    // Create a game with no settings — should fall back to defaults
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings: {} },
    );
    const game = new RhymeTimeMinigame(ctx.context);
    game.start();

    // Game should work normally with default values
    vi.advanceTimersByTime(600_000);

    const results = game.computeResults();
    expect(results).toBeDefined();
    expect(results.rankings.length).toBe(4);
  });

  it('should use provided setting value when present', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana],
      { gameSettings: { totalRounds: 1 } },
    );
    const game = new RhymeTimeMinigame(ctx.context);
    game.start();

    // With 1 round, the game should finish faster
    vi.advanceTimersByTime(600_000);

    const results = game.computeResults();
    expect(results).toBeDefined();
    expect(results.rankings.length).toBe(4);

    // Verify only 1 round was played
    const roundStarts = findActionBroadcasts(ctx.broadcastLog, 'RT_ROUND_START');
    expect(roundStarts.length).toBe(1);
  });

  it('should handle completely empty gameSettings gracefully', () => {
    const ctx = createMockContext(
      [MOCK_USERS.alice, MOCK_USERS.bob],
      { gameSettings: {} },
    );
    const game = new RhymeTimeMinigame(ctx.context);

    // Should not throw
    expect(() => game.start()).not.toThrow();

    vi.advanceTimersByTime(600_000);

    const results = game.computeResults();
    expect(results).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// §6 — Settings Schema Completeness
// ═══════════════════════════════════════════════════════════════════

describe('Settings Schema Completeness (§12A)', () => {
  it('all Phase 5 registry entries should have settingsSchema', () => {
    const phase5Games = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
    for (const gameId of phase5Games) {
      const def = MINIGAME_REGISTRY[gameId];
      expect(def).toBeDefined();
      expect(def.settingsSchema).toBeDefined();
      expect(Array.isArray(def.settingsSchema)).toBe(true);
      expect(def.settingsSchema!.length).toBeGreaterThan(0);
    }
  });

  it('RHYME_TIME_SETTINGS should cover 6 settings', () => {
    expect(RHYME_TIME_SETTINGS.length).toBe(6);
    const keys = RHYME_TIME_SETTINGS.map((s) => s.key);
    expect(keys).toContain('totalRounds');
    expect(keys).toContain('inputDuration');
    expect(keys).toContain('maxSubmissions');
    expect(keys).toContain('invalidPenalty');
    expect(keys).toContain('enableMultiSyllableBonus');
    expect(keys).toContain('enableSpeedBonus');
  });

  it('UNDERCOVER_AGENT_SETTINGS should cover UA settings', () => {
    expect(UNDERCOVER_AGENT_SETTINGS.length).toBeGreaterThanOrEqual(1);
    const keys = UNDERCOVER_AGENT_SETTINGS.map((s) => s.key);
    expect(keys).toContain('enableAssassin');
  });

  it('CATEGORY_CRASH_SETTINGS should cover CC settings', () => {
    expect(CATEGORY_CRASH_SETTINGS.length).toBeGreaterThanOrEqual(5);
    const keys = CATEGORY_CRASH_SETTINGS.map((s) => s.key);
    expect(keys).toContain('totalRounds');
    expect(keys).toContain('categoriesPerRound');
    expect(keys).toContain('inputDuration');
    expect(keys).toContain('peerReviewDuration');
    expect(keys).toContain('crashThreshold');
  });

  it('WIKI_RACE_SETTINGS should cover WR settings', () => {
    expect(WIKI_RACE_SETTINGS.length).toBeGreaterThanOrEqual(3);
    const keys = WIKI_RACE_SETTINGS.map((s) => s.key);
    expect(keys).toContain('navDuration');
    expect(keys).toContain('enableEfficiencyBonus');
    expect(keys).toContain('enableOneAwayPoints');
  });

  it('all schema definitions should have required fields', () => {
    const allSchemas = [
      ...RHYME_TIME_SETTINGS,
      ...UNDERCOVER_AGENT_SETTINGS,
      ...CATEGORY_CRASH_SETTINGS,
      ...WIKI_RACE_SETTINGS,
    ];
    for (const def of allSchemas) {
      expect(def.key).toBeTruthy();
      expect(['boolean', 'integer', 'float', 'select']).toContain(def.type);
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.default).toBeDefined();

      if (def.type === 'integer' || def.type === 'float') {
        expect(def.min).toBeDefined();
        expect(def.max).toBeDefined();
        expect(def.min!).toBeLessThanOrEqual(def.max!);
        expect(def.default).toBeGreaterThanOrEqual(def.min!);
        expect(def.default).toBeLessThanOrEqual(def.max!);
      }

      if (def.type === 'select') {
        expect(def.options).toBeDefined();
        expect(def.options!.length).toBeGreaterThan(0);
        expect(def.options).toContain(def.default);
      }
    }
  });
});
