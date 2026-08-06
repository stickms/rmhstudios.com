'use client';

/**
 * Thunder, synthesised.
 *
 * The clap is two layers played together: a short bright crack (white noise
 * through a lowpass that sweeps down fast) and a long body (the same noise
 * through a much lower, slowly-opening filter) with a two-stage decay — a quick
 * drop off the initial hit, then a long tail that rolls away. No sample, so
 * nothing to download and nothing to keep in sync with the visual.
 *
 * Always goes through `getAudioContext()`: browsers cap how many contexts a
 * document may create, and the repo's rule is that nothing calls
 * `new AudioContext()` directly.
 */

import { getAudioContext, resumeAudioContext } from '@/lib/shared/platform';

const TAIL_SECONDS = 2.6;

let noiseBuffer: AudioBuffer | null = null;

/**
 * A shared buffer of white noise, long enough for the whole tail.
 *
 * Generated once and reused: filling ~2.6s of stereo-rate float samples costs a
 * few hundred thousand `Math.random()` calls, which is not something to do on
 * every strike.
 */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;

  const length = Math.floor(ctx.sampleRate * TAIL_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;

  noiseBuffer = buffer;
  return buffer;
}

/** One noise voice: source → lowpass → gain → destination. */
function voice(ctx: AudioContext, buffer: AudioBuffer, playbackRate: number) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';

  const gain = ctx.createGain();
  gain.gain.value = 0;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  return { source, filter, gain };
}

/**
 * Play a thunderclap. Silent no-op when Web Audio is unavailable or the context
 * is still suspended — call {@link unlockThunder} from a user gesture first.
 */
export function playThunder(volume = 0.85): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const buffer = getNoiseBuffer(ctx);
  const now = ctx.currentTime;

  // Each strike is a little different — a distant roll or one right overhead.
  const distance = 0.4 + Math.random() * 0.6;
  const peak = volume * (0.55 + distance * 0.45);

  // The crack: bright for a moment, then the top end falls out of it.
  const crack = voice(ctx, buffer, 1);
  crack.filter.frequency.setValueAtTime(4200 * distance + 800, now);
  crack.filter.frequency.exponentialRampToValueAtTime(320, now + 0.28);
  crack.filter.Q.value = 0.7;
  crack.gain.gain.setValueAtTime(0, now);
  crack.gain.gain.linearRampToValueAtTime(peak, now + 0.012);
  crack.gain.gain.exponentialRampToValueAtTime(peak * 0.18, now + 0.22);
  crack.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

  // The body: the low roll that arrives under the crack and outlasts it.
  const rumble = voice(ctx, buffer, 0.55);
  rumble.filter.frequency.setValueAtTime(90, now);
  rumble.filter.frequency.linearRampToValueAtTime(220, now + 0.5);
  rumble.filter.frequency.linearRampToValueAtTime(70, now + TAIL_SECONDS);
  rumble.filter.Q.value = 1.4;
  rumble.gain.gain.setValueAtTime(0, now);
  rumble.gain.gain.linearRampToValueAtTime(peak * 0.9, now + 0.09);
  rumble.gain.gain.exponentialRampToValueAtTime(peak * 0.3, now + 0.9);
  rumble.gain.gain.exponentialRampToValueAtTime(0.0001, now + TAIL_SECONDS);

  for (const v of [crack, rumble]) {
    v.source.start(now);
    v.source.stop(now + TAIL_SECONDS + 0.05);
    // Nodes are garbage once the tail ends; dropping the edges lets them go
    // rather than leaving a graph per strike attached to the destination.
    v.source.onended = () => {
      v.source.disconnect();
      v.filter.disconnect();
      v.gain.disconnect();
    };
  }
}

/**
 * Create and resume the context from inside a user gesture.
 *
 * Returns whether audio is actually going to play. Every engine starts contexts
 * suspended until the user has interacted, so this has to be called from a real
 * click handler — not from an effect on mount.
 */
export function unlockThunder(): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;
  resumeAudioContext();
  return true;
}
