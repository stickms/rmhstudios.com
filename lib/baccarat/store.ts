'use client';

import { create } from 'zustand';
import type { TablePhase, PlayerSeatClient, RoomListEntry, RoomInfo, CardRevealPayload, RoundResultPayload, PlayerBets } from './types';
import type { Card, BaccaratResult } from './logic';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ViewMode = 'lobby' | 'room';

const emptyBets: PlayerBets = { player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0, playerDragon: 0, bankerDragon: 0 };

interface BaccaratStore {
  connectionStatus: ConnectionStatus;
  viewMode: ViewMode;

  // Lobby
  roomList: RoomListEntry[];

  // Current room
  roomInfo: RoomInfo | null;
  tablePhase: TablePhase;
  roundNumber: number;
  players: PlayerSeatClient[];
  playerHand: Card[];
  bankerHand: Card[];
  bettingCountdown: number | null;
  myUserId: string | null;
  error: string | null;

  // History for scoreboard/road
  history: BaccaratResult[];

  // Last round result
  lastResult: RoundResultPayload | null;

  // Card reveal animation queue
  revealQueue: CardRevealPayload[];

  setConnectionStatus: (s: ConnectionStatus) => void;
  setMyUserId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;

  // Lobby actions
  setRoomList: (rooms: RoomListEntry[]) => void;

  // Room actions
  setRoomJoined: (info: RoomInfo) => void;
  setRoomLeft: () => void;
  setRoomUpdated: (data: Partial<RoomInfo>) => void;

  // Table state
  setTableState: (state: {
    phase: TablePhase;
    roundNumber: number;
    players: PlayerSeatClient[];
    playerHand: Card[];
    bankerHand: Card[];
    bettingCountdown: number | null;
    history: BaccaratResult[];
  }) => void;
  handlePlayerJoined: (data: { userId: string; userName: string; avatarUrl: string | null; seatIndex: number }) => void;
  handlePlayerLeft: (data: { userId: string }) => void;
  handleBettingPhase: (data: { countdown: number; roundNumber: number }) => void;
  handleCardReveal: (data: CardRevealPayload) => void;
  handleRoundResult: (data: RoundResultPayload) => void;
  popReveal: () => CardRevealPayload | undefined;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
  viewMode: 'lobby' as ViewMode,
  roomList: [] as RoomListEntry[],
  roomInfo: null as RoomInfo | null,
  tablePhase: 'idle' as TablePhase,
  roundNumber: 0,
  players: [] as PlayerSeatClient[],
  playerHand: [] as Card[],
  bankerHand: [] as Card[],
  bettingCountdown: null as number | null,
  myUserId: null as string | null,
  error: null as string | null,
  history: [] as BaccaratResult[],
  lastResult: null as RoundResultPayload | null,
  revealQueue: [] as CardRevealPayload[],
};

export const useBaccaratStore = create<BaccaratStore>((set, get) => ({
  ...initialState,

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setMyUserId: (myUserId) => set({ myUserId }),
  setViewMode: (viewMode) => set({ viewMode }),

  // Lobby
  setRoomList: (roomList) => set({ roomList }),

  // Room
  setRoomJoined: (roomInfo) => set({ roomInfo, viewMode: 'room' }),
  setRoomLeft: () => set({
    roomInfo: null,
    viewMode: 'lobby',
    tablePhase: 'idle',
    players: [],
    playerHand: [],
    bankerHand: [],
    bettingCountdown: null,
    lastResult: null,
    revealQueue: [],
  }),
  setRoomUpdated: (data) => set((s) => ({
    roomInfo: s.roomInfo ? { ...s.roomInfo, ...data } : null,
  })),

  setTableState: (state) =>
    set({
      tablePhase: state.phase,
      roundNumber: state.roundNumber,
      players: state.players,
      playerHand: state.playerHand,
      bankerHand: state.bankerHand,
      bettingCountdown: state.bettingCountdown,
      history: state.history,
    }),

  handlePlayerJoined: (data) =>
    set((s) => {
      if (s.players.some((p) => p.userId === data.userId)) return s;
      return {
        players: [
          ...s.players,
          {
            userId: data.userId,
            userName: data.userName,
            avatarUrl: data.avatarUrl,
            seatIndex: data.seatIndex,
            bets: { ...emptyBets },
            totalBetThisRound: 0,
            lastPayout: 0,
            sessionStats: { totalBet: 0, totalWon: 0, roundsPlayed: 0 },
          },
        ],
      };
    }),

  handlePlayerLeft: (data) =>
    set((s) => ({
      players: s.players.filter((p) => p.userId !== data.userId),
    })),

  handleBettingPhase: (data) =>
    set({
      tablePhase: 'betting',
      roundNumber: data.roundNumber,
      bettingCountdown: data.countdown,
      playerHand: [],
      bankerHand: [],
      lastResult: null,
      revealQueue: [],
    }),

  handleCardReveal: (data) =>
    set((s) => ({
      revealQueue: [...s.revealQueue, data],
      tablePhase: data.cardIndex <= 1 ? 'dealing' : 'drawing',
      playerHand: data.target === 'player' ? [...s.playerHand, data.card] : s.playerHand,
      bankerHand: data.target === 'banker' ? [...s.bankerHand, data.card] : s.bankerHand,
    })),

  popReveal: () => {
    const state = get();
    if (state.revealQueue.length === 0) return undefined;
    const [first, ...rest] = state.revealQueue;
    set({ revealQueue: rest });
    return first;
  },

  handleRoundResult: (data) =>
    set((s) => ({
      tablePhase: 'results',
      lastResult: data,
      playerHand: data.playerHand,
      bankerHand: data.bankerHand,
      history: [...s.history, data.result],
    })),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
