/**
 * Bum's Rush music playback — world loops with beat-synced platform support.
 *
 * One loop per world + menu + showdown. Crossfade 800ms on world change.
 * Duck 6dB under the clear jingle. Marker Mosh (world 8) reads the audio clock
 * so beat-synced platforms don't drift from the music.
 *
 * Design doc: docs/plans/2026-08-08-bums-rush-design.md §14.
 */

import { getContext, getGainNode } from './bus';

interface MusicTrack {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  startTime: number;
}

let currentTrack: MusicTrack | null = null;
let fadingOutTrack: MusicTrack | null = null;
let musicGain: GainNode | null = null;

const CROSSFADE_MS = 800;

/**
 * Initialize the music system. Call once at startup.
 */
export function initMusic(): void {
  const ctx = getContext();
  if (!ctx) return;

  musicGain = getGainNode('music');
}

/**
 * Load a music buffer (usually from a sprite sheet).
 * Does not play yet — call `playMusic()` to start it.
 */
export function loadMusicBuffer(buffer: AudioBuffer): MusicTrack {
  return {
    buffer,
    source: null,
    startTime: 0,
  };
}

/**
 * Switch to a new music track with an 800ms crossfade.
 * If the same track is already playing, this is a no-op.
 */
export function playMusic(track: MusicTrack): void {
  const ctx = getContext();
  if (!ctx || !musicGain) return;

  if (currentTrack === track && currentTrack.source) {
    // Already playing this track.
    return;
  }

  // Fade out the current track.
  if (currentTrack) {
    fadingOutTrack = currentTrack;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + CROSSFADE_MS / 1000);

    // Stop the old track after the fade.
    setTimeout(() => {
      if (fadingOutTrack?.source) {
        fadingOutTrack.source.stop();
        fadingOutTrack.source = null;
      }
      fadingOutTrack = null;
    }, CROSSFADE_MS);
  }

  // Start the new track.
  const source = ctx.createBufferSource();
  source.buffer = track.buffer;
  source.loop = true;

  source.connect(musicGain);

  // Fade in the new track.
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(0, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(1, ctx.currentTime + CROSSFADE_MS / 1000);

  source.start(ctx.currentTime);
  track.source = source;
  track.startTime = ctx.currentTime;

  currentTrack = track;
}

/**
 * Stop music playback (used on level clear or game end).
 */
export function stopMusic(): void {
  const ctx = getContext();
  if (!ctx || !musicGain) return;

  if (currentTrack?.source) {
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

    setTimeout(() => {
      if (currentTrack?.source) {
        currentTrack.source.stop();
        currentTrack.source = null;
      }
    }, 300);
  }

  currentTrack = null;
}

/**
 * Duck music by 6dB (a significant perceptual drop) during the clear jingle.
 * Call when the level clear sound starts, then call `unduckMusic()` when it ends.
 */
export function duckMusic(): void {
  const ctx = getContext();
  if (!ctx || !musicGain) return;

  const duckGain = 0.5; // -6dB = 0.5 linear gain.
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(duckGain, ctx.currentTime + 0.1);
}

/**
 * Restore music volume after a duck.
 */
export function unduckMusic(): void {
  const ctx = getContext();
  if (!ctx || !musicGain) return;

  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.3);
}

/**
 * Get the current beat-synced clock, as an absolute time in the current music.
 *
 * Marker Mosh (world 8) calls this to sync platform movement to the music,
 * so beat-synced platforms don't drift. The clock is AudioContext.currentTime
 * rather than performance.now(), so it's driven by the audio hardware and
 * resistant to main-thread jitter.
 *
 * Returns the number of seconds elapsed since the track started, or 0 if
 * no music is playing.
 */
export function beatClock(): number {
  const ctx = getContext();
  if (!ctx || !currentTrack) return 0;

  if (!currentTrack.source) return 0;

  // The track started at `currentTrack.startTime` in AudioContext time.
  // The elapsed time is the current audio time minus that.
  return ctx.currentTime - currentTrack.startTime;
}

/**
 * Get the current music track's BPM (if known).
 * This would be stored in the level data and passed here by the game loop.
 * For now, this is a placeholder.
 */
export function getCurrentBpm(): number | null {
  // In a full implementation, this would be read from the level data.
  // For now, return null and let callers use beatClock() directly.
  return null;
}
