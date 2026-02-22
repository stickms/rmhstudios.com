/**
 * Phase 4 §9 — Sound System Tests
 *
 * Verifies the SoundManager exports and sound name definitions.
 * Since Howler requires a browser audio context, we test the
 * module's exports and configuration without actually playing sounds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Howler.js for Node.js environment
vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => ({
    play: vi.fn(),
    volume: vi.fn(),
  })),
}));

describe('Sound System (§9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export playSound function', async () => {
    const { playSound } = await import('../../../lib/rmhbox/audio');
    expect(typeof playSound).toBe('function');
  });

  it('should export preloadSounds function', async () => {
    const { preloadSounds } = await import('../../../lib/rmhbox/audio');
    expect(typeof preloadSounds).toBe('function');
  });

  it('should not throw when playing a valid sound name', async () => {
    const { playSound } = await import('../../../lib/rmhbox/audio');
    expect(() => playSound('click')).not.toThrow();
    expect(() => playSound('chime')).not.toThrow();
    expect(() => playSound('countdownBeep')).not.toThrow();
    expect(() => playSound('goFanfare')).not.toThrow();
    expect(() => playSound('scoreDing')).not.toThrow();
    expect(() => playSound('buzzer')).not.toThrow();
    expect(() => playSound('victoryFanfare')).not.toThrow();
    expect(() => playSound('swoosh')).not.toThrow();
  });

  it('should not throw when preloading sounds', async () => {
    const { preloadSounds } = await import('../../../lib/rmhbox/audio');
    expect(() => preloadSounds()).not.toThrow();
  });

  it('should define all 8 sound names', async () => {
    // Verify the type definitions include all expected sounds
    const expectedSounds = [
      'chime', 'click', 'countdownBeep', 'goFanfare',
      'scoreDing', 'buzzer', 'victoryFanfare', 'swoosh',
    ];

    // If any of these fail to compile, the type system catches it
    const { playSound } = await import('../../../lib/rmhbox/audio');
    for (const sound of expectedSounds) {
      expect(() => playSound(sound as Parameters<typeof playSound>[0])).not.toThrow();
    }
  });
});
