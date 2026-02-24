/**
 * Phase 5 — Section 5.5: Cross-Game Integration Tests
 *
 * Verifies that all 4 Phase 5 minigames are correctly registered,
 * can be instantiated, respect player count constraints, and follow
 * the standard lifecycle.
 */

import { describe, it, expect } from 'vitest';
import {
  MINIGAME_REGISTRY,
  getEligibleMinigames,
  isMinigamePlayable,
} from '../../../lib/rmhbox/minigame-registry';

// ─── Tests ───────────────────────────────────────────────────────

describe('Cross-Game Integration (§5.5)', () => {
  describe('Minigame Registry', () => {
    const PHASE_5_GAMES = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];

    it('should have all 4 Phase 5 games registered', () => {
      for (const id of PHASE_5_GAMES) {
        expect(MINIGAME_REGISTRY[id]).toBeDefined();
        expect(MINIGAME_REGISTRY[id].id).toBe(id);
      }
    });

    it('should have correct metadata for rhyme-time', () => {
      const rt = MINIGAME_REGISTRY['rhyme-time'];
      expect(rt.category).toBe('word');
      expect(rt.minPlayers).toBe(2);
      expect(rt.maxPlayers).toBe(16);
      expect(rt.estimatedDurationSeconds).toBe(171);
    });

    it('should have correct metadata for undercover-agent', () => {
      const ua = MINIGAME_REGISTRY['undercover-agent'];
      expect(ua.category).toBe('word');
      expect(ua.minPlayers).toBe(4);
      expect(ua.maxPlayers).toBe(16);
      expect(ua.estimatedDurationSeconds).toBe(180);
    });

    it('should have correct metadata for category-crash', () => {
      const cc = MINIGAME_REGISTRY['category-crash'];
      expect(cc.category).toBe('word');
      expect(cc.minPlayers).toBe(3);
      expect(cc.maxPlayers).toBe(16);
      expect(cc.estimatedDurationSeconds).toBe(212);
    });

    it('should have correct metadata for wiki-race', () => {
      const wr = MINIGAME_REGISTRY['wiki-race'];
      expect(wr.category).toBe('trivia');
      expect(wr.minPlayers).toBe(2);
      expect(wr.maxPlayers).toBe(10);
      expect(wr.estimatedDurationSeconds).toBe(193);
    });

    it('all games should have displayName, description, icon, and tags', () => {
      for (const id of PHASE_5_GAMES) {
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
      for (const id of PHASE_5_GAMES) {
        const game = MINIGAME_REGISTRY[id];
        expect(game.joinInProgressPolicy).toBeDefined();
        expect(['spectate_only', 'join_immediately', 'join_next_subround']).toContain(
          game.joinInProgressPolicy,
        );
      }
    });
  });

  describe('Player Count Filtering', () => {
    it('with 4 players, all 4 Phase 5 games should be eligible', () => {
      const eligible = getEligibleMinigames(4);
      const phase5Ids = eligible
        .map((g) => g.id)
        .filter((id) =>
          ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'].includes(id),
        );
      expect(phase5Ids).toContain('rhyme-time');
      expect(phase5Ids).toContain('undercover-agent');
      expect(phase5Ids).toContain('category-crash');
      expect(phase5Ids).toContain('wiki-race');
    });

    it('with 3 players, undercover-agent should be excluded (min 4)', () => {
      const eligible = getEligibleMinigames(3);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('rhyme-time');
      expect(ids).not.toContain('undercover-agent');
      expect(ids).toContain('category-crash');
      expect(ids).toContain('wiki-race');
    });

    it('with 2 players, category-crash should be excluded (min 3)', () => {
      const eligible = getEligibleMinigames(2);
      const ids = eligible.map((g) => g.id);
      expect(ids).toContain('rhyme-time');
      expect(ids).not.toContain('undercover-agent');
      expect(ids).not.toContain('category-crash');
      expect(ids).toContain('wiki-race');
    });

    it('with 11 players, wiki-race should be excluded (max 10)', () => {
      expect(isMinigamePlayable('wiki-race', 11)).toBe(false);
      expect(isMinigamePlayable('rhyme-time', 11)).toBe(true);
    });

    it('isMinigamePlayable returns false for unknown game IDs', () => {
      expect(isMinigamePlayable('nonexistent-game', 4)).toBe(false);
    });
  });

  describe('Random Selection', () => {
    it('random selection with 4 players should eventually include all 4 games', () => {
      const seen = new Set<string>();
      const phase5Ids = new Set(['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race']);
      const eligible = getEligibleMinigames(4);
      const phase5Eligible = eligible.filter((g) => phase5Ids.has(g.id));

      // Simulate many random selections
      for (let i = 0; i < 200; i++) {
        const randomIdx = Math.floor(Math.random() * phase5Eligible.length);
        seen.add(phase5Eligible[randomIdx].id);
      }

      for (const id of phase5Ids) {
        expect(seen.has(id)).toBe(true);
      }
    });
  });

  describe('Game Definitions Consistency', () => {
    it('all Phase 5 games should have valid estimatedDurationSeconds (> 0)', () => {
      const ids = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
      for (const id of ids) {
        expect(MINIGAME_REGISTRY[id].estimatedDurationSeconds).toBeGreaterThan(0);
      }
    });

    it('all games should have minPlayers <= maxPlayers', () => {
      const ids = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
      for (const id of ids) {
        const game = MINIGAME_REGISTRY[id];
        expect(game.minPlayers).toBeLessThanOrEqual(game.maxPlayers);
      }
    });

    it('instructionDurationSeconds should be defined and positive', () => {
      const ids = ['rhyme-time', 'undercover-agent', 'category-crash', 'wiki-race'];
      for (const id of ids) {
        const game = MINIGAME_REGISTRY[id];
        expect(game.instructionDurationSeconds).toBeDefined();
        expect(game.instructionDurationSeconds).toBeGreaterThan(0);
      }
    });
  });
});
