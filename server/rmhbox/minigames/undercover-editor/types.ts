/**
 * RMHbox — Undercover Editor Minigame Types (Redesigned)
 *
 * Round-robin writing: each round, every player writes one sentence for
 * exactly one story. Over N writing rounds (N = number of players), every
 * player writes one sentence for every story.
 *
 * Alternating write/edit rounds (2N total):
 *   WRITE → EDIT → WRITE → EDIT → … → READING → REVIEW → REVEAL
 *
 * Editing: the editor must change exactly 2 words in the most recent
 * sentence of their assigned story.
 *
 * Reading: infinite-time, host-driven phase where sentences are revealed
 * one at a time for each story.
 *
 * Review: players match stories to their undercover editors (1-to-1).
 */

// ─── Phase Type ──────────────────────────────────────────────────

export type UEPhase = 'SETUP' | 'WRITE' | 'EDIT' | 'READING' | 'REVIEW' | 'REVEAL';

// ─── Core State Types ────────────────────────────────────────────

/** A single sentence in a story. */
export interface StorySentence {
  authorUserId: string;
  authorName: string;
  text: string;
  /** Original text before any editor edits. */
  originalText: string;
  /** Which writing round this sentence was added in (1-indexed). */
  roundNumber: number;
  /** Tokenized words array (used for word-level editing). */
  words: string[];
}

/** A complete story, owned by one player, edited by another. */
export interface ParallelStory {
  /** Story ID (same as ownerUserId for simplicity). */
  storyId: string;
  /** The story prompt text. */
  prompt: string;
  /** The player whose "story" this is (their name appears as story owner). */
  ownerUserId: string;
  ownerName: string;
  /** The player secretly assigned to undercover-edit this story. */
  editorUserId: string;
  /** All sentences written so far (by various players). */
  sentences: StorySentence[];
  /** Edits made by the undercover editor. */
  edits: WordEdit[];
}

/** A record of a word edit by the undercover editor. */
export interface WordEdit {
  /** Which sentence was edited (index in sentences array). */
  sentenceIndex: number;
  wordIndex: number;
  originalWord: string;
  newWord: string;
  /** Which edit round this change was made in. */
  editedOnRound: number;
}

/**
 * Full state for the Undercover Editor game.
 * Managed entirely on the server; clients receive masked views.
 */
export interface UndercoverEditorState {
  /** All players in this game (shuffled order). */
  playerIds: string[];
  /** Number of players (= number of stories = number of writing rounds). */
  numPlayers: number;
  /** Current writing round (1-indexed, up to numPlayers). */
  currentWriteRound: number;
  /** Current overall step (1-indexed, up to 2*numPlayers; odd=WRITE, even=EDIT). */
  currentStep: number;
  /** Total steps: 2 * numPlayers. */
  totalSteps: number;
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
   * Round-robin write assignment for the current write round.
   * Map<playerId, storyId> — which story each player writes for this round.
   */
  writeAssignments: Map<string, string>;
  /**
   * Per-round write submissions. Map<playerId, sentenceText>.
   * Only one story per player per round.
   */
  roundSubmissions: Map<string, string>;
  /**
   * Per-round edit status. Map<editorUserId, boolean>.
   * Tracks which editors have completed their edit for this round.
   */
  roundEditsDone: Map<string, boolean>;
  /**
   * Matching guesses during REVIEW phase.
   * Map<guesserId, Map<storyId, guessedEditorUserId>>.
   */
  matchGuesses: Map<string, Map<string, string>>;
  /** Players who have confirmed their matching is done. */
  matchLockedIn: Set<string>;
  /** Player scores. */
  playerScores: Map<string, number>;
  /** Phase timing. */
  phaseStartedAt: number;
  phaseEndsAt: number;
  /** READING phase: which story is currently being read (index into story list). */
  readingStoryIndex: number;
  /** READING phase: how many sentences have been revealed for the current story. */
  readingSentenceIndex: number;
  /**
   * Shuffled story-ID order used for write-round assignments.
   * Independently shuffled from playerIds so the round in which an editor
   * writes for their own edited story is random.
   */
  assignmentStoryOrder: string[];
}

// ─── Client View Types ───────────────────────────────────────────

/** Sentence as seen by clients (no userId). */
export interface StorySentenceView {
  authorName: string;
  text: string;
  roundNumber: number;
}

/** A story as seen by clients during play. */
export interface StoryView {
  storyId: string;
  ownerName: string;
  prompt: string;
  sentences: StorySentenceView[];
}

/** Word in an editable story (editor's view during EDIT phase). */
export interface EditableWord {
  word: string;
  index: number;
}

/** Editor's view of the most recent sentence for editing. */
export interface EditableSentence {
  authorName: string;
  sentenceIndex: number;
  words: EditableWord[];
}

/** Editor's view of the story they're editing. */
export interface EditableStory {
  storyId: string;
  ownerName: string;
  prompt: string;
  /** The most recent sentence available for editing. */
  editableSentence: EditableSentence;
  /** Full story text so far (for context). */
  sentences: StorySentenceView[];
}

/** Edit info for the reveal screen. */
export interface WordEditView {
  storyId: string;
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
  editedOnRound: number;
}

/** Per-story reveal info. */
export interface StoryRevealInfo {
  storyId: string;
  ownerName: string;
  editorUserId: string;
  editorName: string;
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
