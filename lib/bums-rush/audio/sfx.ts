/**
 * Bum's Rush SFX engine — map GameEvent to sounds with voice limiting.
 *
 * Max 8 concurrent voices with per-category limits:
 * - max 3 grip sounds (clicks/slips/tears)
 * - max 2 impacts
 * - the rest are free for objectives/responses/parcels/etc
 *
 * When a limit is hit, we steal the oldest sound in that category.
 *
 * Design doc: docs/plans/2026-08-08-bums-rush-design.md §14.
 */

import type { GameEvent } from '../types';
import * as synth from './synth';

/** A playing voice and when it started. */
interface Voice {
  category: 'grip' | 'impact' | 'other';
  startTime: number;
  stop: () => void;
}

const MAX_VOICES = 8;
const MAX_GRIP_VOICES = 3;
const MAX_IMPACT_VOICES = 2;

let voices: Voice[] = [];

/**
 * Play a synth sound with voice limiting.
 * Returns a function to stop the voice early.
 */
function playWithLimit(
  category: 'grip' | 'impact' | 'other',
  play: (stop: () => void) => void,
): () => void {
  const now = Date.now();
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    voices = voices.filter((v) => v !== voice);
  };

  // Check if we need to steal a voice.
  const gripVoices = voices.filter((v) => v.category === 'grip');
  const impactVoices = voices.filter((v) => v.category === 'impact');
  const totalVoices = voices.length;

  let needsSteal = false;
  if (totalVoices >= MAX_VOICES) {
    needsSteal = true;
  } else if (category === 'grip' && gripVoices.length >= MAX_GRIP_VOICES) {
    needsSteal = true;
  } else if (category === 'impact' && impactVoices.length >= MAX_IMPACT_VOICES) {
    needsSteal = true;
  }

  if (needsSteal) {
    const toSteal =
      category === 'grip'
        ? gripVoices[0]
        : category === 'impact'
          ? impactVoices[0]
          : voices[0]; // For 'other', steal any voice.

    if (toSteal) {
      toSteal.stop();
    }
  }

  const voice: Voice = { category, startTime: now, stop };
  voices.push(voice);

  // Call the play function with the stop callback.
  play(stop);

  return stop;
}

/**
 * Handle a game event and play the corresponding sound.
 */
export function handleGameEvent(event: GameEvent): void {
  switch (event.kind) {
    case 'grip':
      if (event.on) {
        playWithLimit('grip', () => synth.playSynthClick());
      }
      break;

    case 'death':
      playWithLimit('impact', () => synth.playSynthCrumple());
      break;

    case 'respawn':
      playWithLimit('other', () => synth.playSynthRespawn());
      break;

    case 'checkpoint':
      // No sound for checkpoints.
      break;

    case 'objective':
      playWithLimit('other', () => synth.playSynthObjective());
      break;

    case 'parcel':
      playWithLimit('other', () => synth.playSynthParcelFound());
      break;

    case 'item':
      // No sound for item pickup (visual feedback via prop animation).
      break;

    case 'signal':
      // No sound for signals (internal game logic).
      break;

    case 'cat':
      playWithLimit('other', () => synth.playSynthInkblot());
      break;

    case 'finish':
      // Level clear jingle — handled by music.ts (ducked).
      playWithLimit('other', () => synth.playSynthPageTurn());
      break;

    case 'emote':
      // No synth for emotes (visual bubble is the feedback).
      break;
  }
}

/**
 * Play a swing whoosh based on arm speed.
 * `speed` is 0..1 (0 = very slow, 1 = very fast).
 */
export function playSwing(speed: number): void {
  playWithLimit('other', () => synth.playSynthWhoosh(speed));
}

/**
 * Play a grip slip sound — pencil skid on paper.
 */
export function playGripSlip(): void {
  playWithLimit('grip', () => synth.playSynthTear(0.2));
}

/**
 * Play a grip tension warning sound — paper tearing with pitch rising.
 * `tension` is 0..1.
 */
export function playGripTension(tension: number): void {
  playWithLimit('grip', () => synth.playSynthTear(tension));
}

/**
 * Play an impact sound (survivable collision).
 */
export function playImpact(): void {
  playWithLimit('impact', () => synth.playSynthImpact());
}

/**
 * Test voice limiting logic: get current voice state.
 * Only exported for unit tests.
 */
export function getVoiceState(): { total: number; grip: number; impact: number } {
  const grip = voices.filter((v) => v.category === 'grip').length;
  const impact = voices.filter((v) => v.category === 'impact').length;
  return { total: voices.length, grip, impact };
}

/**
 * Test voice limiting logic: clear all voices and reset state.
 * Only exported for unit tests.
 */
export function clearAllVoices(): void {
  voices.forEach((v) => v.stop());
  voices = [];
}
