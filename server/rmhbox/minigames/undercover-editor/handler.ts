/**
 * RMHbox — Undercover Editor Minigame Server Handler
 *
 * N players → N stories, 2N total steps (alternating WRITE and EDIT).
 *
 * Round-robin writing: each write round, every player writes ONE sentence
 * for ONE story (assigned by rotation). After N write rounds, every player
 * has contributed one sentence to every story.
 *
 * Editing: after each write round, ALL editors simultaneously change
 * exactly 2 words in the most recent sentence of their assigned story.
 *
 * Phases:
 *   SETUP → (WRITE → EDIT) × N → READING → REVIEW → REVEAL → END
 *
 * READING: infinite-time, host-driven phase where sentences are revealed
 * one at a time per story.
 *
 * REVIEW: infinite-time. Players match stories to their undercover editors
 * (1-to-1 bijection, excluding stories they edited).
 *
 * Join-in-progress policy: spectate_only
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §2
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import { loadPrompts, selectPromptForGame } from '@/lib/rmhbox/undercover-editor/data-loader';
import {
  WriteSentenceSchema,
  UnsubmitSentenceSchema,
  EditTwoWordsSchema,
  SkipEditSchema,
  SubmitMatchingSchema,
  LockInMatchingSchema,
  NextSentenceSchema,
  NextStorySchema,
} from '@/lib/rmhbox/undercover-editor/schemas';
import type { StoryPrompt } from '@/lib/rmhbox/undercover-editor/schemas';
import {
  UE_WRITE_TIMEOUT_SECONDS,
  UE_EDIT_TIMEOUT_SECONDS,
  UE_REVEAL_DURATION_SECONDS,
  UE_CORRECT_VOTE_BONUS,
  UE_EDITOR_MAJOR_WIN,
  UE_EDITOR_LOSS,
  UE_WRITER_MAJOR_WIN,
  UE_WRITER_LOSS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import type {
  UEPhase,
  StorySentence,
  ParallelStory,
  UndercoverEditorState,
  StorySentenceView,
  EditableStory,
  EditableSentence,
  EditableWord,
  StoryView,
  WordEditView,
  StoryRevealInfo,
  ScoreResult,
  PlayerInfo,
  GameLogAction,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Strip HTML tags from user input. */
function sanitizeString(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/** Shuffle an array in-place (Fisher–Yates). */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Undercover Editor Minigame ──────────────────────────────────────────

export class UndercoverEditorGame extends BaseMinigame {
  private promptPool: StoryPrompt[];
  private usedPromptIndices: Set<number> = new Set();
  private state!: UndercoverEditorState;
  private startedAt: number = 0;
  private actionLog: GameLogAction[] = [];
  /** Handle for the current phase-transition timeout; cancelled on early transitions. */
  private phaseTransitionHandle: NodeJS.Timeout | null = null;

  constructor(context: MinigameContext) {
    super(context);
    this.promptPool = loadPrompts();
  }

  /**
   * Spectator mode: shared-privileged — all spectators see the same
   * omniscient state (editor identity, edit history all visible).
   */
  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  // ─── Phase Transition Scheduling ──────────────────────────────────────────

  /**
   * Schedule a phase transition callback, cancelling any pending one first.
   * This prevents zombie timers from firing after early phase transitions.
   */
  private schedulePhaseTransition(callback: () => void, delayMs: number): void {
    this.clearTrackedTimeout(this.phaseTransitionHandle);
    this.phaseTransitionHandle = this.setTimeout(callback, delayMs);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const playerIds = Array.from(this.context.players.keys());
    shuffleArray(playerIds);
    const numPlayers = playerIds.length;

    // Select one prompt per story (one story per player)
    const stories = new Map<string, ParallelStory>();
    const editorAssignments = new Map<string, string>();

    // Cyclic editor assignment: player i edits player (i+1 mod N)'s story
    for (let i = 0; i < numPlayers; i++) {
      const ownerId = playerIds[i];
      const editorId = playerIds[(i + 1) % numPlayers];
      const ownerPlayer = this.context.players.get(ownerId);

      const prompt = selectPromptForGame(this.promptPool, this.usedPromptIndices);
      this.usedPromptIndices.add(prompt.poolIndex);

      stories.set(ownerId, {
        storyId: ownerId,
        prompt: prompt.text,
        ownerUserId: ownerId,
        ownerName: ownerPlayer?.userName ?? 'Unknown',
        editorUserId: editorId,
        sentences: [],
        edits: [],
      });

      editorAssignments.set(editorId, ownerId);
    }

    // Initialize scores
    const playerScores = new Map<string, number>();
    for (const uid of playerIds) {
      playerScores.set(uid, 0);
    }

    const now = Date.now();
    this.state = {
      playerIds,
      numPlayers,
      currentWriteRound: 0,
      currentStep: 0,
      totalSteps: 2 * numPlayers,
      phase: 'SETUP' as UEPhase,
      stories,
      editorAssignments,
      writeAssignments: new Map(),
      roundSubmissions: new Map(),
      roundEditsDone: new Map(),
      matchGuesses: new Map(),
      matchLockedIn: new Set(),
      playerScores,
      phaseStartedAt: now,
      phaseEndsAt: now,
      readingStoryIndex: 0,
      readingSentenceIndex: 0,
    };

    logger.info({
      event: 'undercover_editor:start',
      lobbyId: this.context.lobbyId,
      playerCount: numPlayers,
      totalSteps: this.state.totalSteps,
      storyCount: stories.size,
    });

    const playerInfos = this.buildPlayerInfos();

    // Broadcast game start — includes story prompts (no secret info)
    const storyList = Array.from(stories.values()).map((s) => ({
      storyId: s.storyId,
      ownerName: s.ownerName,
      prompt: s.prompt,
    }));

    this.broadcastGameAction({
      type: 'UE_GAME_START',
      stories: storyList,
      players: playerInfos,
      numPlayers,
      totalSteps: this.state.totalSteps,
    });

    // Send editor assignment individually — each editor learns their story
    for (const uid of playerIds) {
      const assignedStoryId = editorAssignments.get(uid);
      if (assignedStoryId) {
        const story = stories.get(assignedStoryId)!;
        this.context.sendToPlayer(uid, 'rmhbox:game:action', {
          type: 'UE_ROLE_ASSIGNED',
          role: 'editor',
          assignedStoryId,
          storyOwnerName: story.ownerName,
        });
      }
    }

    this.startWritePhase();
  }

  // ─── Phase: WRITE ─────────────────────────────────────────────────────

  private startWritePhase(): void {
    if (!this.isRunning) return;

    this.state.currentWriteRound++;
    if (this.state.currentWriteRound > this.state.numPlayers) {
      this.startReadingPhase();
      return;
    }

    this.state.currentStep++;
    this.state.phase = 'WRITE';
    const writeTimeout = this.getSetting('writeTimeout', UE_WRITE_TIMEOUT_SECONDS);
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + writeTimeout * 1000;

    // Compute round-robin write assignments for this round
    this.state.writeAssignments = new Map();
    this.state.roundSubmissions = new Map();
    const storyIds = Array.from(this.state.stories.keys());

    for (let pi = 0; pi < this.state.playerIds.length; pi++) {
      const playerId = this.state.playerIds[pi];
      // currentWriteRound is 1-indexed; subtract 1 to make the rotation 0-based
      const assignedStoryId = storyIds[(pi + this.state.currentWriteRound - 1) % this.state.numPlayers];
      this.state.writeAssignments.set(playerId, assignedStoryId);
    }

    this.broadcastRound(this.state.currentStep, this.state.totalSteps);

    this.logAction('write_start', {
      writeRound: this.state.currentWriteRound,
      step: this.state.currentStep,
    });

    logger.info({
      event: 'undercover_editor:write_start',
      lobbyId: this.context.lobbyId,
      writeRound: this.state.currentWriteRound,
      step: this.state.currentStep,
      writeTimeout,
    });

    // Broadcast WRITE phase to all
    this.broadcastGameAction({
      type: 'UE_WRITE_START',
      writeRound: this.state.currentWriteRound,
      step: this.state.currentStep,
      totalSteps: this.state.totalSteps,
      writeDurationSeconds: writeTimeout,
    });

    // Send individual write assignments with story context
    for (const [playerId, storyId] of this.state.writeAssignments) {
      const story = this.state.stories.get(storyId);
      this.context.sendToPlayer(playerId, 'rmhbox:game:action', {
        type: 'UE_WRITE_ASSIGNMENT',
        storyId,
        storyOwnerName: story?.ownerName ?? 'Unknown',
        prompt: story?.prompt ?? '',
        sentences: story ? story.sentences.map((s): StorySentenceView => ({
          authorName: s.authorName,
          text: s.text,
          roundNumber: s.roundNumber,
        })) : [],
      });
    }

    this.startPhaseTimer(writeTimeout);
    this.schedulePhaseTransition(() => this.endWritePhase(), writeTimeout * 1000);
  }

  /** Called when write timer expires or all players have submitted. */
  private endWritePhase(): void {
    if (!this.isRunning) return;
    // Phase guard: prevent re-entry from zombie timers
    if (this.state.phase !== 'WRITE') return;

    this.clearTrackedTimeout(this.phaseTransitionHandle);
    this.phaseTransitionHandle = null;
    this.clearPhaseTimer();

    // Add submitted sentences (or default "..." for missing ones)
    for (const [playerId, storyId] of this.state.writeAssignments) {
      const text = this.state.roundSubmissions.get(playerId) ?? '...';
      this.addSentenceToStory(storyId, playerId, text);
    }

    // Broadcast updated stories
    this.broadcastAllStories();

    logger.info({
      event: 'undercover_editor:write_end',
      lobbyId: this.context.lobbyId,
      writeRound: this.state.currentWriteRound,
      step: this.state.currentStep,
    });

    this.startEditPhase();
  }

  /** Check if all players submitted; end WRITE early if so. */
  private checkWriteComplete(): void {
    if (this.state.roundSubmissions.size >= this.state.numPlayers) {
      this.endWritePhase();
    }
  }

  // ─── Phase: EDIT ──────────────────────────────────────────────────────

  private startEditPhase(): void {
    if (!this.isRunning) return;

    this.state.currentStep++;
    this.state.phase = 'EDIT';
    const editTimeout = this.getSetting('editTimeout', UE_EDIT_TIMEOUT_SECONDS);
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + editTimeout * 1000;

    // Reset edit completion tracking (keyed by editorUserId)
    this.state.roundEditsDone = new Map();
    for (const editorId of this.state.editorAssignments.keys()) {
      this.state.roundEditsDone.set(editorId, false);
    }

    logger.info({
      event: 'undercover_editor:edit_start',
      lobbyId: this.context.lobbyId,
      writeRound: this.state.currentWriteRound,
      step: this.state.currentStep,
      editTimeout,
    });

    // Broadcast EDIT phase start — non-editors see a waiting state
    this.broadcastGameAction({
      type: 'UE_EDIT_START',
      writeRound: this.state.currentWriteRound,
      step: this.state.currentStep,
      editDurationSeconds: editTimeout,
    });

    // Send editable story to each editor
    for (const [editorId, storyId] of this.state.editorAssignments) {
      const editorPlayer = this.context.players.get(editorId);
      if (!editorPlayer || !editorPlayer.isConnected) {
        // Auto-skip for disconnected editors
        this.state.roundEditsDone.set(editorId, true);
        continue;
      }
      const editableStory = this.buildEditableStory(storyId);
      if (editableStory) {
        this.context.sendToPlayer(editorId, 'rmhbox:game:action', {
          type: 'UE_EDIT_PROMPT',
          story: editableStory,
          editDurationSeconds: editTimeout,
        });
      }
    }

    this.startPhaseTimer(editTimeout);
    this.schedulePhaseTransition(() => this.endEditPhase(), editTimeout * 1000);

    // Check if all editors are disconnected (auto-complete)
    this.checkEditComplete();
  }

  /** Called when edit timer expires or all editors have completed. */
  private endEditPhase(): void {
    if (!this.isRunning) return;
    // Phase guard: prevent re-entry from zombie timers
    if (this.state.phase !== 'EDIT') return;

    this.clearTrackedTimeout(this.phaseTransitionHandle);
    this.phaseTransitionHandle = null;
    this.clearPhaseTimer();

    // Broadcast updated stories after edits
    this.broadcastAllStories();

    logger.info({
      event: 'undercover_editor:edit_end',
      lobbyId: this.context.lobbyId,
      writeRound: this.state.currentWriteRound,
      step: this.state.currentStep,
    });

    // Next write round (startWritePhase will transition to READING when rounds exhausted)
    this.startWritePhase();
  }

  /** Check if all editors have completed their edits. */
  private checkEditComplete(): void {
    for (const [, done] of this.state.roundEditsDone) {
      if (!done) return;
    }
    this.endEditPhase();
  }

  // ─── Phase: READING (Infinite Time, Host-Driven) ──────────────────────────────

  private startReadingPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'READING';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = 0; // infinite
    this.state.readingStoryIndex = 0;
    this.state.readingSentenceIndex = 0;

    const storyIds = Array.from(this.state.stories.keys());
    const storyList = storyIds.map((id) => {
      const story = this.state.stories.get(id)!;
      return {
        storyId: story.storyId,
        ownerName: story.ownerName,
        prompt: story.prompt,
        sentenceCount: story.sentences.length,
      };
    });

    this.logAction('reading_start', {
      storyCount: storyIds.length,
    });

    logger.info({
      event: 'undercover_editor:reading_start',
      lobbyId: this.context.lobbyId,
      storyCount: storyIds.length,
    });

    this.broadcastGameAction({
      type: 'UE_READING_START',
      stories: storyList,
      readingStoryIndex: 0,
      readingSentenceIndex: 0,
    });

    this.startInfinitePhaseTimer(false);
  }

  // ─── Phase: REVIEW (Infinite Time) ────────────────────────────────────────

  private startReviewPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'REVIEW';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = 0; // infinite

    this.state.matchGuesses = new Map();
    this.state.matchLockedIn = new Set();

    this.logAction('review_start', {
      storyCount: this.state.stories.size,
    });

    logger.info({
      event: 'undercover_editor:review_start',
      lobbyId: this.context.lobbyId,
      storyCount: this.state.stories.size,
    });

    const allStories = this.buildAllStoryViews();
    const playerInfos = this.buildPlayerInfos();

    this.broadcastGameAction({
      type: 'UE_REVIEW_START',
      stories: allStories,
      players: playerInfos,
    });

    // Infinite phase timer — host or all-locked-in advances
    this.startInfinitePhaseTimer(true);
  }

  /** Check if all players have locked in their matching. */
  private checkReviewComplete(): void {
    for (const uid of this.state.playerIds) {
      if (!this.state.matchLockedIn.has(uid)) return;
    }
    // All players locked in — proceed to reveal
    this.startRevealPhase();
  }

  // ─── Phase: REVEAL ────────────────────────────────────────────────────

  private startRevealPhase(): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    this.state.phase = 'REVEAL';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + UE_REVEAL_DURATION_SECONDS * 1000;

    // Score the game
    this.computeScoring();

    const storyReveals = this.buildStoryReveals();
    const scores = this.buildScoreResults();

    // Build matching results per player
    const matchResults: Record<string, { storyId: string; guessedEditorId: string; actualEditorId: string; correct: boolean }[]> = {};
    for (const [guesserId, guessMap] of this.state.matchGuesses) {
      matchResults[guesserId] = [];
      for (const [storyId, guessedId] of guessMap) {
        const story = this.state.stories.get(storyId);
        const actualEditorId = story?.editorUserId ?? '';
        matchResults[guesserId].push({
          storyId,
          guessedEditorId: guessedId,
          actualEditorId,
          correct: guessedId === actualEditorId,
        });
      }
    }

    this.logAction('reveal', {
      storyReveals: storyReveals.map((s) => ({
        storyId: s.storyId,
        editorUserId: s.editorUserId,
        editCount: s.edits.length,
      })),
    });

    logger.info({
      event: 'undercover_editor:reveal',
      lobbyId: this.context.lobbyId,
      storyCount: storyReveals.length,
    });

    this.broadcastGameAction({
      type: 'UE_REVEAL',
      storyReveals,
      matchResults,
      scores,
    });

    this.startPhaseTimer(UE_REVEAL_DURATION_SECONDS);
    this.schedulePhaseTransition(() => this.endGame(), UE_REVEAL_DURATION_SECONDS * 1000);
  }

  // ─── End Game ─────────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'undercover_editor:game_end',
      lobbyId: this.context.lobbyId,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ───────────────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    switch (action) {
      case 'WRITE_SENTENCE':
        this.handleWriteSentence(userId, data);
        break;
      case 'UNSUBMIT_SENTENCE':
        this.handleUnsubmitSentence(userId, data);
        break;
      case 'EDIT_TWO_WORDS':
        this.handleEditTwoWords(userId, data);
        break;
      case 'SKIP_EDIT':
        this.handleSkipEdit(userId, data);
        break;
      case 'SUBMIT_MATCHING':
        this.handleSubmitMatching(userId, data);
        break;
      case 'LOCK_IN_MATCHING':
        this.handleLockInMatching(userId, data);
        break;
      case 'NEXT_SENTENCE':
        this.handleNextSentence(userId, data);
        break;
      case 'NEXT_STORY':
        this.handleNextStory(userId, data);
        break;
      default:
        logger.warn({
          event: 'undercover_editor:unknown_action',
          lobbyId: this.context.lobbyId,
          userId,
          action,
        });
    }
  }

  // ─── WRITE Handlers ───────────────────────────────────────────────────

  private handleWriteSentence(userId: string, data: unknown): void {
    if (this.state.phase !== 'WRITE') {
      this.sendError(userId, 'Not in WRITE phase');
      return;
    }

    const parsed = WriteSentenceSchema.safeParse(data);
    if (!parsed.success) {
      this.sendError(userId, 'Invalid sentence submission');
      return;
    }

    const { storyId, text } = parsed.data;

    // Verify this player is assigned to write for this story this round
    const assignedStoryId = this.state.writeAssignments.get(userId);
    if (assignedStoryId !== storyId) {
      this.sendError(userId, 'Not assigned to this story this round');
      return;
    }

    if (!this.state.playerIds.includes(userId)) {
      this.sendError(userId, 'Not a game participant');
      return;
    }

    const sanitized = sanitizeString(text).trim();
    this.state.roundSubmissions.set(userId, sanitized);

    const player = this.context.players.get(userId);
    const authorName = player?.userName ?? 'Unknown';

    // Confirm submission to the player
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_SENTENCE_CONFIRMED',
      storyId,
      text: sanitized,
    });

    this.broadcastSubmissionProgress();

    this.logAction('sentence_submitted', {
      userId,
      authorName,
      storyId,
      textLength: sanitized.length,
    });

    this.checkWriteComplete();
  }

  private handleUnsubmitSentence(userId: string, data: unknown): void {
    if (this.state.phase !== 'WRITE') {
      this.sendError(userId, 'Not in WRITE phase');
      return;
    }

    const parsed = UnsubmitSentenceSchema.safeParse(data);
    if (!parsed.success) {
      this.sendError(userId, 'Invalid unsubmit request');
      return;
    }

    const { storyId } = parsed.data;

    // Verify assignment
    const assignedStoryId = this.state.writeAssignments.get(userId);
    if (assignedStoryId !== storyId) {
      this.sendError(userId, 'Not assigned to this story this round');
      return;
    }

    // Guard: can't unsubmit if all players have submitted (phase would end)
    if (this.state.roundSubmissions.size >= this.state.numPlayers) {
      this.sendError(userId, 'Cannot unsubmit — all submissions are in');
      return;
    }

    if (this.state.roundSubmissions.has(userId)) {
      this.state.roundSubmissions.delete(userId);

      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_SENTENCE_UNSUBMITTED',
        storyId,
      });

      this.broadcastSubmissionProgress();

      this.logAction('sentence_unsubmitted', {
        userId,
        storyId,
      });
    }
  }

  // ─── EDIT Handlers ────────────────────────────────────────────────────

  private handleEditTwoWords(userId: string, data: unknown): void {
    if (this.state.phase !== 'EDIT') {
      this.sendError(userId, 'Not in EDIT phase');
      return;
    }

    const parsed = EditTwoWordsSchema.safeParse(data);
    if (!parsed.success) {
      this.sendError(userId, 'Invalid edit submission');
      return;
    }

    const { storyId, edits } = parsed.data;

    // Verify this user is the editor for this story
    const assignedStoryId = this.state.editorAssignments.get(userId);
    if (assignedStoryId !== storyId) {
      this.sendError(userId, 'Not the editor for this story');
      return;
    }

    if (this.state.roundEditsDone.get(userId)) {
      this.sendError(userId, 'Already edited this round');
      return;
    }

    const story = this.state.stories.get(storyId);
    if (!story || story.sentences.length === 0) {
      this.sendError(userId, 'No sentences to edit');
      return;
    }

    // Target: the most recent sentence
    const sentenceIndex = story.sentences.length - 1;
    const sentence = story.sentences[sentenceIndex];

    // Validate both word indices
    for (const edit of edits) {
      if (edit.wordIndex < 0 || edit.wordIndex >= sentence.words.length) {
        this.sendError(userId, 'Invalid word index');
        return;
      }
    }

    // The two edits must target different words
    if (edits[0].wordIndex === edits[1].wordIndex) {
      this.sendError(userId, 'Must edit two different words');
      return;
    }

    // Apply both edits atomically
    for (const edit of edits) {
      const originalWord = sentence.words[edit.wordIndex];
      const newWord = sanitizeString(edit.newWord);
      sentence.words[edit.wordIndex] = newWord;

      story.edits.push({
        sentenceIndex,
        wordIndex: edit.wordIndex,
        originalWord,
        newWord,
        editedOnRound: this.state.currentWriteRound,
      });
    }

    // Rebuild sentence text from words
    sentence.text = sentence.words.join(' ');

    // Mark editor as done
    this.state.roundEditsDone.set(userId, true);

    this.logAction('edit_applied', {
      userId,
      storyId,
      sentenceIndex,
      edits: edits.map((e) => ({
        wordIndex: e.wordIndex,
        newWord: e.newWord,
      })),
    });

    logger.info({
      event: 'undercover_editor:edit_applied',
      lobbyId: this.context.lobbyId,
      writeRound: this.state.currentWriteRound,
      storyId,
      sentenceIndex,
      editCount: edits.length,
    });

    // Confirm to editor
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_EDIT_CONFIRMED',
      storyId,
    });

    this.checkEditComplete();
  }

  private handleSkipEdit(userId: string, data: unknown): void {
    if (this.state.phase !== 'EDIT') {
      this.sendError(userId, 'Not in EDIT phase');
      return;
    }

    void SkipEditSchema.safeParse(data);

    const assignedStoryId = this.state.editorAssignments.get(userId);
    if (!assignedStoryId) {
      this.sendError(userId, 'Not an editor');
      return;
    }

    this.state.roundEditsDone.set(userId, true);

    this.logAction('edit_skipped', {
      userId,
      storyId: assignedStoryId,
      writeRound: this.state.currentWriteRound,
    });

    logger.info({
      event: 'undercover_editor:edit_skipped',
      lobbyId: this.context.lobbyId,
      writeRound: this.state.currentWriteRound,
      storyId: assignedStoryId,
    });

    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_EDIT_CONFIRMED',
      storyId: assignedStoryId,
      skipped: true,
    });

    this.checkEditComplete();
  }

  // ─── READING Handlers ─────────────────────────────────────────────────

  private handleNextSentence(userId: string, data: unknown): void {
    if (this.state.phase !== 'READING') {
      this.sendError(userId, 'Not in READING phase');
      return;
    }

    void NextSentenceSchema.safeParse(data);

    // Only the host can advance
    if (userId !== this.context.getHostId()) {
      this.sendError(userId, 'Only the host can advance');
      return;
    }

    const storyIds = Array.from(this.state.stories.keys());
    const currentStory = this.state.stories.get(storyIds[this.state.readingStoryIndex]);
    if (!currentStory) {
      logger.warn({
        event: 'undercover_editor:reading_story_not_found',
        lobbyId: this.context.lobbyId,
        readingStoryIndex: this.state.readingStoryIndex,
      });
      return;
    }

    if (this.state.readingSentenceIndex >= currentStory.sentences.length) {
      this.sendError(userId, 'All sentences revealed for this story');
      return;
    }

    const sentence = currentStory.sentences[this.state.readingSentenceIndex];
    this.state.readingSentenceIndex++;

    this.broadcastGameAction({
      type: 'UE_READING_SENTENCE',
      storyIndex: this.state.readingStoryIndex,
      sentenceIndex: this.state.readingSentenceIndex - 1,
      sentence: {
        authorName: sentence.authorName,
        text: sentence.text,
        roundNumber: sentence.roundNumber,
      } as StorySentenceView,
    });

    logger.info({
      event: 'undercover_editor:reading_sentence',
      lobbyId: this.context.lobbyId,
      storyIndex: this.state.readingStoryIndex,
      sentenceIndex: this.state.readingSentenceIndex - 1,
    });
  }

  private handleNextStory(userId: string, data: unknown): void {
    if (this.state.phase !== 'READING') {
      this.sendError(userId, 'Not in READING phase');
      return;
    }

    void NextStorySchema.safeParse(data);

    // Only the host can advance
    if (userId !== this.context.getHostId()) {
      this.sendError(userId, 'Only the host can advance');
      return;
    }

    const storyIds = Array.from(this.state.stories.keys());
    this.state.readingStoryIndex++;
    this.state.readingSentenceIndex = 0;

    // All stories read — transition to REVIEW
    if (this.state.readingStoryIndex >= storyIds.length) {
      logger.info({
        event: 'undercover_editor:reading_complete',
        lobbyId: this.context.lobbyId,
      });
      this.startReviewPhase();
      return;
    }

    const nextStory = this.state.stories.get(storyIds[this.state.readingStoryIndex]);

    this.broadcastGameAction({
      type: 'UE_READING_NEXT_STORY',
      readingStoryIndex: this.state.readingStoryIndex,
      storyId: storyIds[this.state.readingStoryIndex],
      ownerName: nextStory?.ownerName ?? 'Unknown',
      prompt: nextStory?.prompt ?? '',
      sentenceCount: nextStory?.sentences.length ?? 0,
    });

    logger.info({
      event: 'undercover_editor:reading_next_story',
      lobbyId: this.context.lobbyId,
      readingStoryIndex: this.state.readingStoryIndex,
    });
  }

  // ─── REVIEW Handlers ──────────────────────────────────────────────────

  private handleSubmitMatching(userId: string, data: unknown): void {
    if (this.state.phase !== 'REVIEW') {
      this.sendError(userId, 'Not in REVIEW phase');
      return;
    }

    const parsed = SubmitMatchingSchema.safeParse(data);
    if (!parsed.success) {
      this.sendError(userId, 'Invalid matching submission');
      return;
    }

    if (this.state.matchLockedIn.has(userId)) {
      this.sendError(userId, 'Already locked in');
      return;
    }

    const guessMap = new Map<string, string>();
    for (const [storyId, guessedEditorId] of Object.entries(parsed.data.guesses)) {
      guessMap.set(storyId, guessedEditorId);
    }
    this.state.matchGuesses.set(userId, guessMap);

    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_MATCHING_SAVED',
      guesses: parsed.data.guesses,
    });

    this.logAction('matching_submitted', {
      userId,
      guessCount: guessMap.size,
    });
  }

  private handleLockInMatching(userId: string, data: unknown): void {
    if (this.state.phase !== 'REVIEW') {
      this.sendError(userId, 'Not in REVIEW phase');
      return;
    }

    void LockInMatchingSchema.safeParse(data);

    if (this.state.matchLockedIn.has(userId)) return;
    this.state.matchLockedIn.add(userId);

    const player = this.context.players.get(userId);
    const userName = player?.userName ?? 'Unknown';

    this.broadcastGameAction({
      type: 'UE_PLAYER_LOCKED_IN',
      userId,
      userName,
      lockedInCount: this.state.matchLockedIn.size,
      totalPlayers: this.state.playerIds.length,
    });

    this.logAction('matching_locked_in', { userId });

    logger.info({
      event: 'undercover_editor:match_locked_in',
      lobbyId: this.context.lobbyId,
      userId,
      lockedInCount: this.state.matchLockedIn.size,
      totalPlayers: this.state.playerIds.length,
    });

    this.checkReviewComplete();
  }

  // ─── Scoring ────────────────────────────────────────────────────────

  private computeScoring(): void {
    for (const uid of this.state.playerIds) {
      let score = 0;

      // Correct match: +UE_CORRECT_VOTE_BONUS per correct guess
      const guesses = this.state.matchGuesses.get(uid);
      if (guesses) {
        for (const [storyId, guessedEditorId] of guesses) {
          const story = this.state.stories.get(storyId);
          if (story && guessedEditorId === story.editorUserId) {
            score += UE_CORRECT_VOTE_BONUS;
          }
        }
      }

      // Editor bonus/penalty: sneaky editor wins big, caught editor gets consolation
      const editedStoryId = this.state.editorAssignments.get(uid);
      if (editedStoryId) {
        const wasCaught = this.wasEditorCaught(editedStoryId);
        score += wasCaught ? UE_EDITOR_LOSS : UE_EDITOR_MAJOR_WIN;
      }

      // Writer bonus/penalty: if the editor of YOUR story was sneaky, you benefit
      const ownedStory = this.state.stories.get(uid);
      if (ownedStory) {
        const wasCaught = this.wasEditorCaught(uid);
        score += wasCaught ? UE_WRITER_LOSS : UE_WRITER_MAJOR_WIN;
      }

      this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + score);
    }
  }

  /** Check if the majority of guessers correctly identified the editor for a story. */
  private wasEditorCaught(storyId: string): boolean {
    const story = this.state.stories.get(storyId);
    if (!story) return false;

    let correctGuesses = 0;
    let totalGuessers = 0;
    for (const [guesserId, guessMap] of this.state.matchGuesses) {
      // Skip the editor themselves (they can't vote on their own edited story)
      if (guesserId === story.editorUserId) continue;
      const guess = guessMap.get(storyId);
      if (guess) {
        totalGuessers++;
        if (guess === story.editorUserId) {
          correctGuesses++;
        }
      }
    }

    return totalGuessers > 0 && correctGuesses > totalGuessers / 2;
  }

  // ─── State Views ──────────────────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const timeRemaining = this.state.phaseEndsAt > 0
      ? Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000))
      : -1; // infinite

    const isEditor = this.state.editorAssignments.has(userId);
    const assignedStoryId = this.state.editorAssignments.get(userId) ?? null;
    const writeAssignment = this.state.writeAssignments.get(userId) ?? null;

    const base = {
      phase: this.state.phase,
      currentWriteRound: this.state.currentWriteRound,
      currentStep: this.state.currentStep,
      totalSteps: this.state.totalSteps,
      numPlayers: this.state.numPlayers,
      stories: this.buildAllStoryViews(),
      players: this.buildPlayerInfos(),
      timeRemaining,
      submittedCount: this.state.roundSubmissions.size,
      totalPlayers: this.state.playerIds.length,
      matchLockedIn: Array.from(this.state.matchLockedIn),
      myMatchGuesses: this.state.matchGuesses.get(userId)
        ? Object.fromEntries(this.state.matchGuesses.get(userId)!)
        : null,
      isMatchLockedIn: this.state.matchLockedIn.has(userId),
      readingStoryIndex: this.state.readingStoryIndex,
      readingSentenceIndex: this.state.readingSentenceIndex,
      myWriteAssignment: writeAssignment,
      mySubmission: this.state.roundSubmissions.get(userId) ?? null,
    };

    // Editor gets their assignment info; editable story only during EDIT phase
    if (isEditor && assignedStoryId) {
      return {
        ...base,
        assignedStoryId,
        ...(this.state.phase === 'EDIT'
          ? { editableStory: this.buildEditableStory(assignedStoryId) }
          : {}),
      };
    }

    return base;
  }

  getStateForSpectator(): unknown {
    // Spectators see everything including editor assignments and edits
    const storyReveals = this.buildStoryReveals();
    return {
      phase: this.state.phase,
      currentWriteRound: this.state.currentWriteRound,
      currentStep: this.state.currentStep,
      totalSteps: this.state.totalSteps,
      numPlayers: this.state.numPlayers,
      stories: this.buildAllStoryViews(),
      storyReveals,
      players: this.buildPlayerInfos(),
      readingStoryIndex: this.state.readingStoryIndex,
      readingSentenceIndex: this.state.readingSentenceIndex,
      isSpectator: true,
    };
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ───────────────────────

  handlePlayerJoin(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );

    logger.info({
      event: 'undercover_editor:player_join',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });
  }

  handlePlayerDisconnect(userId: string): void {
    // During EDIT, auto-complete the editor's edit if they disconnect
    if (this.state.phase === 'EDIT') {
      if (this.state.editorAssignments.has(userId) && !this.state.roundEditsDone.get(userId)) {
        this.state.roundEditsDone.set(userId, true);
        this.checkEditComplete();
      }
    }

    logger.info({
      event: 'undercover_editor:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });
  }

  handlePlayerReconnect(userId: string): void {
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForPlayer(userId),
    );

    logger.info({
      event: 'undercover_editor:player_reconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });
  }

  // ─── Results ────────────────────────────────────────────────────────

  computeResults(): MinigameResults {
    const duration = Date.now() - this.startedAt;

    const rankings: PlayerRanking[] = [];
    for (const uid of this.state.playerIds) {
      const player = this.context.players.get(uid);
      rankings.push({
        userId: uid,
        userName: player?.userName ?? 'Unknown',
        score: this.state.playerScores.get(uid) ?? 0,
        rank: 0,
        deltas: {},
      });
    }
    rankings.sort((a, b) => b.score - a.score);
    rankings.forEach((r, i) => { r.rank = i + 1; });

    const awards = this.computeAwards();

    return {
      rankings,
      awards,
      gameSpecificData: {
        storyReveals: this.buildStoryReveals(),
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Best Detective: player with the most correct matches
    let bestDetective: { userId: string; correct: number } | null = null;
    for (const [uid, guessMap] of this.state.matchGuesses) {
      let correct = 0;
      for (const [storyId, guessedId] of guessMap) {
        const story = this.state.stories.get(storyId);
        if (story && guessedId === story.editorUserId) correct++;
      }
      if (!bestDetective || correct > bestDetective.correct) {
        bestDetective = { userId: uid, correct };
      }
    }
    if (bestDetective && bestDetective.correct > 0) {
      awards.push({
        userId: bestDetective.userId,
        title: 'Best Detective',
        description: `Correctly identified ${bestDetective.correct} editor(s)`,
        icon: 'search',
      });
    }

    // Master of Disguise: editor who fooled the most players
    let bestDisguise: { userId: string; fooledCount: number } | null = null;
    for (const [editorId, storyId] of this.state.editorAssignments) {
      let fooledCount = 0;
      for (const [guesserId, guessMap] of this.state.matchGuesses) {
        if (guesserId === editorId) continue;
        const guess = guessMap.get(storyId);
        if (guess && guess !== editorId) fooledCount++;
      }
      if (!bestDisguise || fooledCount > bestDisguise.fooledCount) {
        bestDisguise = { userId: editorId, fooledCount };
      }
    }
    if (bestDisguise && bestDisguise.fooledCount > 0) {
      awards.push({
        userId: bestDisguise.userId,
        title: 'Master of Disguise',
        description: `Fooled ${bestDisguise.fooledCount} player(s) as editor`,
        icon: 'mask',
      });
    }

    // Prolific Writer: player who wrote the most total characters
    let prolificWriter: { userId: string; charCount: number } | null = null;
    const charCounts = new Map<string, number>();
    for (const story of this.state.stories.values()) {
      for (const sentence of story.sentences) {
        const current = charCounts.get(sentence.authorUserId) ?? 0;
        charCounts.set(sentence.authorUserId, current + sentence.originalText.length);
      }
    }
    for (const [uid, count] of charCounts) {
      if (!prolificWriter || count > prolificWriter.charCount) {
        prolificWriter = { userId: uid, charCount: count };
      }
    }
    if (prolificWriter && prolificWriter.charCount > 0) {
      awards.push({
        userId: prolificWriter.userId,
        title: 'Prolific Writer',
        description: `Wrote ${prolificWriter.charCount} characters across all stories`,
        icon: 'pen-tool',
      });
    }

    return awards;
  }

  // ─── Force End ──────────────────────────────────────────────────────

  forceEnd(reason: string): void {
    if (this.state.phase === 'READING') {
      // Host forcing READING to end — skip to REVIEW
      logger.info({
        event: 'undercover_editor:force_end_reading',
        lobbyId: this.context.lobbyId,
        reason,
      });
      this.startReviewPhase();
    } else if (this.state.phase === 'REVIEW') {
      // Host forcing REVIEW to end — skip to REVEAL
      logger.info({
        event: 'undercover_editor:force_end_review',
        lobbyId: this.context.lobbyId,
        reason,
      });
      this.startRevealPhase();
    } else {
      this.cleanup();
      this.context.onComplete(this.computeResults());
    }
  }

  // ─── Helper: Action Log ─────────────────────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.actionLog.push({
      type,
      payload,
      timestamp: Date.now(),
    });
  }

  private buildGameLog(): Record<string, unknown> {
    const players = Array.from(this.context.players.entries()).map(([userId, p]) => ({
      userId,
      userName: p.userName,
    }));

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      numPlayers: this.state.numPlayers,
      totalSteps: this.state.totalSteps,
      playerCount: this.context.players.size,
      players,
      actions: this.actionLog,
      finalResults: this.state.playerIds.map((uid) => ({
        userId: uid,
        userName: this.context.players.get(uid)?.userName ?? 'Unknown',
        score: this.state.playerScores.get(uid) ?? 0,
      })),
    };
  }

  // ─── Helper: Error Feedback ───────────────────────────────────────────────

  private sendError(userId: string, message: string): void {
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_ERROR',
      message,
    });
  }

  // ─── Helper: Add Sentence to Story ────────────────────────────────────────

  private addSentenceToStory(storyId: string, authorUserId: string, text: string): void {
    const story = this.state.stories.get(storyId);
    if (!story) return;

    const player = this.context.players.get(authorUserId);
    const words = text.split(/\s+/).filter(Boolean);

    const sentence: StorySentence = {
      authorUserId,
      authorName: player?.userName ?? 'Unknown',
      text,
      originalText: text,
      roundNumber: this.state.currentWriteRound,
      words,
    };

    story.sentences.push(sentence);
  }

  // ─── Helper: Build Views ──────────────────────────────────────────────────

  private buildAllStoryViews(): StoryView[] {
    const views: StoryView[] = [];
    for (const story of this.state.stories.values()) {
      views.push({
        storyId: story.storyId,
        ownerName: story.ownerName,
        prompt: story.prompt,
        sentences: story.sentences.map((s): StorySentenceView => ({
          authorName: s.authorName,
          text: s.text,
          roundNumber: s.roundNumber,
        })),
      });
    }
    return views;
  }

  private buildEditableStory(storyId: string): EditableStory | null {
    const story = this.state.stories.get(storyId);
    if (!story || story.sentences.length === 0) return null;

    // Only the most recent sentence is editable
    const lastIndex = story.sentences.length - 1;
    const lastSentence = story.sentences[lastIndex];

    const editableSentence: EditableSentence = {
      authorName: lastSentence.authorName,
      sentenceIndex: lastIndex,
      words: lastSentence.words.map((word, index): EditableWord => ({
        word,
        index,
      })),
    };

    return {
      storyId: story.storyId,
      ownerName: story.ownerName,
      prompt: story.prompt,
      editableSentence,
      sentences: story.sentences.map((s): StorySentenceView => ({
        authorName: s.authorName,
        text: s.text,
        roundNumber: s.roundNumber,
      })),
    };
  }

  private buildStoryReveals(): StoryRevealInfo[] {
    const reveals: StoryRevealInfo[] = [];
    for (const story of this.state.stories.values()) {
      const editorPlayer = this.context.players.get(story.editorUserId);
      reveals.push({
        storyId: story.storyId,
        ownerName: story.ownerName,
        editorUserId: story.editorUserId,
        editorName: editorPlayer?.userName ?? 'Unknown',
        edits: story.edits.map((e): WordEditView => {
          const sentence = story.sentences[e.sentenceIndex];
          return {
            storyId: story.storyId,
            sentenceIndex: e.sentenceIndex,
            sentenceAuthor: sentence?.authorName ?? 'Unknown',
            originalWord: e.originalWord,
            newWord: e.newWord,
            editedOnRound: e.editedOnRound,
          };
        }),
        sentences: story.sentences.map((s): StorySentenceView => ({
          authorName: s.authorName,
          text: s.text,
          roundNumber: s.roundNumber,
        })),
      });
    }
    return reveals;
  }

  private buildScoreResults(): ScoreResult[] {
    return this.state.playerIds.map((uid) => {
      const player = this.context.players.get(uid);
      return {
        userId: uid,
        userName: player?.userName ?? 'Unknown',
        score: this.state.playerScores.get(uid) ?? 0,
        breakdown: {},
      };
    });
  }

  private buildPlayerInfos(): PlayerInfo[] {
    return this.state.playerIds.map((uid) => {
      const player = this.context.players.get(uid);
      return {
        userId: uid,
        userName: player?.userName ?? 'Unknown',
      };
    });
  }

  private broadcastAllStories(): void {
    this.broadcastGameAction({
      type: 'UE_STORIES_UPDATED',
      stories: this.buildAllStoryViews(),
    });
  }

  private broadcastSubmissionProgress(): void {
    this.context.broadcastAction({
      type: 'UE_SUBMISSION_PROGRESS',
      payload: {
        submittedCount: this.state.roundSubmissions.size,
        totalPlayers: this.state.playerIds.length,
      },
    });
  }
}
