/**
 * The race's client state.
 *
 * One zustand store, written only by `lib/globeset/socket.ts` (which mirrors the
 * server's events into it) and read only by the lobby and race UI. Keeping the
 * writes in one place is what lets the UI treat every field as authoritative:
 * nothing in `components/` ever decides that a player is ready or that a race
 * has finished, it only renders what the hub said.
 *
 * The local board is kept here too, even though the client also runs its own
 * `RunState` for responsiveness: the server's `globeset:board` is the truth, and
 * having both in one store makes the reconciliation a single assignment rather
 * than a negotiation between two components.
 */

import { create } from 'zustand';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import type {
  BoardPayload,
  FinalStanding,
  LiveStanding,
  LobbySnapshot,
  PublicLobbyInfo,
  RaceStartPayload,
  RejectReason,
} from './net/events';

export interface GlobeSetRaceStore {
  status: RealtimeStatus;
  /** Our own socket id, as the hub reported it on join. Identifies us in standings. */
  selfId: string | null;
  lobby: LobbySnapshot | null;
  /** Public rooms from the last browse. */
  browse: PublicLobbyInfo[];
  browsing: boolean;
  /** Set when the countdown starts; carries the seed every client deals from. */
  start: RaceStartPayload | null;
  /** Our authoritative board, as the server last confirmed it. */
  board: BoardPayload | null;
  standings: LiveStanding[];
  results: FinalStanding[] | null;
  /** Most recent rejected submission, for the board's shake + message. */
  lastReject: { reason: RejectReason; at: number } | null;
  error: string | null;

  setStatus: (status: RealtimeStatus) => void;
  setSelfId: (id: string | null) => void;
  setLobby: (lobby: LobbySnapshot | null) => void;
  setBrowse: (lobbies: PublicLobbyInfo[]) => void;
  setBrowsing: (browsing: boolean) => void;
  setStart: (start: RaceStartPayload | null) => void;
  setBoard: (board: BoardPayload | null) => void;
  setStandings: (standings: LiveStanding[]) => void;
  setResults: (results: FinalStanding[] | null) => void;
  setReject: (reason: RejectReason) => void;
  clearReject: () => void;
  setError: (message: string | null) => void;
  /** Back to the lobby between rounds — keeps the room, drops the round. */
  resetRound: () => void;
  /** Left the room entirely. */
  reset: () => void;
}

const EMPTY_ROUND = {
  start: null,
  board: null,
  standings: [] as LiveStanding[],
  results: null,
  lastReject: null,
} as const;

export const useGlobeSetRaceStore = create<GlobeSetRaceStore>((set) => ({
  status: 'disconnected',
  selfId: null,
  lobby: null,
  browse: [],
  browsing: false,
  ...EMPTY_ROUND,
  error: null,

  setStatus: (status) => set({ status }),
  setSelfId: (selfId) => set({ selfId }),
  setLobby: (lobby) => set({ lobby }),
  setBrowse: (browse) => set({ browse, browsing: false }),
  setBrowsing: (browsing) => set({ browsing }),
  setStart: (start) => set({ start, results: null, lastReject: null }),
  setBoard: (board) => set({ board }),
  setStandings: (standings) => set({ standings }),
  setResults: (results) => set({ results }),
  setReject: (reason) => set({ lastReject: { reason, at: Date.now() } }),
  clearReject: () => set({ lastReject: null }),
  setError: (error) => set({ error }),
  resetRound: () => set({ ...EMPTY_ROUND }),
  reset: () =>
    set({
      selfId: null,
      lobby: null,
      browse: [],
      browsing: false,
      error: null,
      ...EMPTY_ROUND,
    }),
}));
