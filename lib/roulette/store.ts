'use client';

import { create } from 'zustand';
import type { TablePhase, PlayerSeatClient, RoomListEntry, RoomInfo, RoundResultPayload, PlayerBetClient } from './types';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ViewMode = 'lobby' | 'room';

interface RouletteStore {
  connectionStatus: ConnectionStatus;
  viewMode: ViewMode;

  // Lobby
  roomList: RoomListEntry[];

  // Current room
  roomInfo: RoomInfo | null;
  tablePhase: TablePhase;
  roundNumber: number;
  players: PlayerSeatClient[];
  bettingCountdown: number | null;
  myUserId: string | null;
  error: string | null;

  // Spin state
  spinResult: number | null;
  history: number[];
  lastRoundResult: RoundResultPayload | null;

  // Local bet staging (before submitting)
  stagedBets: PlayerBetClient[];

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
    bettingCountdown: number | null;
    lastResult: number | null;
    history: number[];
  }) => void;
  handlePlayerJoined: (data: { userId: string; userName: string; avatarUrl: string | null; seatIndex: number }) => void;
  handlePlayerLeft: (data: { userId: string }) => void;
  handleBettingPhase: (data: { countdown: number; roundNumber: number }) => void;
  handleSpinResult: (data: { result: number }) => void;
  handleRoundResult: (data: RoundResultPayload) => void;

  // Local bet staging
  addStagedBet: (bet: PlayerBetClient) => void;
  clearStagedBets: () => void;

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
  bettingCountdown: null as number | null,
  myUserId: null as string | null,
  error: null as string | null,
  spinResult: null as number | null,
  history: [] as number[],
  lastRoundResult: null as RoundResultPayload | null,
  stagedBets: [] as PlayerBetClient[],
};

export const useRouletteStore = create<RouletteStore>((set) => ({
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
    bettingCountdown: null,
    spinResult: null,
    lastRoundResult: null,
    stagedBets: [],
  }),
  setRoomUpdated: (data) => set((s) => ({
    roomInfo: s.roomInfo ? { ...s.roomInfo, ...data } : null,
  })),

  setTableState: (state) =>
    set({
      tablePhase: state.phase,
      roundNumber: state.roundNumber,
      players: state.players,
      bettingCountdown: state.bettingCountdown,
      spinResult: state.lastResult,
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
            bets: [],
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
      lastRoundResult: null,
      stagedBets: [],
    }),

  handleSpinResult: (data) =>
    set({
      tablePhase: 'spinning',
      spinResult: data.result,
    }),

  handleRoundResult: (data) =>
    set((s) => ({
      tablePhase: 'results',
      lastRoundResult: data,
      history: [...s.history, data.result],
    })),

  // Local bet staging
  addStagedBet: (bet) =>
    set((s) => ({ stagedBets: [...s.stagedBets, bet] })),
  clearStagedBets: () => set({ stagedBets: [] }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));
