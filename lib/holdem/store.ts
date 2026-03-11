'use client';

import { create } from 'zustand';
import type { TablePhase, PlayerSeatClient, HandResultEntry, RoomListEntry, RoomInfo } from './types';
import type { Card } from './logic';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ViewMode = 'lobby' | 'room';

interface HoldemStore {
  connectionStatus: ConnectionStatus;
  viewMode: ViewMode;

  // Lobby
  roomList: RoomListEntry[];

  // Room
  roomInfo: RoomInfo | null;
  phase: TablePhase;
  handNumber: number;
  players: PlayerSeatClient[];
  communityCards: Card[];
  pot: number;
  sidePots: { amount: number; eligible: string[] }[];
  currentTurnUserId: string | null;
  currentBet: number;
  minRaise: number;
  turnTimeout: number | null;
  myUserId: string | null;
  lastHandResults: HandResultEntry[] | null;
  error: string | null;

  setConnectionStatus: (s: ConnectionStatus) => void;
  setMyUserId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setRoomList: (rooms: RoomListEntry[]) => void;
  setRoomJoined: (info: RoomInfo) => void;
  setRoomLeft: () => void;
  setRoomUpdated: (data: Partial<RoomInfo>) => void;
  setTableState: (state: any) => void;
  handlePlayerJoined: (data: { userId: string; userName: string; avatarUrl: string | null; seatIndex: number }) => void;
  handlePlayerLeft: (data: { userId: string }) => void;
  handleNewHand: (data: { handNumber: number }) => void;
  handleTurn: (data: { userId: string; timeoutSeconds: number }) => void;
  handleCommunityCards: (data: { communityCards: Card[]; phase: TablePhase }) => void;
  handleHandResult: (data: { results: HandResultEntry[]; pot: number }) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
  viewMode: 'lobby' as ViewMode,
  roomList: [] as RoomListEntry[],
  roomInfo: null as RoomInfo | null,
  phase: 'waiting' as TablePhase,
  handNumber: 0,
  players: [] as PlayerSeatClient[],
  communityCards: [] as Card[],
  pot: 0,
  sidePots: [] as { amount: number; eligible: string[] }[],
  currentTurnUserId: null as string | null,
  currentBet: 0,
  minRaise: 0,
  turnTimeout: null as number | null,
  myUserId: null as string | null,
  lastHandResults: null as HandResultEntry[] | null,
  error: null as string | null,
};

export const useHoldemStore = create<HoldemStore>((set) => ({
  ...initialState,

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setMyUserId: (myUserId) => set({ myUserId }),
  setViewMode: (viewMode) => set({ viewMode }),
  setRoomList: (roomList) => set({ roomList }),

  setRoomJoined: (roomInfo) => set({ roomInfo, viewMode: 'room' }),
  setRoomLeft: () => set({
    roomInfo: null,
    viewMode: 'lobby',
    phase: 'waiting',
    players: [],
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentTurnUserId: null,
    lastHandResults: null,
  }),
  setRoomUpdated: (data) => set((s) => ({
    roomInfo: s.roomInfo ? { ...s.roomInfo, ...data } : null,
  })),

  setTableState: (state) =>
    set({
      phase: state.phase,
      handNumber: state.handNumber,
      players: state.players,
      communityCards: state.communityCards,
      pot: state.pot,
      sidePots: state.sidePots,
      currentTurnUserId: state.currentTurnUserId,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      turnTimeout: state.turnTimeout,
    }),

  handlePlayerJoined: (data) =>
    set((s) => {
      if (s.players.some((p) => p.userId === data.userId)) return s;
      return {
        players: [...s.players, {
          userId: data.userId,
          userName: data.userName,
          avatarUrl: data.avatarUrl,
          seatIndex: data.seatIndex,
          holeCards: null,
          currentBet: 0,
          totalChips: 0,
          folded: false,
          allIn: false,
          lastAction: null,
          isDealer: false,
          isSmallBlind: false,
          isBigBlind: false,
          sessionStats: { totalBuyIn: 0, totalCashOut: 0, handsPlayed: 0, handsWon: 0, biggestPot: 0 },
        }],
      };
    }),

  handlePlayerLeft: (data) =>
    set((s) => ({
      players: s.players.filter((p) => p.userId !== data.userId),
    })),

  handleNewHand: (data) =>
    set({
      handNumber: data.handNumber,
      communityCards: [],
      pot: 0,
      sidePots: [],
      lastHandResults: null,
    }),

  handleTurn: (data) =>
    set({
      currentTurnUserId: data.userId,
      turnTimeout: data.timeoutSeconds,
    }),

  handleCommunityCards: (data) =>
    set({
      communityCards: data.communityCards,
      phase: data.phase,
    }),

  handleHandResult: (data) =>
    set({
      phase: 'results',
      lastHandResults: data.results,
    }),

  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));
