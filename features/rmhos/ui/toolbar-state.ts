/**
 * What the toolbar shows, as a pure function of the machine's state, so the labels are testable
 * without rendering. The keys are logical names; Toolbar.tsx maps each to a literal t() call.
 */
import type { SaveResult } from '../engine/home-sync';
import type { RmhosSession } from '../engine/rmhos.contract';
import type { VmPhase } from '../engine/vm-types';
import type { PolledNet } from './net-status';

export type NetState = 'off' | 'not-eligible' | 'connecting' | 'on' | 'error' | 'full';

/**
 * The toolbar's network state from the session's `net` and the status poll. A disabled `net`
 * carries `reason: 'not-eligible'` when this account is not allowed networking; no reason is
 * plain "off". While the hub is down `net` still says `enabled: true` and the poll then says
 * `error`: that is the "unavailable" state.
 */
export function netStateOf(net: RmhosSession['net'] | null, polled: PolledNet): NetState {
  if (!net) return 'off';
  if (net.enabled) return polled;
  return net.reason === 'not-eligible' ? 'not-eligible' : 'off';
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
  /** Restore backup: with a machine the guest gets it on restart; with none it goes into the store. */
  showRestore: boolean;
}

const NET_KEYS: Record<NetState, string> = {
  off: 'net.off',
  'not-eligible': 'net.notEligible',
  connecting: 'net.connecting',
  on: 'net.online',
  error: 'net.unavailable',
  full: 'net.full',
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
