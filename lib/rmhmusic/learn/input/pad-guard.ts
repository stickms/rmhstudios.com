/**
 * The tap pad is one button that is "Start" before and after a run and "Tap" during it. A finger
 * (or the Space bar) that is still down when the run ends would, on release, click whatever the
 * button has become: a held Space fires its click on keyup, a pointer that went down on the pad
 * clicks on pointerup. Left alone, that release starts a new run the learner never asked for.
 *
 * So the pad tells this guard when a tap is held (`press`/`release`) and when it turns into Start
 * (`toStart`); if a tap was held then, the next click is swallowed (`allowClick` says no, once).
 * A release that is followed by no click (the pointer slid off the pad) is cleared by `settle`,
 * which the pad calls from a timer after the release, so a swallow can never eat a later, real
 * click. Pure: no DOM, no clock.
 */
export interface PadGuard {
  /** A tap went down on the pad (only while it is the Tap pad). */
  press(): void;
  /** The tap came up, left the pad or was cancelled. */
  release(): void;
  /** The pad has just become Start. */
  toStart(): void;
  /** Whether a click on Start should start a run. False once if a tap was held as it appeared. */
  allowClick(): boolean;
  /** Forget a pending swallow (call shortly after a release). */
  settle(): void;
}

export function createPadGuard(): PadGuard {
  let held = false;
  let swallow = false;
  return {
    press() {
      held = true;
    },
    release() {
      held = false;
    },
    toStart() {
      if (
        held
      )
        swallow = true;
    },
    allowClick() {
      if (
        !swallow
      )
        return true;
      swallow = false;
      return false;
    },
    settle() {
      swallow = false;
    },
  };
}
