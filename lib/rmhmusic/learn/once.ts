/**
 * A synchronous one-shot latch. React state set from an input event is not
 * visible to the next event in the same tick (a MIDI chord, two sources at
 * once), so "only the first note completes the lesson" needs a plain flag that
 * flips the moment it is read. Pure and client-safe.
 */
export interface OnceGuard {
  /** True for the first call after creation or `reset()`; false afterwards. */
  claim(): boolean;
  claimed(): boolean;
  /** Re-arm deliberately (e.g. Retry after a failed save). */
  reset(): void;
}

export function createOnceGuard(): OnceGuard {
  let taken = false;
  return {
    claim() {
      if (taken) return false;
      taken = true;
      return true;
    },
    claimed: () => taken,
    reset() {
      taken = false;
    },
  };
}
