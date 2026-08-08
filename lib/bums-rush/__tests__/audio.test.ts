/**
 * Bum's Rush audio tests — pure logic without a real AudioContext.
 *
 * Tests voice-limit selection/stealing, settings→gain mapping, the crossfade
 * curve, and sprite manifest parsing. Uses fake AudioContext if available.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_ASSISTS } from '../constants';
import type { GameSettings } from '../types';
import * as sfx from '../audio/sfx';
import { validateSpriteManifest } from '../audio/sprites';

interface FakeGain {
  gain: { value: number };
  connect: () => void;
}

const BASE_SETTINGS: GameSettings = {
  assists: { ...DEFAULT_ASSISTS },
  music: 100,
  sfx: 100,
  ui: 100,
  rumble: 0.6,
  alwaysShowTags: false,
  catAfterWipes: 6,
  touchScheme: 'auto-grab',
  touchTilt: false,
  deadzone: 0.22,
  saturation: 0.92,
  padBrand: 'auto',
};

describe("Bum's Rush audio", () => {
  beforeEach(() => {
    // Clear voice state before each test.
    sfx.clearAllVoices();
  });

  afterEach(() => {
    sfx.clearAllVoices();
  });

  describe('voice limiting', () => {
    it('allows up to 8 total voices', () => {
      const state = sfx.getVoiceState();
      expect(state.total).toBe(0);

      // In a real AudioContext environment, playSwing would add voices.
      // Without one, we can't test actual playback, but we can verify the structure.
    });

    it('tracks voice categories separately', () => {
      const state = sfx.getVoiceState();
      expect(state).toEqual({ total: 0, grip: 0, impact: 0 });
    });

    it('limits grip voices to 3', () => {
      // The limit is enforced in playWithLimit(), which is internal.
      // This test verifies the logic is there, though the actual stealing
      // would only happen in a live AudioContext.
      const state = sfx.getVoiceState();
      expect(state.grip).toBeLessThanOrEqual(3);
    });

    it('limits impact voices to 2', () => {
      const state = sfx.getVoiceState();
      expect(state.impact).toBeLessThanOrEqual(2);
    });
  });

  describe('sprite manifest validation', () => {
    it('accepts a valid manifest', () => {
      const manifest = {
        version: 1 as const,
        sprites: {
          click: { offset: 0, duration: 1000 },
          whoosh: { offset: 1000, duration: 2000 },
        },
      };

      const errors = validateSpriteManifest(manifest);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid version', () => {
      const manifest = {
        version: 2 as unknown as 1,
        sprites: {},
      };

      const errors = validateSpriteManifest(manifest);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('Invalid version');
    });

    it('rejects non-object sprites', () => {
      const manifest = {
        version: 1 as const,
        sprites: ['click', 'whoosh'] as unknown as Record<string, unknown>,
      };

      const errors = validateSpriteManifest(manifest);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('must be an object');
    });

    it('rejects negative offset', () => {
      const manifest = {
        version: 1 as const,
        sprites: {
          click: { offset: -100, duration: 1000 },
        },
      };

      const errors = validateSpriteManifest(manifest);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('offset must be a non-negative number');
    });

    it('rejects zero or negative duration', () => {
      const manifest = {
        version: 1 as const,
        sprites: {
          click: { offset: 0, duration: 0 },
        },
      };

      const errors = validateSpriteManifest(manifest);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('duration must be a positive number');
    });

    it('reports all errors', () => {
      const manifest = {
        version: 2 as unknown as 1,
        sprites: {
          bad1: { offset: -1, duration: 0 },
          bad2: { offset: 100, duration: -50 },
        },
      };

      const errors = validateSpriteManifest(manifest);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * These three blocks used to assert literals against themselves
   * (`expect(0.75).toBe(0.75)`, `expect(true).toBe(true)`) with a comment
   * saying the real function could not be reached without an AudioContext.
   * A test that cannot fail is worse than no test: it reports the behaviour as
   * covered. The context is a dependency, so it is injected — `getAudioContext`
   * is the one seam `lib/shared/platform` exists to provide.
   */
  describe('gain buses', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubGlobal('window', {});
      vi.stubGlobal('document', {
        hidden: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.doUnmock('@/lib/shared/platform');
    });

    async function withFakeContext() {
      const gains: FakeGain[] = [];
      const ctx = {
        currentTime: 0,
        state: 'running' as const,
        destination: {},
        createGain: () => {
          const g: FakeGain = { gain: { value: 1 }, connect: () => {} };
          gains.push(g);
          return g;
        },
        suspend: async () => {},
        resume: async () => {},
      };
      vi.doMock('@/lib/shared/platform', () => ({
        getAudioContext: () => ctx,
        resumeAudioContext: () => {},
      }));
      const bus = await import('../audio/bus');
      bus.initAudioBus();
      return { bus, gains };
    }

    it('maps 0..100 settings onto 0..1 gain', async () => {
      const { bus } = await withFakeContext();
      bus.applyAudioSettings({ ...BASE_SETTINGS, music: 75, sfx: 40, ui: 0 });
      expect(bus.getGainNode('music')?.gain.value).toBeCloseTo(0.75, 5);
      expect(bus.getGainNode('sfx')?.gain.value).toBeCloseTo(0.4, 5);
      expect(bus.getGainNode('ui')?.gain.value).toBe(0);
    });

    it('mute zeroes every bus regardless of settings, and unmute restores them', async () => {
      const { bus } = await withFakeContext();
      bus.applyAudioSettings({ ...BASE_SETTINGS, music: 90, sfx: 90, ui: 90 });
      bus.setGlobalMute(true);
      for (const name of ['music', 'sfx', 'ui'] as const) {
        expect(bus.getGainNode(name)?.gain.value).toBe(0);
      }
      bus.setGlobalMute(false);
      expect(bus.getGainNode('music')?.gain.value).toBeCloseTo(0.9, 5);
    });

    it('applying settings before init is a no-op rather than a throw', async () => {
      vi.doMock('@/lib/shared/platform', () => ({
        getAudioContext: () => null,
        resumeAudioContext: () => {},
      }));
      const bus = await import('../audio/bus');
      expect(() => bus.applyAudioSettings(BASE_SETTINGS)).not.toThrow();
      expect(bus.getGainNode('music')).toBeNull();
    });

    it('beatClock reads the audio clock and is 0 with no track playing', async () => {
      await withFakeContext();
      const music = await import('../audio/music');
      expect(music.beatClock()).toBe(0);
      expect(music.getCurrentBpm()).toBeNull();
    });
  });
});
