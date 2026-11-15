/**
 * What the toolbar shows, as a pure function of the machine's state, so the labels are testable
 * without rendering. The keys are logical names; Toolbar.tsx maps each to a literal t() call.
 */
import type { SaveResult } from '../engine/home-sync';
import type { VmPhase } from '../engine/vm-types';

export type NetState = 'off' | 'not-eligible' | 'connecting' | 'on' | 'error';

/**
 * The toolbar's network state from the session's `net` and the status poll. `reason` is optional
 * on a disabled `net` (the server may say `not-eligible`: this account is not allowed networking),
 * so it is read defensively: an unknown or absent reason is plain "off".
 */
export function netStateOf(
  net: unknown,
  polled: 'connecting' | 'on' | 'error',
): NetState {
  if (!net || typeof net !== 'object') return 'off';
  if ((net as { enabled?: unknown }).enabled === true) return polled;
  return 'reason' in net && (net as { reason?: unknown }).reason === 'not-eligible'
    ? 'not-eligible'
    : 'off';
}

export interface ToolbarInput {
  phase: VmPhase;
  /** The guest's RESTORE has succeeded. Saving earlier could overwrite the stored home with an empty one. */
  desktopReady: boolean;
  lastSave: SaveResult | null;
  saving: boolean;
  /** The guest was used since the last good save. */
  dirty: boolean;
  net: NetState;
  /** The session ended and no machine is left: nothing here applies any more. */
  signedOut?: boolean;
}

export interface ToolbarState {
  saveLabelKey: string;
  saveDisabled: boolean;
  netLabelKey: string;
  showRestart: boolean;
  /** Download backup: available in every phase (it reads the stored copy when no machine runs). */
  showBackup: boolean;
  /** Restore backup needs a machine to hand the files to. */
  showRestore: boolean;
}

const NET_KEYS: Record<NetState, string> = {
  off: 'net.off',
  'not-eligible': 'net.notEligible',
  connecting: 'net.connecting',
  on: 'net.online',
  error: 'net.unavailable',
};

export function toolbarState(input: ToolbarInput): ToolbarState {
  const { phase, desktopReady, lastSave, saving, dirty, net } = input;
  const signedOut = input.signedOut === true;
  let saveLabelKey = 'save.saved';
  if (saving) saveLabelKey = 'save.saving';
  else if (lastSave?.status === 'storage-full') saveLabelKey = 'save.storageFull';
  else if (lastSave?.status === 'failed') saveLabelKey = 'save.failed';
  else if (dirty) saveLabelKey = 'save.unsaved';
  const live = phase === 'running' || phase === 'stopped';
  return {
    saveLabelKey,
    saveDisabled: !desktopReady || saving || phase !== 'running',
    netLabelKey: NET_KEYS[net],
    showRestart: !signedOut && (live || phase === 'failed'),
    // The stored archive is read from the browser's store, so downloading it needs no machine.
    showBackup: !signedOut,
    showRestore: !signedOut && live,
  };
}
