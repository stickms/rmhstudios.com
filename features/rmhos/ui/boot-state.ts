/**
 * What the boot screen says and offers, as pure functions of the machine's state, so the rules
 * are testable without rendering. BootScreen.tsx maps each logical key to a literal t() call.
 */
import { TRY_AGAIN_AFTER_MS } from '../engine/boot-watchdog';
import type { BootFailureReason, VmPhaseDetail } from '../engine/vm-types';
import type { RmhosFailure, RmhosPhase } from './useRmhosSession';

export type FailureKey =
  | 'corrupt'
  | 'locked'
  | 'handshake'
  | 'signed-out'
  | 'image-missing'
  | 'image-invalid'
  | 'network'
  | 'stalled'
  | 'boot-timeout'
  | 'load';

/** The sentence for a failed boot. The failure kind wins; for a load failure the reason refines it. */
export function failureKey(failure: RmhosFailure | null, detail: VmPhaseDetail | undefined): FailureKey {
  if (failure === 'corrupt' || failure === 'locked' || failure === 'handshake') return failure;
  const reason: BootFailureReason | undefined =
    detail && 'reason' in detail ? detail.reason : undefined;
  switch (reason) {
    case 'image-missing':
    case 'image-invalid':
    case 'network':
    case 'stalled':
    case 'boot-timeout':
      return reason;
    default:
      return 'load';
  }
}

/** "Try again" while the machine is still downloading, starting or signing in: only once it has taken a while. */
export function tryAgainVisible(phase: RmhosPhase, elapsedMs: number): boolean {
  return (phase === 'downloading' || phase === 'booting' || phase === 'session') && elapsedMs >= TRY_AGAIN_AFTER_MS;
}

/** Progress is announced to assistive technology at phase changes and every 25 %, not every percent. */
export function announcedProgress(progress: number | null): number | null {
  return progress === null ? null : Math.floor(progress * 4) * 25;
}
