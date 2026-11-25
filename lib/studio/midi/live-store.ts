/**
 * The member's MIDI keyboard connection for recording. Nothing here runs until `enable()` is called from the
 * "Use a MIDI keyboard" button, so the browser never prompts on load.
 */
import { create } from 'zustand';
import {
  isMidiSupported,
  requestMidiAccess,
  type LiveMidiInput,
  type LiveMidiSession,
  type LiveNoteEvent,
} from './live-input';

export type LiveMidiStatus = 'off' | 'requesting' | 'ready' | 'denied' | 'unsupported';

interface LiveMidiState {
  status: LiveMidiStatus;
  inputs: LiveMidiInput[];
  enable: () => Promise<void>;
  disable: () => void;
}

let session: LiveMidiSession | null = null;
let stopWatching: (() => void) | null = null;

export const useLiveMidi = create<LiveMidiState>((set) => ({
  status: 'off',
  inputs: [],
  enable: async () => {
    if (session) return;
    if (!isMidiSupported()) {
      set({ status: 'unsupported' });
      return;
    }
    set({ status: 'requesting' });
    try {
      const s = await requestMidiAccess();
      session = s;
      stopWatching = s.onChange(() => set({ inputs: s.inputs() }));
      set({ status: 'ready', inputs: s.inputs() });
    } catch {
      set({ status: 'denied', inputs: [] });
    }
  },
  disable: () => {
    stopWatching?.();
    stopWatching = null;
    session?.close();
    session = null;
    set({ status: 'off', inputs: [] });
  },
}));

/** Listen to the named input (null stops listening). False when that input is not connected. */
export function selectLiveInput(name: string | null, onNote: (e: LiveNoteEvent, timeStamp: number) => void): boolean {
  return session ? session.select(name, onNote) : false;
}
