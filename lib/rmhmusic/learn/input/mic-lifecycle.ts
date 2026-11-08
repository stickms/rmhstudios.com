/**
 * The microphone never outlives the screen that opened it. Every mic start in
 * the learn UI goes through `startMic`, which remembers a start still waiting
 * on its permission prompt, and every screen that can start it binds
 * `bindMicRelease`, which stops it when the page is hidden, on `pagehide`, and
 * when the screen unmounts. Nothing here restarts the mic (the learner does,
 * with a click) or touches the saved input preference: these are automatic
 * stops of the device, not a change of choice.
 *
 * Pure over the `InputHub` interface and two event targets, so it is tested
 * with fakes; the hooks pass the real `document` and `window`.
 */
import type { InputHub } from './hub';

/** Mic starts still in flight, per hub (a start waiting on the permission prompt). */
const pending = new WeakMap<InputHub, number>();

/** Start the hub's mic, tracking the start until it settles. Rejects as `hub.start` does. */
export async function startMic(hub: InputHub): Promise<void> {
  pending.set(hub, (pending.get(hub) ?? 0) + 1);
  try {
    await hub.start('mic');
  } finally {
    pending.set(hub, (pending.get(hub) ?? 1) - 1);
  }
}

/** True while the mic is running or a start of it is pending. */
export function micInUse(hub: InputHub): boolean {
  return (pending.get(hub) ?? 0) > 0 || hub.active().includes('mic');
}

/** Stop the mic if it is running or starting; returns whether it did. Never touches other sources. */
export function releaseMic(hub: InputHub): boolean {
  if (!micInUse(hub)) return false;
  hub.stop('mic');
  return true;
}

export interface MicReleaseEnv {
  hub: InputHub;
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  win: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Called after an automatic stop, so the UI can re-read `hub.active()`. */
  onRelease?: () => void;
}

/**
 * Stop the mic when the page is hidden or unloaded. Returns the unbind
 * function, which also stops the mic: call it when the screen unmounts.
 */
export function bindMicRelease({ hub, doc, win, onRelease }: MicReleaseEnv): () => void {
  const release = () => {
    if (releaseMic(hub)) onRelease?.();
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') release();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', release);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', release);
    releaseMic(hub);
  };
}
