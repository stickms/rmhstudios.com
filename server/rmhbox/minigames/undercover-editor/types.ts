/**
 * RMHbox — Undercover Editor Minigame Types
 *
 * Phase type, interfaces, and type definitions for the Undercover Editor minigame.
 */

// ─── Phase Type ──────────────────────────────────────────────────

export type UEPhase = 'SETUP' | 'WRITE' | 'EDIT' | 'REVIEW' | 'ACCUSATION' | 'REVEAL';

// ─── Core State Types ────────────────────────────────────────────

export interface StorySentence {
  authorUserId: string;
  authorName: string;
  text: string;
  originalText: string;
  turnNumber: number;
  words: string[];
}

export interface WordEdit {
  sentenceIndex: number;
  wordIndex: number;
  originalWord: string;
  newWord: string;
  editedOnTurn: number;
}

export interface UndercoverEditorState {
  storyPrompt: string;
  keyword: string;
  editorUserId: string;
  turnOrder: string[];
  currentTurnIndex: number;
  totalTurns: number;
  phase: UEPhase;
  sentences: StorySentence[];
  edits: WordEdit[];
  editedWordPositions: Set<string>;
  votes: Map<string, string>;
  keywordInStory: boolean;
  editorWasCaught: boolean;
  winner: 'editor' | 'writers' | null;
  playerScores: Map<string, number>;
  phaseStartedAt: number;
  phaseEndsAt: number;
}

// ─── Client View Types ───────────────────────────────────────────

export interface StorySentenceView {
  authorName: string;
  text: string;
  turnNumber: number;
}

export interface EditableWord {
  word: string;
  index: number;
  sentenceIndex: number;
  isEditable: boolean;
}

export interface EditableStory {
  sentences: Array<{
    authorName: string;
    words: EditableWord[];
  }>;
}

export interface WordEditView {
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
  editedOnTurn: number;
}

export interface VoteResult {
  voterId: string;
  voterName: string;
  accusedUserId: string;
  accusedName: string;
}

export interface ScoreResult {
  userId: string;
  userName: string;
  role: 'editor' | 'writer';
  score: number;
  breakdown: Record<string, number>;
}

export interface PlayerTurnInfo {
  userId: string;
  userName: string;
  turnNumbers: number[];
}

// ─── Game Log ────────────────────────────────────────────────────

export interface GameLogAction {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
