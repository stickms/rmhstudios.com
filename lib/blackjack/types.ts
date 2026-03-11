import type { Card } from './logic';

export type TablePhase =
  | 'idle'
  | 'betting'
  | 'dealing'
  | 'player_turns'
  | 'dealer_turn'
  | 'payout'
  | 'results';

export type PlayerStatus =
  | 'waiting'    // seated but not in current round
  | 'betting'    // placed a bet for this round
  | 'playing'    // it's their turn
  | 'standing'   // stood
  | 'busted'     // went over 21
  | 'blackjack'  // natural 21
  | 'done';      // round resolved

export type HandResult = 'win' | 'lose' | 'push' | 'blackjack' | null;

export interface PlayerSeatClient {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  seatIndex: number;
  hand: Card[];
  bet: number;
  status: PlayerStatus;
  handValue: number | null;
  result: HandResult;
  payout: number;
}

export interface TableStateSnapshot {
  tableId: string;
  phase: TablePhase;
  roundNumber: number;
  players: PlayerSeatClient[];
  dealerHand: Card[];
  dealerValue: number | null;
  currentTurnUserId: string | null;
  bettingCountdown: number | null;
  turnTimeout: number | null;
}

export interface RoundResultEntry {
  userId: string;
  result: HandResult;
  payout: number;
  newBalance: number;
}
