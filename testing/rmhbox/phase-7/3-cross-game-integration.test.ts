/**
 * Phase 7 — Section 7.5: Cross-Game Integration Tests (SS + HK)
 *
 * Tests covering:
 * - Registry verification for Phase 7 games
 * - Random selection with player count filtering
 * - Server registry completeness
 * - Game settings schema completeness
 * - History display configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MINIGAME_REGISTRY,
  getEligibleMinigames,
  isMinigamePlayable,
  SEQUENCE_SAM_SETTINGS,
  HUMAN_KEYBOARD_SETTINGS,
} from '../../../lib/rmhbox/minigame-registry';
import { MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';
import { SequenceSamGame } from '../../../server/rmhbox/minigames/sequence-sam';
import { HumanKeyboardGame } from '../../../server/rmhbox/minigames/human-keyboard';
import {
  MOCK_USERS,
  createMockContext,
} from './setup';

// Mock data loader for HK
vi.mock('../../../lib/rmhbox/human-keyboard/data-loader', () => {
  const testSentences = [{
    id: 'test-1',
    text: 'Hello world',
    normalizedText: 'hello world',
    letterCount: 10,
    difficulty: 'easy' as const,
    category: 'test',
  }];
  return {
    loadSentences: () => testSentences,
    selectSentenceForGame: () => testSentences[0],
  };
});

describe('Cross-Game Integration (§7.5 — SS + HK)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Registry Verification (§7.5.1)', () => {
    it('should have sequence-sam registered in MINIGAME_REGISTRY', () => {
      const def = MINIGAME_REGISTRY['sequence-sam'];
      expect(def).toBeDefined();
      expect(def.displayName).toBe('Sequence Sam');
      expect(def.category).toBe('action');
      expect(def.minPlayers).toBe(2);
      expect(def.maxPlayers).toBe(16);
    });

    it('should have human-keyboard registered in MINIGAME_REGISTRY', () => {
      const def = MINIGAME_REGISTRY['human-keyboard'];
      expect(def).toBeDefined();
      expect(def.displayName).toBe('Human Keyboard');
      expect(def.category).toBe('action');
      expect(def.minPlayers).toBe(3);
      expect(def.maxPlayers).toBe(10);
      expect(def.supportsTeams).toBe(true);
    });

    it('should have correct metadata for sequence-sam', () => {
      const def = MINIGAME_REGISTRY['sequence-sam'];
      expect(def.icon).toBe('grid-3x3');
      expect(def.joinInProgressPolicy).toBe('spectate_only');
      expect(def.tags).toContain('memory');
      expect(def.settingsSchema).toBeDefined();
    });

    it('should have correct metadata for human-keyboard', () => {
      const def = MINIGAME_REGISTRY['human-keyboard'];
      expect(def.icon).toBe('keyboard');
      expect(def.joinInProgressPolicy).toBe('spectate_only');
      expect(def.tags).toContain('cooperative');
      expect(def.settingsSchema).toBeDefined();
    });
  });

  describe('Server Registry (§7.5.12)', () => {
    it('should have sequence-sam in MINIGAME_SERVER_REGISTRY', () => {
      expect(MINIGAME_SERVER_REGISTRY.get('sequence-sam')).toBe(SequenceSamGame);
    });

    it('should have human-keyboard in MINIGAME_SERVER_REGISTRY', () => {
      expect(MINIGAME_SERVER_REGISTRY.get('human-keyboard')).toBe(HumanKeyboardGame);
    });

    it('should instantiate SequenceSamGame with valid context', () => {
      const ctx = createMockContext();
      const GameClass = MINIGAME_SERVER_REGISTRY.get('sequence-sam')!;
      const instance = new GameClass(ctx.context);
      expect(instance).toBeInstanceOf(SequenceSamGame);
    });

    it('should instantiate HumanKeyboardGame with valid context', () => {
      const ctx = createMockContext();
      const GameClass = MINIGAME_SERVER_REGISTRY.get('human-keyboard')!;
      const instance = new GameClass(ctx.context);
      expect(instance).toBeInstanceOf(HumanKeyboardGame);
    });
  });

  describe('Player Count Filtering (§7.5.2)', () => {
    it('should include sequence-sam for 2-player lobby', () => {
      const eligible = getEligibleMinigames(2);
      expect(eligible.some((g) => g.id === 'sequence-sam')).toBe(true);
    });

    it('should exclude human-keyboard for 2-player lobby (min 3)', () => {
      const eligible = getEligibleMinigames(2);
      expect(eligible.some((g) => g.id === 'human-keyboard')).toBe(false);
    });

    it('should include both for 3-player lobby', () => {
      const eligible = getEligibleMinigames(3);
      expect(eligible.some((g) => g.id === 'sequence-sam')).toBe(true);
      expect(eligible.some((g) => g.id === 'human-keyboard')).toBe(true);
    });

    it('should include both for 10-player lobby', () => {
      const eligible = getEligibleMinigames(10);
      expect(eligible.some((g) => g.id === 'sequence-sam')).toBe(true);
      expect(eligible.some((g) => g.id === 'human-keyboard')).toBe(true);
    });

    it('should exclude human-keyboard for 11-player lobby (max 10)', () => {
      expect(isMinigamePlayable('human-keyboard', 11)).toBe(false);
    });

    it('should include sequence-sam for 16-player lobby', () => {
      expect(isMinigamePlayable('sequence-sam', 16)).toBe(true);
    });
  });

  describe('Game Settings Schema Completeness (§7.6.1)', () => {
    it('should have 4 settings for Sequence Sam', () => {
      expect(SEQUENCE_SAM_SETTINGS.length).toBe(4);
    });

    it('should have 3 settings for Human Keyboard', () => {
      expect(HUMAN_KEYBOARD_SETTINGS.length).toBe(3);
    });

    it('should have key, type, label, default for every SS setting', () => {
      for (const setting of SEQUENCE_SAM_SETTINGS) {
        expect(setting).toHaveProperty('key');
        expect(setting).toHaveProperty('type');
        expect(setting).toHaveProperty('label');
        expect(setting).toHaveProperty('default');
      }
    });

    it('should have key, type, label, default for every HK setting', () => {
      for (const setting of HUMAN_KEYBOARD_SETTINGS) {
        expect(setting).toHaveProperty('key');
        expect(setting).toHaveProperty('type');
        expect(setting).toHaveProperty('label');
        expect(setting).toHaveProperty('default');
      }
    });

    it('should have min/max/step for integer SS settings', () => {
      for (const setting of SEQUENCE_SAM_SETTINGS) {
        if (setting.type === 'integer') {
          expect(setting).toHaveProperty('min');
          expect(setting).toHaveProperty('max');
          expect(setting).toHaveProperty('step');
        }
      }
    });

    it('should have min/max/step for integer HK settings', () => {
      for (const setting of HUMAN_KEYBOARD_SETTINGS) {
        if (setting.type === 'integer') {
          expect(setting).toHaveProperty('min');
          expect(setting).toHaveProperty('max');
          expect(setting).toHaveProperty('step');
        }
      }
    });

    it('should NOT have min/max/step for boolean settings', () => {
      for (const setting of [...SEQUENCE_SAM_SETTINGS, ...HUMAN_KEYBOARD_SETTINGS]) {
        if (setting.type === 'boolean') {
          expect(setting).not.toHaveProperty('min');
          expect(setting).not.toHaveProperty('max');
          expect(setting).not.toHaveProperty('step');
        }
      }
    });

    it('should have default values within constraints', () => {
      for (const setting of [...SEQUENCE_SAM_SETTINGS, ...HUMAN_KEYBOARD_SETTINGS]) {
        if (setting.type === 'integer') {
          expect(setting.default).toBeGreaterThanOrEqual(setting.min!);
          expect(setting.default).toBeLessThanOrEqual(setting.max!);
        }
      }
    });
  });

  describe('Sequential Game Test (§7.5.4)', () => {
    it('should play Sequence Sam and then Human Keyboard without state leakage', () => {
      // Play SS
      const ssCtx = createMockContext();
      const ssGame = new SequenceSamGame(ssCtx.context);
      ssGame.start();
      ssGame.forceEnd('test');
      expect(ssCtx.completedResults.length).toBe(1);

      // Play HK
      const hkCtx = createMockContext([MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie]);
      const hkGame = new HumanKeyboardGame(hkCtx.context);
      hkGame.start();
      hkGame.forceEnd('test');
      expect(hkCtx.completedResults.length).toBe(1);

      // No state leakage — results are independent
      expect(ssCtx.completedResults[0]).not.toBe(hkCtx.completedResults[0]);
    });
  });

  describe('Phase 5 + Phase 7 Coexistence (§7.5.8)', () => {
    it('should have at least 6 games registered (4 Phase 5 + 2 Phase 7)', () => {
      const allGames = Object.keys(MINIGAME_REGISTRY);
      expect(allGames.length).toBeGreaterThanOrEqual(6);
      expect(allGames).toContain('rhyme-time');
      expect(allGames).toContain('undercover-agent');
      expect(allGames).toContain('category-crash');
      expect(allGames).toContain('wiki-race');
      expect(allGames).toContain('sequence-sam');
      expect(allGames).toContain('human-keyboard');
    });

    it('should have at least 6 server handlers registered', () => {
      expect(MINIGAME_SERVER_REGISTRY.size).toBeGreaterThanOrEqual(6);
    });
  });
});
