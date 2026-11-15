/**
 * What the toolbar shows, as a pure function of the machine's state, so the labels are testable
 * without rendering. The keys are logical names; Toolbar.tsx maps each to a literal t() call.
 */
import type { SaveResult } from '../engine/home-sync';
import type { VmPhase } from '../engine/vm-types';

export type NetState = 'off' | 'connecting' | 'on' | 'error';

export interface ToolbarInput {
  phase: VmPhase;
  /** The guest's RESTORE has succeeded. Saving earlier could overwrite the stored home with an empty one. */
  desktopReady: boolean;
  lastSave: SaveResult | null;
  saving: boolean;
  /** The guest was used since the last good save. */
  dirty: boolean;
  net: NetState;
}

export interface ToolbarState {
  saveLabelKey: string;
  saveDisabled: boolean;
  netLabelKey: string;
  showRestart: boolean;
  showBackup: boolean;
}

const NET_KEYS: Record<NetState, string> = {
  off: 'net.off',
  connecting: 'net.connecting',
  on: 'net.online',
  error: 'net.unavailable',
};

export function toolbarState(input: ToolbarInput): ToolbarState {
  const { phase, desktopReady, lastSave, saving, dirty, net } = input;
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
    showRestart: live || phase === 'failed',
    showBackup: live,
  };
}
