/**
 * Identity Crisis — the shapes the server sends (see server/rmhbox/minigames/identity-crisis/handler.ts).
 * A player's own identity is in none of them until the reveal.
 */

export interface ICIdentity {
  name: string;
  category: string;
}

export interface ICOther {
  userId: string;
  userName: string;
  identity: ICIdentity;
}

export type ICPhase = 'WAITING' | 'ASSIGN' | 'ASK' | 'VOTE' | 'RESULT' | 'FINAL' | 'REVEAL' | 'GAME_OVER';
export type ICStatus = 'asking' | 'solved' | 'stopped';
export type ICVote = 'yes' | 'no' | 'maybe';
export type ICPlurality = ICVote | 'split';

export interface ICCounts {
  yes: number;
  no: number;
  maybe: number;
}

export interface ICQuestion {
  turnNumber: number;
  askerId: string;
  text: string;
}

export interface ICResult {
  counts: ICCounts;
  plurality: ICPlurality;
}

export interface ICHistoryEntry {
  turnNumber: number;
  askerId: string;
  askerName: string;
  text: string;
  counts: ICCounts | null;
  plurality: ICPlurality | null;
}

export interface ICRevealEntry {
  userId: string;
  userName: string;
  identity: ICIdentity;
  outcome: 'early' | 'final' | 'missed';
  points: number;
}
