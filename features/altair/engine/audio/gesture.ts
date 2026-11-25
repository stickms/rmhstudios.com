// =============================================================================
// ALTAIR -- first-gesture gate for audio
// =============================================================================
// A Howl creates the page's AudioContext when it is constructed, and a context created before any pointer or key
// event makes Chrome log an autoplay warning. So nothing in the music or sfx managers builds a Howl until the first
// gesture. `whenGesture` runs a callback at once after a gesture, or on the first one; the listeners are installed on
// the first call (never at import) and removed on the first gesture.
// =============================================================================

const EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

let heard = false;
let installed = false;
const waiting = new Set<() => void>();

function onGesture(): void {
  markGesture();
}

function install(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  for (const name of EVENTS) {
    // Passive: this never cancels the gesture, and a non-passive capture touchstart on `document` delays scrolling.
    document.addEventListener(name, onGesture, { capture: true, passive: true });
  }
}

function uninstall(): void {
  if (!installed || typeof document === 'undefined') return;
  installed = false;
  for (const name of EVENTS) document.removeEventListener(name, onGesture, { capture: true });
}

/** Whether the member has pressed, touched or typed on the page yet. */
export function hasGesture(): boolean {
  return heard;
}

/** Record a gesture (the first one releases everything waiting). Also called by the sfx unlock, which is gesture-fed. */
export function markGesture(): void {
  if (heard) return;
  heard = true;
  uninstall();
  const run = [...waiting];
  waiting.clear();
  for (const cb of run) cb();
}

/** Run `cb` after the first gesture: now if there already was one. Returns a function that cancels the wait. */
export function whenGesture(cb: () => void): () => void {
  if (heard) {
    cb();
    return () => {};
  }
  waiting.add(cb);
  install();
  return () => {
    waiting.delete(cb);
  };
}

/** Test seam: back to "no gesture yet". */
export function resetGestureForTests(): void {
  uninstall();
  heard = false;
  waiting.clear();
}
