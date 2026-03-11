import type { Card, HandRank } from './logic';

export type TablePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'results';

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all_in' | null;

export interface PlayerSeatClient {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  seatIndex: number;
  holeCards: Card[] | null; // null = hidden (other players' cards)
  currentBet: number;
  totalChips: number; // chips at table
  folded: boolean;
  allIn: boolean;
  lastAction: PlayerAction;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  // Session stats
  sessionStats: SessionStats;
}

export interface SessionStats {
  totalBuyIn: number;
  totalCashOut: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
}

export interface TableStateSnapshot {
  roomId: string;
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
  smallBlind: number;
  bigBlind: number;
}

export interface HandResultEntry {
  userId: string;
  payout: number;
  handRank: HandRank | null;
  bestHand: Card[] | null;
  holeCards: Card[];
}

export interface RoomListEntry {
  roomId: string;
  name: string;
  ownerName: string;
  playerCount: number;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  inProgress: boolean;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  buyIn: number;
  privacy: 'public' | 'unlisted';
  joinCode: string;
}
