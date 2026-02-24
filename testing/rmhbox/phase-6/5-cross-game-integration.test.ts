/**
 * Phase 6 — Section 6.5: Cross-Game Integration Tests
 *
 * Verifies that both Phase 6 minigames (Minimalist Masterpiece and
 * Emoji Cinema) are correctly registered, can be looked up, respect
 * player count constraints, and appear in random selection pools.
 */

import { describe, it, expect } from 'vitest';
import {
  MINIGAME_REGISTRY,
  MINIMALIST_MASTERPIECE_SETTINGS,
  EMOJI_CINEMA_SETTINGS,
  getEligibleMinigames,
  isMinigamePlayable,
} from '../../../lib/rmhbox/minigame-registry';
import { MINIGAME_SERVER_REGISTRY } from '../../../server/rmhbox/game-coordinator';

// ─── Tests ───────────────────────────────────────────────────────

describe('Cross-Game Integration (§6.5)', () => {
  const PHASE_6_GAMES = ['minimalist-masterpiece', 'emoji-cinema'];

  describe('Minigame Registry', () => {
    it('should have all Phase 6 games registered', () => {
      for (const id of PHASE_6_GAMES) {
        expect(MINIGAME_REGISTRY[id]).toBeDefined();
        expect(MINIGAME_REGISTRY[id].id).toBe(id);
      }
    });

    it('should return correct metadata for minimalist-masterpiece', () => {
      const mm = MINIGAME_REGISTRY['minimalist-masterpiece'];
      expect(mm.displayName).toBe('Minimalist Masterpiece');
      expect(mm.category).toBe('creative');
      expect(mm.minPlayers).toBe(3);
      expect(mm.maxPlayers).toBe(12);
      expect(mm.estimatedDurationSeconds).toBe(148);
      expect(mm.joinInProgressPolicy).toBe('spectate_only');
    });

    it('should return correct metadata for emoji-cinema', () => {
      const ec = MINIGAME_REGISTRY['emoji-cinema'];
      expect(ec.displayName).toBe('Emoji Cinema');
      expect(ec.category).toBe('word');
      expect(ec.minPlayers).toBe(3);
      expect(ec.maxPlayers).toBe(12);
      expect(ec.estimatedDurationSeconds).toBe(180);
      expect(ec.joinInProgressPolicy).toBe('join_next_subround');
    });

    it('all Phase 6 games should have displayName, description, icon, and tags', () => {
      for (const id of PHASE_6_GAMES) {
        const game = MINIGAME_REGISTRY[id];
        expect(game.displayName.length).toBeGreaterThan(0);
        expect(game.description.length).toBeGreaterThan(0);
        expect(game.icon).toBeDefined();
        expect(game.tags.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Server Registry', () => {
    it('should have handlers for both Phase 6 games', () => {
      for (const id of PHASE_6_GAMES) {
        expect(MINIGAME_SERVER_REGISTRY.has(id)).toBe(true);
        expect(typeof MINIGAME_SERVER_REGISTRY.get(id)).toBe('function');
      }
    });
  });

  describe('Random Selection', () => {
    it('random selection with 4 players should eventually include both Phase 6 games', () => {
      const seen = new Set<string>();
      const eligible = getEligibleMinigames(4);
      const phase6Eligible = eligible.filter((g) => PHASE_6_GAMES.includes(g.id));

      for (let i = 0; i < 200; i++) {
        const randomIdx = Math.floor(Math.random() * phase6Eligible.length);
        seen.add(phase6Eligible[randomIdx].id);
      }

      for (const id of PHASE_6_GAMES) {
        expect(seen.has(id)).toBe(true);
      }
    });
  });

  describe('Player Count Filtering', () => {
    it('with 3 players, both MM and EC should be eligible', () => {
      const eligible = getEligibleMinigames(3);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('minimalist-masterpiece');
      expect(ids).toContain('emoji-cinema');
    });

    it('with 2 players, both should be excluded (min 3)', () => {
      expect(isMinigamePlayable('minimalist-masterpiece', 2)).toBe(false);
      expect(isMinigamePlayable('emoji-cinema', 2)).toBe(false);
    });

    it('with 13 players, both should be excluded (max 12)', () => {
      expect(isMinigamePlayable('minimalist-masterpiece', 13)).toBe(false);
      expect(isMinigamePlayable('emoji-cinema', 13)).toBe(false);
    });
  });

  describe('Settings Schemas', () => {
    it('MINIMALIST_MASTERPIECE_SETTINGS should have 5 entries', () => {
      expect(MINIMALIST_MASTERPIECE_SETTINGS).toHaveLength(5);
    });

    it('EMOJI_CINEMA_SETTINGS should have 4 entries', () => {
      expect(EMOJI_CINEMA_SETTINGS).toHaveLength(4);
    });
  });
});
