import type { Card, BaccaratResult } from './logic';

export type TablePhase =
  | 'idle'
  | 'betting'
  | 'dealing'    // cards being revealed one by one
  | 'drawing'    // third card draw phase
  | 'results';

export type BetType = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair' | 'playerDragon' | 'bankerDragon';

export interface PlayerBets {
  player: number;
  banker: number;
  tie: number;
  playerPair: number;
  bankerPair: number;
  playerDragon: number;
  bankerDragon: number;
}

export interface PlayerSeatClient {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  seatIndex: number;
  bets: PlayerBets;
  totalBetThisRound: number;
  lastPayout: number;
  sessionStats: SessionStats;
}

export interface SessionStats {
  totalBet: number;
  totalWon: number;
  roundsPlayed: number;
}

export interface TableStateSnapshot {
  tableId: string;
  phase: TablePhase;
  roundNumber: number;
  players: PlayerSeatClient[];
  playerHand: Card[];
  bankerHand: Card[];
  bettingCountdown: number | null;
  // Streak/road tracking
  history: BaccaratResult[];
}

export interface CardRevealPayload {
  target: 'player' | 'banker';
  card: Card;
  cardIndex: number; // 0=first, 1=second, 2=third
}

export interface RoundResultPayload {
  result: BaccaratResult;
  playerHand: Card[];
  bankerHand: Card[];
  playerValue: number;
  bankerValue: number;
  isNatural: boolean;
  sideBets: {
    playerPair: boolean;
    bankerPair: boolean;
    playerDragonBonus: number;
    bankerDragonBonus: number;
  };
}

// ── Room Types ────────────────────────────────────────────────────

export interface RoomListEntry {
  roomId: string;
  name: string;
  ownerName: string;
  playerCount: number;
  maxPlayers: number;
  inProgress: boolean;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  maxPlayers: number;
  privacy: 'public' | 'unlisted';
  joinCode: string;
}
