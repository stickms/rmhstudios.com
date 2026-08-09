/**
 * Bum's Rush audio bus — shared Web Audio infrastructure.
 *
 * One AudioContext with three gain buses (music/sfx/ui) driven by GameSettings.
 * The context is unlocked on the first user gesture and suspended when the
 * document is hidden. Playable fully muted (audio is non-essential).
 *
 * Design doc: docs/plans/2026-08-08-bums-rush-design.md §14.
 */

import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';
import type { GameSettings } from '../types';

interface BusGains {
  music: GainNode;
  sfx: GainNode;
  ui: GainNode;
}

/** The audio bus lifecycle. Shared across all game instances (but the game is top-level). */
let audioContext: AudioContext | null = null;
let busGains: BusGains | null = null;
let globalMute = false;
let hiddenListener: (() => void) | null = null;

/**
 * The last levels the game asked for, so mute is a temporary override rather
 * than a destructive one. Full volume until the settings load.
 */
let lastSettings: Pick<GameSettings, 'music' | 'sfx' | 'ui'> = { music: 100, sfx: 100, ui: 100 };

/**
 * Initialize the audio context on the first user gesture. SSR-safe.
 */
export function initAudioBus(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null;

  audioContext = getAudioContext();
  if (!audioContext) return null;

  resumeAudioContext();

  // Create three gain buses: music, sfx, ui.
  const music = audioContext.createGain();
  const sfx = audioContext.createGain();
  const ui = audioContext.createGain();

  // All three connect to the main output.
  music.connect(audioContext.destination);
  sfx.connect(audioContext.destination);
  ui.connect(audioContext.destination);

  busGains = { music, sfx, ui };

  // Suspend when document is hidden (backgrounded tab should not make noise).
  if (hiddenListener === null) {
    hiddenListener = () => {
      if (typeof document === 'undefined' || !audioContext) return;
      if (document.hidden) {
        if (audioContext.state !== 'suspended') {
          void audioContext.suspend().catch(() => {});
        }
      } else {
        if (audioContext.state === 'suspended') {
          void audioContext.resume().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', hiddenListener);
  }

  return audioContext;
}

/**
 * Get the current audio context, or null if unavailable.
 * Does not create one — call `initAudioBus()` to initialize.
 */
export function getContext(): AudioContext | null {
  return audioContext;
}

/**
 * Apply settings to the three gain buses. Called whenever GameSettings change.
 */
export function applyAudioSettings(settings: Pick<GameSettings, 'music' | 'sfx' | 'ui'>): void {
  // Remembered so `setGlobalMute(false)` has something to restore to, and so a
  // bus initialised after the settings loaded still picks them up.
  lastSettings = settings;
  if (!busGains) return;

  const musicGain = globalMute ? 0 : settings.music / 100;
  const sfxGain = globalMute ? 0 : settings.sfx / 100;
  const uiGain = globalMute ? 0 : settings.ui / 100;

  busGains.music.gain.value = musicGain;
  busGains.sfx.gain.value = sfxGain;
  busGains.ui.gain.value = uiGain;
}

/**
 * Get a gain node for a given bus. Null if audio is unavailable.
 */
export function getGainNode(bus: 'music' | 'sfx' | 'ui'): GainNode | null {
  if (!busGains) return null;
  return busGains[bus];
}

/**
 * Toggle global mute state and apply it.
 *
 * Unmuting restores the last applied settings rather than slamming every bus to
 * 1. It used to do the latter, which meant a player who had put music at 20%,
 * muted for a phone call and unmuted got music back at full volume — the
 * setting silently discarded by the control that was supposed to be temporary.
 */
export function setGlobalMute(muted: boolean): void {
  globalMute = muted;
  applyAudioSettings(lastSettings);
}

/**
 * Clean up audio resources (called on game teardown, though rarely needed).
 */
export function disposeBus(): void {
  if (hiddenListener) {
    document.removeEventListener('visibilitychange', hiddenListener);
    hiddenListener = null;
  }
  // AudioContext is not closed — it's shared across the page.
}
