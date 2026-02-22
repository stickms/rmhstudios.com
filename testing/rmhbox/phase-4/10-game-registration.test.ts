/**
 * Phase 4 §10 — Game Registration Tests
 *
 * Verifies that RMHbox is registered in the site's game registry
 * with correct metadata, styling, and links.
 */

import { describe, it, expect } from 'vitest';
import { games } from '../../../lib/games';

describe('Game Registration (§10)', () => {
  const rmhbox = games.find((g) => g.id === 'rmhbox');

  it('should include RMHbox in the games registry', () => {
    expect(rmhbox).toBeDefined();
  });

  it('should have correct title and description', () => {
    expect(rmhbox!.title).toBe('RMHbox');
    expect(rmhbox!.description).toContain('Party game');
  });

  it('should link to /rmhbox', () => {
    expect(rmhbox!.href).toBe('/rmhbox');
  });

  it('should have Playable status with Play Now CTA', () => {
    expect(rmhbox!.status).toBe('Playable');
    expect(rmhbox!.cta).toBe('Play Now');
  });

  it('should have purple-to-pink gradient', () => {
    expect(rmhbox!.gradient).toContain('purple');
    expect(rmhbox!.gradient).toContain('pink');
  });

  it('should use Gamepad2 icon', () => {
    expect(rmhbox!.iconName).toBe('Gamepad2');
  });

  it('should have multiplayer, party, and minigames tags', () => {
    const tags = rmhbox!.tags.map((t) => t.toLowerCase());
    expect(tags).toContain('multiplayer');
    expect(tags).toContain('party');
    expect(tags).toContain('minigames');
  });

  it('should not be a Steam game', () => {
    expect(rmhbox!.isSteam).toBe(false);
  });

  it('should have a color property for game page styling', () => {
    expect(rmhbox!.color).toBeDefined();
    expect(rmhbox!.color.length).toBeGreaterThan(0);
  });
});
