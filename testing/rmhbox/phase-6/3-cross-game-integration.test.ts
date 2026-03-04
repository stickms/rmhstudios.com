/**
 * Phase 6 — Section 6.5: Cross-Game Integration Tests
 *
 * Verifies that both Phase 6 minigames integrate correctly with
 * the game coordinator and minigame registry.
 */

import { describe, it, expect } from 'vitest';
import { MINIGAME_REGISTRY, getEligibleMinigames, isMinigamePlayable } from '../../../lib/rmhbox/minigame-registry';

describe('Cross-Game Integration (§6.5)', () => {
  describe('Minigame Registry', () => {
    it('should have fact-or-friction registered', () => {
      const def = MINIGAME_REGISTRY['fact-or-friction'];
      expect(def).toBeDefined();
      expect(def.id).toBe('fact-or-friction');
      expect(def.displayName).toBe('Fact or Friction');
      expect(def.category).toBe('trivia');
      expect(def.minPlayers).toBeGreaterThanOrEqual(2);
      expect(def.maxPlayers).toBeGreaterThanOrEqual(def.minPlayers);
      expect(def.settingsSchema).toBeDefined();
      expect(def.tags).toBeDefined();
      expect(def.tags.length).toBeGreaterThan(0);
    });

    it('should have undercover-editor registered', () => {
      const def = MINIGAME_REGISTRY['undercover-editor'];
      expect(def).toBeDefined();
      expect(def.id).toBe('undercover-editor');
      expect(def.displayName).toBe('Undercover Editor');
      expect(def.category).toBe('creative');
      expect(def.minPlayers).toBe(4);
      expect(def.maxPlayers).toBe(10);
      expect(def.joinInProgressPolicy).toBe('spectate_only');
      expect(def.settingsSchema).toBeDefined();
    });

    it('fact-or-friction should be playable with 2-16 players', () => {
      expect(isMinigamePlayable('fact-or-friction', 2)).toBe(true);
      expect(isMinigamePlayable('fact-or-friction', 16)).toBe(true);
      expect(isMinigamePlayable('fact-or-friction', 1)).toBe(false);
    });

    it('undercover-editor should be playable with 4-10 players', () => {
      expect(isMinigamePlayable('undercover-editor', 4)).toBe(true);
      expect(isMinigamePlayable('undercover-editor', 10)).toBe(true);
      expect(isMinigamePlayable('undercover-editor', 3)).toBe(false);
      expect(isMinigamePlayable('undercover-editor', 11)).toBe(false);
    });

    it('getEligibleMinigames should include both games for 4 players', () => {
      const eligible = getEligibleMinigames(4);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('fact-or-friction');
      expect(ids).toContain('undercover-editor');
    });

    it('getEligibleMinigames with 3 players should include FF but not UE', () => {
      const eligible = getEligibleMinigames(3);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('fact-or-friction');
      expect(ids).not.toContain('undercover-editor');
    });
  });
});
