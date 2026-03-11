'use client';

import { create } from 'zustand';
import type { TablePhase, PlayerSeatClient, RoundResultEntry, HandResult } from './types';
import type { Card } from './logic';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface BlackjackStore {
  connectionStatus: ConnectionStatus;
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

  setConnectionStatus: (s: ConnectionStatus) => void;
  setMyUserId: (id: string | null) => void;
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
  setError: (msg: string | null) => void;
  setBettingCountdown: (n: number | null) => void;
  reset: () => void;
}

const initialState = {
  connectionStatus: 'disconnected' as ConnectionStatus,
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
};

export const useBlackjackStore = create<BlackjackStore>((set) => ({
  ...initialState,

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setMyUserId: (myUserId) => set({ myUserId }),

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

  setError: (error) => set({ error }),
  setBettingCountdown: (bettingCountdown) => set({ bettingCountdown }),

  reset: () => set(initialState),
}));
