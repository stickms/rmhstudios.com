/**
 * Gabriel's Horn — UI store.
 *
 * Thin by design. Almost nothing here is derived: the server sends a complete
 * {@link GameView} for this seat on every change, so the store's job is to hold
 * the latest one and the handful of things that are genuinely local — which
 * screen you are on, which card you have picked up, whether the rules sheet is
 * open.
 *
 * In particular there is **no client-side copy of the table**. Reconstructing
 * one would mean deciding locally what this player may see, and that decision
 * belongs on the server (see `net/events.ts`).
 */

import { create } from 'zustand';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import type {
  ChatMessage,
  GameResults,
  GameView,
  LobbySnapshot,
  PublicLobbyInfo,
} from './net/events';

export type Screen = 'menu' | 'browse' | 'lobby' | 'table' | 'results';

interface HornStore {
  screen: Screen;
  connection: RealtimeStatus;

  lobby: LobbySnapshot | null;
  publicLobbies: PublicLobbyInfo[];
  browsing: boolean;
  selfSocketId: string | null;

  countdown: number | null;
  view: GameView | null;
  results: GameResults | null;
  chat: ChatMessage[];

  /** The card the player has picked up but not yet committed. Local only. */
  selectedCardId: string | null;
  rulesOpen: boolean;

  /** Last recoverable server message, surfaced inline rather than as a toast. */
  error: string | null;

  setScreen: (screen: Screen) => void;
  setConnection: (connection: RealtimeStatus) => void;
  setLobby: (lobby: LobbySnapshot | null) => void;
  setPublicLobbies: (lobbies: PublicLobbyInfo[]) => void;
  setBrowsing: (browsing: boolean) => void;
  setSelfSocketId: (id: string | null) => void;
  setCountdown: (seconds: number | null) => void;
  setView: (view: GameView | null) => void;
  setResults: (results: GameResults | null) => void;
  addChat: (message: ChatMessage) => void;
  clearChat: () => void;
  selectCard: (cardId: string | null) => void;
  setRulesOpen: (open: boolean) => void;
  setError: (message: string | null) => void;
  /** Back to the menu, keeping the connection. */
  leaveTable: () => void;
  reset: () => void;
}

const INITIAL = {
  screen: 'menu' as Screen,
  connection: 'idle' as RealtimeStatus,
  lobby: null,
  publicLobbies: [],
  browsing: false,
  selfSocketId: null,
  countdown: null,
  view: null,
  results: null,
  chat: [],
  selectedCardId: null,
  rulesOpen: false,
  error: null,
};

export const useHornStore = create<HornStore>((set) => ({
  ...INITIAL,

  setScreen: (screen) => set({ screen }),
  setConnection: (connection) => set({ connection }),
  setLobby: (lobby) => set({ lobby }),
  setPublicLobbies: (publicLobbies) => set({ publicLobbies, browsing: false }),
  setBrowsing: (browsing) => set({ browsing }),
  setSelfSocketId: (selfSocketId) => set({ selfSocketId }),
  setCountdown: (countdown) => set({ countdown }),
  setView: (view) =>
    set((state) => ({
      view,
      // A card that left the hand (played, or swapped away by somebody's seven)
      // must not stay selected, or the next click sends a card id the server
      // will refuse.
      selectedCardId:
        state.selectedCardId && view?.hand.some((card) => card.id === state.selectedCardId)
          ? state.selectedCardId
          : null,
    })),
  setResults: (results) => set({ results }),
  // Deduped by id: the seat is sent the tail of the room's history on join, and
  // a reconnect replays it.
  addChat: (message) =>
    set((state) =>
      state.chat.some((existing) => existing.id === message.id)
        ? {}
        : { chat: [...state.chat, message].slice(-60) },
    ),
  clearChat: () => set({ chat: [] }),
  selectCard: (selectedCardId) => set({ selectedCardId }),
  setRulesOpen: (rulesOpen) => set({ rulesOpen }),
  setError: (error) => set({ error }),

  leaveTable: () =>
    set({
      screen: 'menu',
      lobby: null,
      countdown: null,
      view: null,
      results: null,
      chat: [],
      selectedCardId: null,
      error: null,
    }),

  reset: () => set({ ...INITIAL }),
}));
