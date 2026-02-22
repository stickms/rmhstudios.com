/**
 * RMHbox — Sound Manager
 *
 * Provides a simple API for playing UI sound effects using Howler.js.
 * Respects master and SFX volume settings from the Zustand store.
 *
 * Sound files are loaded from /music/rmhbox/ and played on demand.
 * All sounds are optional — if a file fails to load, playback
 * is silently skipped.
 *
 * Reference: docs/rmhbox/implementation/phase-4.md §9
 */

'use client';

import { Howl } from 'howler';
import { useRMHboxStore } from './store';

// ─── Sound Definitions ──────────────────────────────────────────

export type SoundName =
  | 'chime'
  | 'click'
  | 'countdownBeep'
  | 'goFanfare'
  | 'scoreDing'
  | 'buzzer'
  | 'victoryFanfare'
  | 'swoosh';

const SOUND_PATHS: Record<SoundName, string> = {
  chime: '/music/rmhbox/chime.mp3',
  click: '/music/rmhbox/click.mp3',
  countdownBeep: '/music/rmhbox/countdown-beep.mp3',
  goFanfare: '/music/rmhbox/go-fanfare.mp3',
  scoreDing: '/music/rmhbox/score-ding.mp3',
  buzzer: '/music/rmhbox/buzzer.mp3',
  victoryFanfare: '/music/rmhbox/victory-fanfare.mp3',
  swoosh: '/music/rmhbox/swoosh.mp3',
};

// ─── Sound Cache ────────────────────────────────────────────────

const soundCache = new Map<SoundName, Howl>();

/**
 * Get or create a Howl instance for a given sound name.
 * Instances are cached for reuse.
 */
function getSound(name: SoundName): Howl {
  let howl = soundCache.get(name);
  if (!howl) {
    howl = new Howl({
      src: [SOUND_PATHS[name]],
      preload: true,
      html5: false,
    });
    soundCache.set(name, howl);
  }
  return howl;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Play a named sound effect at the current volume settings.
 * Silently ignores playback errors (missing files, etc).
 */
export function playSound(name: SoundName): void {
  try {
    const { settings } = useRMHboxStore.getState();
    const volume = settings.masterVolume * settings.sfxVolume;

    if (volume <= 0) return;

    const sound = getSound(name);
    sound.volume(volume);
    sound.play();
  } catch {
    // Silently ignore — sounds are optional
  }
}

/**
 * Preload all sound effects so they're ready to play instantly.
 */
export function preloadSounds(): void {
  for (const name of Object.keys(SOUND_PATHS) as SoundName[]) {
    try {
      getSound(name);
    } catch {
      // Silently ignore load errors
    }
  }
}
