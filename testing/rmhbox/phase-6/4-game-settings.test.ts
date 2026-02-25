/**
 * Phase 6 — Section 6.6: Game Settings Tests
 *
 * Verifies that both Phase 6 minigames correctly define and
 * integrate host-configurable settings via the §12A system.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MINIGAME_REGISTRY,
  FACT_OR_FRICTION_SETTINGS,
  UNDERCOVER_EDITOR_SETTINGS,
} from '../../../lib/rmhbox/minigame-registry';
import { getDefaultSettings, validateGameSettings } from '../../../lib/rmhbox/game-settings';
import { FactOrFrictionGame } from '../../../server/rmhbox/minigames/fact-or-friction';
import { UndercoverEditorGame } from '../../../server/rmhbox/minigames/undercover-editor';
import {
  MOCK_USERS,
  createMockContext,
} from './setup';

describe('Game Settings Integration (§6.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Fact or Friction Settings Schema', () => {
    it('should define settings in registry', () => {
      const def = MINIGAME_REGISTRY['fact-or-friction'];
      expect(def.settingsSchema).toBeDefined();
      expect(def.settingsSchema!.length).toBeGreaterThan(0);
    });

    it('should export FACT_OR_FRICTION_SETTINGS with expected keys', () => {
      const keys = FACT_OR_FRICTION_SETTINGS.map((s) => s.key);
      expect(keys).toContain('totalQuestions');
      expect(keys).toContain('answerDuration');
      expect(keys).toContain('potStartValue');
      expect(keys).toContain('enableScoreFloor');
      expect(keys).toContain('difficulty');
    });

    it('should produce valid default settings', () => {
      const defaults = getDefaultSettings(FACT_OR_FRICTION_SETTINGS);
      expect(defaults.totalQuestions).toBe(8);
      expect(defaults.answerDuration).toBe(15);
      expect(defaults.potStartValue).toBe(1000);
      expect(defaults.enableScoreFloor).toBe(true);
      expect(defaults.difficulty).toBe('mixed');
    });

    it('should validate custom settings without errors', () => {
      const result = validateGameSettings(FACT_OR_FRICTION_SETTINGS, {
        totalQuestions: 10,
        answerDuration: 20,
      });
      expect(result.totalQuestions).toBe(10);
      expect(result.answerDuration).toBe(20);
    });
  });

  describe('Undercover Editor Settings Schema', () => {
    it('should define settings in registry', () => {
      const def = MINIGAME_REGISTRY['undercover-editor'];
      expect(def.settingsSchema).toBeDefined();
      expect(def.settingsSchema!.length).toBeGreaterThan(0);
    });

    it('should export UNDERCOVER_EDITOR_SETTINGS with expected keys', () => {
      const keys = UNDERCOVER_EDITOR_SETTINGS.map((s) => s.key);
      expect(keys).toContain('rotations');
      expect(keys).toContain('writeTimeout');
      expect(keys).toContain('editTimeout');
      expect(keys).toContain('accusationDuration');
    });

    it('should produce valid default settings', () => {
      const defaults = getDefaultSettings(UNDERCOVER_EDITOR_SETTINGS);
      expect(defaults.rotations).toBe(2);
      expect(defaults.writeTimeout).toBe(45);
      expect(defaults.editTimeout).toBe(30);
      expect(defaults.accusationDuration).toBe(30);
    });
  });

  describe('Handler getSetting() Integration', () => {
    it('FF handler should respect custom totalQuestions setting', () => {
      const ctx = createMockContext();
      ctx.context.gameSettings = { totalQuestions: 4 };
      const game = new FactOrFrictionGame(ctx.context);
      game.start();

      // Find the FF_QUESTION broadcast — totalQuestions should be 4
      const questionEvent = ctx.broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'FF_QUESTION',
      );
      expect(questionEvent).toBeDefined();
      const data = questionEvent!.data as Record<string, unknown>;
      expect(data.totalQuestions).toBe(4);

      game.cleanup();
    });

    it('UE handler should respect custom rotations setting', () => {
      const ctx = createMockContext([
        MOCK_USERS.alice, MOCK_USERS.bob, MOCK_USERS.charlie, MOCK_USERS.diana, MOCK_USERS.eve,
      ]);
      ctx.context.gameSettings = { rotations: 1 };
      const game = new UndercoverEditorGame(ctx.context);
      game.start();

      const gameStart = ctx.broadcastLog.find(
        (e) => e.event === 'rmhbox:game:action' &&
          (e.data as Record<string, unknown>).type === 'UE_GAME_START',
      );
      expect(gameStart).toBeDefined();
      // With rotations=1, totalRounds should be 1
      expect((gameStart!.data as Record<string, unknown>).totalRounds).toBe(1);

      game.cleanup();
    });
  });
});
