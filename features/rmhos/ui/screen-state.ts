/**
 * Whether the guest screen takes focus and keys. Only a running machine with its desktop up does;
 * under a boot, failure or signed-out overlay the screen is inert, so Tab walks the overlay's
 * buttons instead of landing on a canvas that swallows the keyboard (v86 listens on `window` and
 * prevents Tab while the screen has focus).
 */
import type { RmhosPhase } from './useRmhosSession';

export function screenInteractive(input: {
  phase: RmhosPhase;
  desktopReady: boolean;
  /** A boot, failure or signed-out panel is over the screen. */
  overlay: boolean;
}): boolean {
  return (
    input.phase ===
      'running' &&
    input.desktopReady &&
    !input.overlay
  );
}
