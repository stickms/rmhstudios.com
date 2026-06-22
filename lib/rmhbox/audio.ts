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
import { asset } from '@/lib/storage/asset';

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
  chime: asset('/music/rmhbox/sfx/chime.mp3'),
  click: asset('/music/rmhbox/sfx/click.mp3'),
  countdownBeep: asset('/music/rmhbox/sfx/countdownBeep.mp3'),
  goFanfare: asset('/music/rmhbox/sfx/goFanfare.mp3'),
  scoreDing: asset('/music/rmhbox/sfx/scoreDing.mp3'),
  buzzer: asset('/music/rmhbox/sfx/buzzer.mp3'),
  victoryFanfare: asset('/music/rmhbox/sfx/victoryFanfare.mp3'),
  swoosh: asset('/music/rmhbox/sfx/swoosh.mp3'),
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
