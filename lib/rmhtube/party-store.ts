/** Client state for the watch-party extras (P20). Fed by the hub's PARTY_STATE and the party API. */
import { create } from 'zustand';
import { useRmhTubeStore } from './store';
import { extrapolate } from './sync-math';
import { getServerNow } from './clock';
import { toast } from './toast-store';
import type { CommentaryLine, PartyState } from './party';

export interface TimedComment {
  id: string;
  atSec: number;
  body: string;
  author: string;
  mine: boolean;
}
export interface LoadedTrack {
  id: string;
  url: string;
  title: string;
  author: string;
  lines: CommentaryLine[];
}

const SHOW_KEY = 'rmhtube:timed-comments';
function readShow(): boolean {
  try {
    return localStorage.getItem(SHOW_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface PartyStore {
  party: PartyState | null;
  showTimed: boolean;
  commentsUrl: string | null;
  comments: TimedComment[];
  track: LoadedTrack | null;
  setParty: (s: PartyState) => void;
  setShowTimed: (on: boolean) => void;
  setComments: (url: string, list: TimedComment[]) => void;
  setTrack: (t: LoadedTrack | null) => void;
  reset: () => void;
}

export const usePartyStore = create<PartyStore>((set, get) => ({
  party: null,
  showTimed: true,
  commentsUrl: null,
  comments: [],
  track: null,
  setParty: (s) => {
    const before = get().party?.bingo?.winner?.userId;
    const won = s.bingo?.winner;
    if (won && won.userId !== before) toast.success(`Bingo! ${won.name} wins.`);
    set({ party: s });
  },
  setShowTimed: (on) => {
    try {
      localStorage.setItem(SHOW_KEY, on ? 'on' : 'off');
    } catch {
      /* per-viewer convenience only */
    }
    set({ showTimed: on });
  },
  setComments: (url, list) => set({ commentsUrl: url, comments: list }),
  setTrack: (track) => set({ track }),
  reset: () => set({ party: null, commentsUrl: null, comments: [], track: null }),
}));

if (typeof window !== 'undefined') usePartyStore.setState({ showTimed: readShow() });

/** Where the room's playhead is right now, in seconds. */
export function roomPosition(): number {
  const vs = useRmhTubeStore.getState().room?.videoState;
  return vs ? Math.max(0, extrapolate(vs, getServerNow())) : 0;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(e?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}
