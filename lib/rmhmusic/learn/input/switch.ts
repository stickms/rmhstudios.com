/**
 * Switch the learner's interactive input from `previous` to `next`. The new
 * source starts FIRST; only once it is running are the others (the previous
 * input, and any other started keys/mic/MIDI) stopped, so a switch that fails
 * (a blocked microphone, a missing MIDI device, a start cancelled meanwhile)
 * leaves the old input playing instead of leaving the learner with nothing.
 * The on-screen keys are never stopped: they only emit while pressed.
 * Pure over the `InputHub` interface; tested with fakes.
 */
import type { LearnInput } from '../schemas';
import type { InputHub } from './hub';

const SWITCHED: readonly LearnInput[] = ['keys', 'mic', 'midi'];

/** Resolves true when `next` is running and the others are stopped; false (nothing stopped) otherwise. */
export async function switchInput(
  hub: InputHub,
  previous: LearnInput | undefined,
  next: LearnInput,
): Promise<boolean> {
  try {
    await hub.start(next);
  } catch {
    return false;
  }
  // A start can settle without running: a stop (the screen went away) cancelled it.
  if (hub.phase(next) !== 'active') return false;
  for (const source of SWITCHED) {
    if (source !== next && (source === previous || hub.phase(source) !== 'idle')) hub.stop(source);
  }
  return true;
}
