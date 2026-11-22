import { create } from 'zustand';
import type { JamLocks, JamPeer } from './shared';

/** Live-jam session state shown in the Studio UI (F13). Small on purpose: the sync engine is lazy-loaded. */
export interface JamState {
  status: 'off' | 'connecting' | 'live';
  code: string | null;
  hostUserId: string | null;
  myId: string | null;
  peers: JamPeer[];
  locks: JamLocks;
  /** Last tracks this member could not edit, shown briefly. */
  notice: string | null;
  set: (patch: Partial<Omit<JamState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const empty = {
  status: 'off' as const,
  code: null,
  hostUserId: null,
  myId: null,
  peers: [],
  locks: {},
  notice: null,
};

export const useJamStore = create<JamState>((set) => ({
  ...empty,
  set: (patch) => set(patch),
  reset: () => set(empty),
}));
