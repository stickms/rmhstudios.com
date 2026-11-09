/**
 * The learner's own notes, made audible: one triangle-wave oscillator per note
 * through a short gain envelope. Deliberately tiny (no samples, no Tone.js) so
 * a beginner tapping on-screen or computer keys hears what they played. MIDI
 * keyboards have their own sound and the mic is the learner's instrument, so
 * callers sound only `screen` / `keys` notes.
 *
 * Client-only: the shared context comes from `getAudioContext()` inside
 * `playNote`, never at module load, so SSR is safe. Without Web Audio (or while
 * the context cannot run) a note is a silent no-op.
 */
import { getAudioContext } from '@/lib/shared/platform';
import { midiToFreq } from '../pitch/notes';

const ATTACK_S = 0.01;
const RELEASE_S = 0.25;
/** How long a released note keeps sounding (ms): the lesson's microphone waits this out. */
export const RELEASE_MS = RELEASE_S * 1000;
/** Peak gain at full velocity; low enough that a six-note chord does not clip. */
const PEAK = 0.18;
/** Voices sounding at once; the oldest is released to make room. */
export const MAX_VOICES = 6;

interface Voice {
  release(): void;
}

const voices: Voice[] = [];
const noop = () => {};

/**
 * Start a note; returns a function that releases it (safe to call twice).
 * `velocity` is 0..1.
 */
export function playNote(midi: number, velocity = 0.8): () => void {
  const ctx = getAudioContext();
  if (!ctx || !Number.isFinite(midi)) return noop;
  // A context starts suspended until a user gesture; notes come from one.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  if (ctx.state === 'closed') return noop;

  while (voices.length >= MAX_VOICES) voices[0].release();

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = midiToFreq(midi);
  const peak = PEAK * Math.min(1, Math.max(0.05, velocity));
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + ATTACK_S);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);

  let released = false;
  const voice: Voice = {
    release() {
      if (released) return;
      released = true;
      const i = voices.indexOf(voice);
      if (i >= 0) voices.splice(i, 1);
      const t = ctx.currentTime;
      // Hold the current level, then fall exponentially-ish to silence.
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.setTargetAtTime(0, t, RELEASE_S / 4);
      osc.stop(t + RELEASE_S);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    },
  };
  voices.push(voice);
  return voice.release;
}
