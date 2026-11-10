import type { Bet, BetType } from './logic';

export type TablePhase =
  | 'idle'
  | 'betting'
  | 'spinning'
  | 'results';

export interface PlayerBetClient {
  type: BetType;
  numbers: number[];
  amount: number;
}

export interface PlayerSeatClient {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  seatIndex: number;
  bets: PlayerBetClient[];
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
  bettingCountdown: number | null;
  lastResult: number | null;
  history: number[];
}

export interface SpinResultPayload {
  result: number;
}

export interface RoundResultPayload {
  result: number;
  payouts: { userId: string; payout: number; netGain: number }[];
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
