/**
 * A run-finished hook for the solo modes, living outside React.
 *
 * ## Why this is not a `useEffect`
 *
 * `MainMenu` — and therefore every panel inside it — is rendered only while
 * `status === 'MENU'`. Starting a run flips the status, `MainMenu` unmounts, and
 * whatever effect was watching for the end of that run unmounts with it. A
 * panel cannot observe the end of the run it started.
 *
 * The engine and the Zustand store both outlive that unmount, so the observer
 * lives with them: a module-level subscription that watches for the
 * `PLAYING → FINISHED` transition and calls whoever armed it, reading the final
 * tally straight off the engine's `getRunStats()` rather than off store fields
 * that are reset between runs.
 *
 * One armed handler at a time, cleared as soon as it fires — a daily attempt and
 * a setlist advance are mutually exclusive by construction (you are in one mode
 * or the other), and "last one wins" is the behaviour you want if a stale panel
 * ever managed to arm twice.
 */

import { useSliceItStore } from '@/lib/slice-it/store';
import type { GameEngine } from '@/lib/slice-it/engine';
import type { RunStats } from '@/lib/slice-it/types';

type FinishHandler = (stats: RunStats) => void;

let armed: { engine: GameEngine; handler: FinishHandler } | null = null;
let installed = false;

/**
 * Install the store subscription. Idempotent, and deliberately never torn down:
 * it is one listener for the lifetime of the tab, and unsubscribing on the last
 * disarm would mean re-subscribing on the next arm — a race with the very
 * transition it exists to catch.
 */
function install(): void {
  if (installed) return;
  installed = true;
  useSliceItStore.subscribe((state, prev) => {
    if (prev.status !== 'PLAYING' || state.status !== 'FINISHED') return;
    const current = armed;
    if (!current) return;
    // Disarm BEFORE calling out, so a handler that throws cannot leave a live
    // arm behind to fire again on the next run.
    armed = null;
    try {
      current.handler(current.engine.getRunStats());
    } catch (err) {
      console.error('[slice-it] run-finish handler failed', err);
    }
  });
}

/** Call `handler` with the run tally the next time a run ends. */
export function armRunFinish(engine: GameEngine, handler: FinishHandler): void {
  install();
  armed = { engine, handler };
}

/** Cancel a pending arm — e.g. the player backed out of a mode. */
export function disarmRunFinish(): void {
  armed = null;
}

/** Is a mode currently waiting on a run to end? */
export function isRunArmed(): boolean {
  return armed !== null;
}
