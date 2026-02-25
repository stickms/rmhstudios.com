/**
 * RMHbox — Undercover Editor Minigame Types (Parallel Design)
 *
 * All players write sentences for ALL stories simultaneously.
 * Each player is assigned as the secret "undercover editor" of one
 * other player's story. After writing rounds, players review all
 * stories and try to match each story with its undercover editor.
 *
 * Phases: SETUP → WRITE → EDIT → (repeat) → REVIEW → REVEAL
 */

// ─── Phase Type ──────────────────────────────────────────────────

export type UEPhase = 'SETUP' | 'WRITE' | 'EDIT' | 'REVIEW' | 'REVEAL';

// ─── Core State Types ────────────────────────────────────────────

/** A single sentence in a story. */
export interface StorySentence {
  authorUserId: string;
  authorName: string;
  text: string;
  originalText: string;
  turnNumber: number;
  words: string[];
}

/** A complete parallel story, owned by one player, edited by another. */
export interface ParallelStory {
  /** Story ID (same as ownerUserId for simplicity). */
  storyId: string;
  /** The story prompt text. */
  prompt: string;
  /** The player whose "story" this is (their name appears as story owner). */
  ownerUserId: string;
  ownerName: string;
  /** The keyword the editor must sneak into this story. */
  keyword: string;
  /** The player secretly assigned to undercover-edit this story. */
  editorUserId: string;
  /** All sentences written so far (by various players). */
  sentences: StorySentence[];
  /** Edits made by the undercover editor. */
  edits: WordEdit[];
  /** Set of "sentenceIndex:wordIndex" positions already edited (prevents re-editing). */
  editedWordPositions: Set<string>;
  /** Whether the keyword was found in the final story (set during reveal). */
  keywordInStory: boolean;
}

/** A record of a word edit by the undercover editor. */
export interface WordEdit {
  sentenceIndex: number;
  wordIndex: number;
  originalWord: string;
  newWord: string;
  editedOnTurn: number;
}

/**
 * Full state for the parallel Undercover Editor game.
 * Managed entirely on the server; clients receive masked views.
 */
export interface UndercoverEditorState {
  /** All players in this game (shuffled turn order). */
  playerIds: string[];
  /** Number of writing rounds. */
  totalRounds: number;
  /** Current round (0-based). */
  currentRound: number;
  /** Current phase. */
  phase: UEPhase;
  /** One story per player, indexed by storyId (= ownerUserId). */
  stories: Map<string, ParallelStory>;
  /**
   * Editor assignment map: editorUserId → storyId they edit.
   * Each player edits exactly one story (not their own).
   */
  editorAssignments: Map<string, string>;
  /**
   * Per-round write submissions. Map<storyId, Map<authorUserId, sentenceText>>.
   * Tracks who has submitted for the current round.
   */
  roundSubmissions: Map<string, Map<string, string>>;
  /**
   * Per-round edit submissions. Map<storyId, boolean>.
   * Tracks which editors have completed/skipped their edit.
   */
  roundEditsDone: Map<string, boolean>;
  /**
   * Matching guesses during REVIEW phase.
   * Map<guesserId, Map<storyId, guessedEditorUserId>>.
   * Each player submits a mapping of storyId→editorId.
   */
  matchGuesses: Map<string, Map<string, string>>;
  /** Players who have confirmed their matching is done. */
  matchLockedIn: Set<string>;
  /** Player scores. */
  playerScores: Map<string, number>;
  /** Phase timing. */
  phaseStartedAt: number;
  phaseEndsAt: number;
}

// ─── Client View Types ───────────────────────────────────────────

/** Sentence as seen by clients (no userId). */
export interface StorySentenceView {
  authorName: string;
  text: string;
  turnNumber: number;
}

/** A story as seen by clients during play. */
export interface StoryView {
  storyId: string;
  ownerName: string;
  prompt: string;
  sentences: StorySentenceView[];
}

/** Word in an editable story (editor's view). */
export interface EditableWord {
  word: string;
  index: number;
  sentenceIndex: number;
  isEditable: boolean;
}

/** Editor's view of the story they're editing. */
export interface EditableStory {
  storyId: string;
  ownerName: string;
  prompt: string;
  keyword: string;
  sentences: Array<{
    authorName: string;
    words: EditableWord[];
  }>;
}

/** Edit info for the reveal screen. */
export interface WordEditView {
  storyId: string;
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
  editedOnTurn: number;
}

/** Per-story reveal info. */
export interface StoryRevealInfo {
  storyId: string;
  ownerName: string;
  editorUserId: string;
  editorName: string;
  keyword: string;
  keywordInStory: boolean;
  edits: WordEditView[];
  sentences: StorySentenceView[];
}

/** Per-player score breakdown. */
export interface ScoreResult {
  userId: string;
  userName: string;
  score: number;
  breakdown: Record<string, number>;
}

/** A player info entry. */
export interface PlayerInfo {
  userId: string;
  userName: string;
}

// ─── Game Log ────────────────────────────────────────────────────

export interface GameLogAction {
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}
