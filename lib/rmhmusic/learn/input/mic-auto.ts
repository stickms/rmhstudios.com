/**
 * Automatic sensitivity for the microphone — pure, one frame at a time.
 *
 * What a voice-chat app's "automatically determine input sensitivity" does, for notes. Two jobs:
 *
 *   Cutoff   The room's noise floor is tracked from the frames where no note is sounding (fast down,
 *            slow up, so a fan switching on is learned in about ten seconds and a passing noise is not),
 *            and the cutoff sits a fixed multiple above it, between AUTO_GATE_MIN and AUTO_GATE_MAX.
 *            Hum and hiss below the cutoff never reach the pitch detector.
 *   Gain     While a note is sounding (the detector found a pitch in it) the gain is steered so its level sits near TARGET_RMS: down quickly when it is too loud
 *            (clipping distorts pitch), up slowly when it is too quiet, and not at all while a note is
 *            only dying away (so it does not pump). With no note the gain holds, so silence and noise
 *            are never amplified. A note too quiet to reach the detector at all is the manual gain's job;
 *            the automatic cutoff is low enough (AUTO_GATE_MIN) that most quiet notes still get through.
 *
 * All levels are RMS of a frame (0..1). `rms` is measured after the gain, as the analyser sees it;
 * the floor is kept before the gain so it does not move when the gain does.
 */
import { clampMicGain } from './mic-gain';

/** The level a note is steered toward (comfortably above every cutoff, well under clipping). */
export const TARGET_RMS = 0.1;
/** Automatic gain may go below 1 (a hot microphone) but never above the slider's top. */
export const AUTO_MIN_GAIN = 0.25;
/** The cutoff is this many times the room's noise floor. */
export const GATE_FACTOR = 3;
/** As low as the manual cutoff goes, so a quiet note still reaches the pitch detector, which does the real
 * rejecting (a noisy frame has no clear period), and the gain can then bring it up. */
export const AUTO_GATE_MIN = 0.002;
export const AUTO_GATE_MAX = 0.04;

/** Per frame (25 ms): the exponent of the correction toward the target, loud then quiet. */
const ATTACK = 0.25;
const RELEASE = 0.004;
/** Per frame the gain moves at most this factor down / up. */
const MAX_DROP = 0.9;
const MAX_RISE = 1.02;
/** The noise floor rises this fraction of the gap per frame, and falls much faster. */
const FLOOR_RISE = 0.002;
const FLOOR_FALL = 0.2;
const FLOOR_MIN = 1e-5;
/** A level that fell by more than this since the last frame is a note dying away, not a quiet one. */
const FALLING = 0.99;

export interface AutoLevel {
  /** Feed one frame; returns the gain and the cutoff to use from now on. */
  step(frame: { rms: number; pitched: boolean }): { gain: number; gate: number };
  readonly gain: number;
  readonly gate: number;
}

function clampGain(g: number): number {
  return Math.min(16, Math.max(AUTO_MIN_GAIN, g));
}

export function createAutoLevel(initialGain = 1): AutoLevel {
  let gain = clampGain(clampMicGain(initialGain));
  let floor: number | null = null;
  let previous = 0;
  let gate = AUTO_GATE_MIN * 2;

  const compute = () => {
    const raw = floor === null ? 0 : floor * gain * GATE_FACTOR;
    gate = Math.min(AUTO_GATE_MAX, Math.max(AUTO_GATE_MIN, raw));
  };

  return {
    step({ rms, pitched }) {
      if (!Number.isFinite(rms) || rms < 0) return { gain, gate };
      const raw = Math.max(FLOOR_MIN, rms / gain);
      // Only a found pitch is a note. Anything else, however loud (a fan, a clap, a voice that is not
      // singing), is the room: it moves the floor, never the gain, so a steady noise cannot be chased.
      if (!pitched) {
        if (floor === null) floor = raw;
        else floor += (raw - floor) * (raw < floor ? FLOOR_FALL : FLOOR_RISE);
      } else if (rms > 0) {
        const ratio = TARGET_RMS / rms;
        if (rms > TARGET_RMS * 1.3) gain *= Math.max(MAX_DROP, ratio ** ATTACK);
        else if (rms < TARGET_RMS * 0.7 && rms >= previous * FALLING) gain *= Math.min(MAX_RISE, ratio ** RELEASE);
        gain = clampGain(gain);
      }
      previous = rms;
      compute();
      return { gain, gate };
    },
    get gain() {
      return gain;
    },
    get gate() {
      return gate;
    },
  };
}
