'use client';

import { create } from 'zustand';
import type { TablePhase, PlayerSeatClient, RoundResultEntry, HandResult, RoomListEntry, RoomInfo } from './types';
import type { Card } from './logic';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ViewMode = 'lobby' | 'room';

interface BlackjackStore {
  connectionStatus: ConnectionStatus;
  viewMode: ViewMode;

  // Lobby
  roomList: RoomListEntry[];

  // Current room
  roomInfo: RoomInfo | null;
  tablePhase: TablePhase;
  roundNumber: number;
  players: PlayerSeatClient[];
  dealerHand: Card[];
  dealerValue: number | null;
  currentTurnUserId: string | null;
  bettingCountdown: number | null;
  turnTimeout: number | null;
  myUserId: string | null;
  lastRoundResults: RoundResultEntry[] | null;
  error: string | null;

  // Insurance
  insuranceOffered: boolean;
  insuranceTimeout: number | null;

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
    dealerHand: Card[];
    dealerValue: number | null;
    currentTurnUserId: string | null;
    bettingCountdown: number | null;
    turnTimeout: number | null;
  }) => void;
  handlePlayerJoined: (data: { userId: string; userName: string; avatarUrl: string | null; seatIndex: number }) => void;
  handlePlayerLeft: (data: { userId: string; seatIndex: number }) => void;
  handleBettingPhase: (data: { countdown: number; roundNumber: number }) => void;
  handleTurn: (data: { userId: string; timeoutSeconds: number }) => void;
  handleCardDealt: (data: { target: string; userId?: string; card: Card; handValue: number }) => void;
  handleDealerReveal: (data: { dealerHand: Card[]; dealerValue: number }) => void;
  handleRoundResults: (data: { results: RoundResultEntry[]; dealerValue: number }) => void;
  handleInsuranceOffer: (data: { timeoutSeconds: number }) => void;
  handleInsuranceResolved: () => void;
  setError: (msg: string | null) => void;
  setBettingCountdown: (n: number | null) => void;
  reset: () => void;
}

const defaultSessionStats = { totalBet: 0, totalWon: 0, handsPlayed: 0, handsWon: 0, blackjacks: 0 };

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
  viewMode: 'lobby' as ViewMode,
  roomList: [] as RoomListEntry[],
  roomInfo: null as RoomInfo | null,
  tablePhase: 'idle' as TablePhase,
  roundNumber: 0,
  players: [] as PlayerSeatClient[],
  dealerHand: [] as Card[],
  dealerValue: null as number | null,
  currentTurnUserId: null as string | null,
  bettingCountdown: null as number | null,
  turnTimeout: null as number | null,
  myUserId: null as string | null,
  lastRoundResults: null as RoundResultEntry[] | null,
  error: null as string | null,
  insuranceOffered: false,
  insuranceTimeout: null as number | null,
};

export const useBlackjackStore = create<BlackjackStore>((set) => ({
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
    dealerHand: [],
    dealerValue: null,
    currentTurnUserId: null,
    bettingCountdown: null,
    turnTimeout: null,
    lastRoundResults: null,
    insuranceOffered: false,
    insuranceTimeout: null,
  }),
  setRoomUpdated: (data) => set((s) => ({
    roomInfo: s.roomInfo ? { ...s.roomInfo, ...data } : null,
  })),

  setTableState: (state) =>
    set({
      tablePhase: state.phase,
      roundNumber: state.roundNumber,
      players: state.players,
      dealerHand: state.dealerHand,
      dealerValue: state.dealerValue,
      currentTurnUserId: state.currentTurnUserId,
      bettingCountdown: state.bettingCountdown,
      turnTimeout: state.turnTimeout,
      lastRoundResults: null,
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
            hand: [],
            bet: 0,
            status: 'waiting',
            handValue: null,
            result: null as HandResult,
            payout: 0,
            insuranceBet: 0,
            insuranceResult: null,
            sessionStats: { ...defaultSessionStats },
            hasSplit: false,
            activeSplitIndex: -1,
            splitHands: [],
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
      lastRoundResults: null,
      dealerHand: [],
      dealerValue: null,
      currentTurnUserId: null,
      insuranceOffered: false,
      insuranceTimeout: null,
    }),

  handleTurn: (data) =>
    set({
      currentTurnUserId: data.userId,
      turnTimeout: data.timeoutSeconds,
    }),

  handleCardDealt: (data) =>
    set((s) => {
      if (data.target === 'dealer') {
        return { dealerHand: [...s.dealerHand, data.card] };
      }
      return {
        players: s.players.map((p) =>
          p.userId === data.userId
            ? { ...p, hand: [...p.hand, data.card], handValue: data.handValue }
            : p
        ),
      };
    }),

  handleDealerReveal: (data) =>
    set({
      dealerHand: data.dealerHand,
      dealerValue: data.dealerValue,
      tablePhase: 'dealer_turn',
    }),

  handleRoundResults: (data) =>
    set({
      tablePhase: 'results',
      lastRoundResults: data.results,
      dealerValue: data.dealerValue,
    }),

  handleInsuranceOffer: (data) =>
    set({
      tablePhase: 'insurance',
      insuranceOffered: true,
      insuranceTimeout: data.timeoutSeconds,
    }),

  handleInsuranceResolved: () =>
    set({
      insuranceOffered: false,
      insuranceTimeout: null,
    }),

  setError: (error) => set({ error }),
  setBettingCountdown: (bettingCountdown) => set({ bettingCountdown }),

  reset: () => set(initialState),
}));
