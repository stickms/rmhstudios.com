/**
 * RMHbox — Undercover Editor Minigame Server Handler (Parallel Design)
 *
 * All players write sentences for ALL stories simultaneously each round.
 * Each player is secretly assigned as the "undercover editor" of exactly
 * one other player's story. After writing rounds, editors secretly edit
 * their assigned story. Players then review all completed stories and
 * try to match each story with its undercover editor.
 *
 * Phases:
 *   WRITE → EDIT → (repeat for N rounds) → REVIEW → REVEAL
 *
 * Key differences from the old sequential design:
 *   - N stories in parallel (one per player)
 *   - All players write on every round
 *   - Players can unsubmit/re-edit within the write timer
 *   - REVIEW is infinite-time (host or all-locked-in advances)
 *   - Players match stories to editors (not a single vote)
 *
 * Join-in-progress policy: spectate_only
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §2
 */

import { BaseMinigame } from '../base-minigame';
import type { MinigameContext, MinigameResults } from '../base-minigame';
import type { PlayerRanking, Award } from '@/lib/rmhbox/types';
import {
  loadPrompts,
  loadKeywords,
  selectPromptForGame,
  selectKeywordForGame,
} from '@/lib/rmhbox/undercover-editor/data-loader';
import {
  WriteSentenceSchema,
  UnsubmitSentenceSchema,
  EditWordSchema,
  SkipEditSchema,
  SubmitMatchingSchema,
  LockInMatchingSchema,
} from '@/lib/rmhbox/undercover-editor/schemas';
import type { StoryPrompt, Keyword } from '@/lib/rmhbox/undercover-editor/schemas';
import {
  UE_ROTATIONS,
  UE_WRITE_TIMEOUT_SECONDS,
  UE_EDIT_TIMEOUT_SECONDS,
  UE_REVEAL_DURATION_SECONDS,
  UE_CORRECT_VOTE_BONUS,
  UE_KEYWORD_PROXIMITY_BONUS,
  UE_KEYWORD_FUZZY_THRESHOLD,
  UE_EDITOR_MAJOR_WIN,
  UE_EDITOR_LOSS,
  UE_WRITER_MAJOR_WIN,
  UE_WRITER_LOSS,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import Fuse from 'fuse.js';
import type {
  UEPhase,
  StorySentence,
  ParallelStory,
  UndercoverEditorState,
  StorySentenceView,
  EditableStory,
  EditableWord,
  StoryView,
  WordEditView,
  StoryRevealInfo,
  ScoreResult,
  PlayerInfo,
  GameLogAction,
} from './types';

// ─── Helpers ─────────────────────────────────────────────────────

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

// ─── Undercover Editor Minigame (Parallel) ───────────────────────

export class UndercoverEditorGame extends BaseMinigame {
  private promptPool: StoryPrompt[];
  private keywordPool: Keyword[];
  private usedPromptIndices: Set<number> = new Set();
  private usedKeywordIndices: Set<number> = new Set();
  private state!: UndercoverEditorState;
  private startedAt: number = 0;
  private actionLog: GameLogAction[] = [];

  constructor(context: MinigameContext) {
    super(context);
    this.promptPool = loadPrompts();
    this.keywordPool = loadKeywords();
  }

  /**
   * Spectator mode: shared-privileged — all spectators see the same
   * omniscient state (editor identity, keywords, edit history all visible).
   */
  get spectatorMode(): 'shared-privileged' {
    return 'shared-privileged';
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const rotations = this.getSetting('rotations', UE_ROTATIONS);
    const playerIds = Array.from(this.context.players.keys());
    shuffleArray(playerIds);

    // Select one prompt and one keyword per story (one story per player)
    const stories = new Map<string, ParallelStory>();
    const editorAssignments = new Map<string, string>();

    // Create a cyclic editor assignment: player i edits player (i+1 mod N)'s story
    // This ensures each player edits exactly one story and no one edits their own
    for (let i = 0; i < playerIds.length; i++) {
      const ownerId = playerIds[i];
      const editorId = playerIds[(i + 1) % playerIds.length];
      const ownerPlayer = this.context.players.get(ownerId);

      const prompt = selectPromptForGame(this.promptPool, this.usedPromptIndices);
      this.usedPromptIndices.add(prompt.poolIndex);
      const keyword = selectKeywordForGame(this.keywordPool, this.usedKeywordIndices);
      this.usedKeywordIndices.add(keyword.poolIndex);

      stories.set(ownerId, {
        storyId: ownerId,
        prompt: prompt.text,
        ownerUserId: ownerId,
        ownerName: ownerPlayer?.userName ?? 'Unknown',
        keyword: keyword.word,
        editorUserId: editorId,
        sentences: [],
        edits: [],
        editedWordPositions: new Set(),
        keywordInStory: false,
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
      totalRounds: rotations,
      currentRound: 0,
      phase: 'SETUP' as UEPhase,
      stories,
      editorAssignments,
      roundSubmissions: new Map(),
      roundEditsDone: new Map(),
      matchGuesses: new Map(),
      matchLockedIn: new Set(),
      playerScores,
      phaseStartedAt: now,
      phaseEndsAt: now,
    };

    logger.info({
      event: 'undercover_editor:start',
      lobbyId: this.context.lobbyId,
      playerCount: playerIds.length,
      totalRounds: rotations,
      storyCount: stories.size,
    });

    // Build player info array for broadcasts
    const playerInfos = this.buildPlayerInfos();

    // Broadcast game start to all — includes list of story prompts (no secret info)
    const storyList = Array.from(stories.values()).map((s) => ({
      storyId: s.storyId,
      ownerName: s.ownerName,
      prompt: s.prompt,
    }));

    this.broadcastGameAction({
      type: 'UE_GAME_START',
      stories: storyList,
      players: playerInfos,
      totalRounds: rotations,
    });

    // Send role assignments individually — each editor learns their story + keyword
    for (const uid of playerIds) {
      const assignedStoryId = editorAssignments.get(uid);
      if (assignedStoryId) {
        const story = stories.get(assignedStoryId)!;
        this.context.sendToPlayer(uid, 'rmhbox:game:action', {
          type: 'UE_ROLE_ASSIGNED',
          role: 'editor',
          assignedStoryId,
          keyword: story.keyword,
          storyOwnerName: story.ownerName,
        });
      }
    }

    this.startWritePhase();
  }

  // ─── Phase: WRITE ──────────────────────────────────────────────

  private startWritePhase(): void {
    if (!this.isRunning) return;

    this.state.currentRound++;
    if (this.state.currentRound > this.state.totalRounds) {
      this.startReviewPhase();
      return;
    }

    this.state.phase = 'WRITE';
    const writeTimeout = this.getSetting('writeTimeout', UE_WRITE_TIMEOUT_SECONDS);
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + writeTimeout * 1000;

    // Reset per-round submissions
    this.state.roundSubmissions = new Map();
    for (const storyId of this.state.stories.keys()) {
      this.state.roundSubmissions.set(storyId, new Map());
    }

    this.broadcastRound(this.state.currentRound, this.state.totalRounds);

    this.logAction('round_start', {
      round: this.state.currentRound,
    });

    logger.info({
      event: 'undercover_editor:write_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      writeTimeout,
    });

    this.broadcastGameAction({
      type: 'UE_WRITE_START',
      round: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      writeDurationSeconds: writeTimeout,
    });

    this.startPhaseTimer(writeTimeout);
    this.setTimeout(() => this.endWritePhase(), writeTimeout * 1000);
  }

  /** Called when write timer expires or all players have submitted for all stories. */
  private endWritePhase(): void {
    if (!this.isRunning || this.state.phase !== 'WRITE') return;
    this.clearPhaseTimer();

    // Add all submitted sentences to their stories, and default "..." for missing ones
    for (const [storyId, submissions] of this.state.roundSubmissions) {
      for (const uid of this.state.playerIds) {
        const player = this.context.players.get(uid);
        const authorName = player?.userName ?? 'Unknown';
        const text = submissions.get(uid) ?? '...';
        this.addSentenceToStory(storyId, uid, authorName, text);
      }
    }

    // Broadcast updated stories to all
    this.broadcastAllStories();

    logger.info({
      event: 'undercover_editor:write_end',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
    });

    this.startEditPhase();
  }

  /** Check if all players submitted for all stories; if so, end WRITE early. */
  private checkWriteComplete(): void {
    for (const [, submissions] of this.state.roundSubmissions) {
      if (submissions.size < this.state.playerIds.length) return;
    }
    // All players submitted for all stories — end early
    this.endWritePhase();
  }

  // ─── Phase: EDIT ──────────────────────────────────────────────

  private startEditPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'EDIT';
    const editTimeout = this.getSetting('editTimeout', UE_EDIT_TIMEOUT_SECONDS);
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + editTimeout * 1000;

    // Reset edit completion tracking
    this.state.roundEditsDone = new Map();
    for (const storyId of this.state.stories.keys()) {
      this.state.roundEditsDone.set(storyId, false);
    }

    logger.info({
      event: 'undercover_editor:edit_start',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      editTimeout,
    });

    // Broadcast EDIT phase start to all — writers see waiting state
    this.broadcastGameAction({
      type: 'UE_EDIT_START',
      round: this.state.currentRound,
      editDurationSeconds: editTimeout,
    });

    // Send editable story to each editor
    for (const [editorId, storyId] of this.state.editorAssignments) {
      const editorPlayer = this.context.players.get(editorId);
      if (!editorPlayer || !editorPlayer.isConnected) {
        // Auto-skip for disconnected editors
        this.state.roundEditsDone.set(storyId, true);
        continue;
      }
      this.context.sendToPlayer(editorId, 'rmhbox:game:action', {
        type: 'UE_EDIT_PROMPT',
        story: this.buildEditableStory(storyId),
        editDurationSeconds: editTimeout,
      });
    }

    this.startPhaseTimer(editTimeout);
    this.setTimeout(() => this.endEditPhase(), editTimeout * 1000);

    // Check if all editors are disconnected (auto-complete)
    this.checkEditComplete();
  }

  /** Called when edit timer expires or all editors have completed. */
  private endEditPhase(): void {
    if (!this.isRunning || this.state.phase !== 'EDIT') return;
    this.clearPhaseTimer();

    // Broadcast updated stories after edits
    this.broadcastAllStories();

    logger.info({
      event: 'undercover_editor:edit_end',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
    });

    // Next round or review
    this.startWritePhase();
  }

  /** Check if all editors have completed their edits. */
  private checkEditComplete(): void {
    for (const [, done] of this.state.roundEditsDone) {
      if (!done) return;
    }
    this.endEditPhase();
  }

  // ─── Phase: REVIEW (Infinite Time) ────────────────────────────

  private startReviewPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'REVIEW';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = 0; // infinite

    // Detect keywords in stories
    for (const [storyId, story] of this.state.stories) {
      story.keywordInStory = this.checkKeywordInStory(storyId);
    }

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

    // Broadcast all stories for review + player list for matching
    const allStories = this.buildAllStoryViews();
    const playerInfos = this.buildPlayerInfos();

    this.broadcastGameAction({
      type: 'UE_REVIEW_START',
      stories: allStories,
      players: playerInfos,
    });

    // Use infinite phase timer — host or all-locked-in advances
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

  // ─── Phase: REVEAL ────────────────────────────────────────────

  private startRevealPhase(): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    this.state.phase = 'REVEAL';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + UE_REVEAL_DURATION_SECONDS * 1000;

    // Score the game
    this.computeScoring();

    // Build reveal data
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
        keywordInStory: s.keywordInStory,
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
    this.setTimeout(() => this.endGame(), UE_REVEAL_DURATION_SECONDS * 1000);
  }

  // ─── End Game ─────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;
    this.cleanup();

    logger.info({
      event: 'undercover_editor:game_end',
      lobbyId: this.context.lobbyId,
    });

    this.context.onComplete(this.computeResults());
  }

  // ─── Input Handling ───────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    switch (action) {
      case 'WRITE_SENTENCE':
        this.handleWriteSentence(userId, data);
        break;
      case 'UNSUBMIT_SENTENCE':
        this.handleUnsubmitSentence(userId, data);
        break;
      case 'EDIT_WORD':
        this.handleEditWord(userId, data);
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
      default:
        logger.warn({
          event: 'undercover_editor:unknown_action',
          lobbyId: this.context.lobbyId,
          userId,
          action,
        });
    }
  }

  // ─── WRITE Handlers ───────────────────────────────────────────

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
    const story = this.state.stories.get(storyId);
    if (!story) {
      this.sendError(userId, 'Invalid story ID');
      return;
    }

    if (!this.state.playerIds.includes(userId)) {
      this.sendError(userId, 'Not a game participant');
      return;
    }

    const submissions = this.state.roundSubmissions.get(storyId);
    if (!submissions) return;

    const sanitized = sanitizeString(text).trim();
    submissions.set(userId, sanitized);

    const player = this.context.players.get(userId);
    const authorName = player?.userName ?? 'Unknown';

    // Confirm submission to the player
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_SENTENCE_CONFIRMED',
      storyId,
      text: sanitized,
    });

    // Broadcast progress (how many have submitted for each story)
    this.broadcastSubmissionProgress();

    this.logAction('sentence_submitted', {
      userId,
      authorName,
      storyId,
      textLength: sanitized.length,
    });

    // Check if all submissions are complete
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
    const submissions = this.state.roundSubmissions.get(storyId);
    if (!submissions) return;

    // Check that not ALL players have submitted for ALL stories already
    // (if they have, the phase would have ended — but guard just in case)
    let allComplete = true;
    for (const [, subs] of this.state.roundSubmissions) {
      if (subs.size < this.state.playerIds.length) {
        allComplete = false;
        break;
      }
    }
    if (allComplete) {
      this.sendError(userId, 'Cannot unsubmit — all submissions are in');
      return;
    }

    // Remove the submission
    if (submissions.has(userId)) {
      submissions.delete(userId);

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

  // ─── EDIT Handlers ────────────────────────────────────────────

  private handleEditWord(userId: string, data: unknown): void {
    if (this.state.phase !== 'EDIT') {
      this.sendError(userId, 'Not in EDIT phase');
      return;
    }

    const parsed = EditWordSchema.safeParse(data);
    if (!parsed.success) {
      this.sendError(userId, 'Invalid edit');
      return;
    }

    const { storyId, sentenceIndex, wordIndex, newWord } = parsed.data;

    // Verify this user is the editor for this story
    const assignedStoryId = this.state.editorAssignments.get(userId);
    if (assignedStoryId !== storyId) {
      this.sendError(userId, 'Not the editor for this story');
      return;
    }

    const story = this.state.stories.get(storyId);
    if (!story) return;

    const sentence = story.sentences[sentenceIndex];
    if (!sentence) {
      this.sendError(userId, 'Invalid sentence index');
      return;
    }

    if (wordIndex < 0 || wordIndex >= sentence.words.length) {
      this.sendError(userId, 'Invalid word index');
      return;
    }

    const posKey = `${sentenceIndex}:${wordIndex}`;
    if (story.editedWordPositions.has(posKey)) {
      this.sendError(userId, 'Position already edited');
      return;
    }

    // Apply the edit
    const originalWord = sentence.words[wordIndex];
    sentence.words[wordIndex] = sanitizeString(newWord);
    sentence.text = sentence.words.join(' ');
    story.editedWordPositions.add(posKey);
    story.edits.push({
      sentenceIndex,
      wordIndex,
      originalWord,
      newWord: sanitizeString(newWord),
      editedOnTurn: this.state.currentRound,
    });

    this.logAction('edit_applied', {
      userId,
      storyId,
      sentenceIndex,
      originalWord,
      newWord,
    });

    logger.info({
      event: 'undercover_editor:edit_applied',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      storyId,
      sentenceIndex,
      originalWord,
      newWord,
    });

    // Mark this editor as done
    this.state.roundEditsDone.set(storyId, true);

    // Send updated editable story back to editor
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_EDIT_CONFIRMED',
      storyId,
      story: this.buildEditableStory(storyId),
    });

    this.checkEditComplete();
  }

  private handleSkipEdit(userId: string, data: unknown): void {
    if (this.state.phase !== 'EDIT') {
      this.sendError(userId, 'Not in EDIT phase');
      return;
    }

    void SkipEditSchema.safeParse(data); // Validate but no fields needed

    const assignedStoryId = this.state.editorAssignments.get(userId);
    if (!assignedStoryId) {
      this.sendError(userId, 'Not an editor');
      return;
    }

    this.state.roundEditsDone.set(assignedStoryId, true);

    this.logAction('edit_skipped', {
      userId,
      storyId: assignedStoryId,
      round: this.state.currentRound,
    });

    logger.info({
      event: 'undercover_editor:edit_skipped',
      lobbyId: this.context.lobbyId,
      round: this.state.currentRound,
      storyId: assignedStoryId,
    });

    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_EDIT_CONFIRMED',
      storyId: assignedStoryId,
      skipped: true,
    });

    this.checkEditComplete();
  }

  // ─── REVIEW Handlers ──────────────────────────────────────────

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

    // Store guesses (can be updated until locked in)
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

  // ─── Scoring ──────────────────────────────────────────────────

  private computeScoring(): void {
    // For each player, award points based on correct matches
    for (const uid of this.state.playerIds) {
      let score = 0;
      const guesses = this.state.matchGuesses.get(uid);
      if (guesses) {
        for (const [storyId, guessedEditorId] of guesses) {
          const story = this.state.stories.get(storyId);
          if (story && guessedEditorId === story.editorUserId) {
            score += UE_CORRECT_VOTE_BONUS;
          }
        }
      }

      // Bonus for being a good editor (keyword proximity)
      const editorStoryId = this.state.editorAssignments.get(uid);
      if (editorStoryId) {
        const story = this.state.stories.get(editorStoryId);
        if (story) {
          if (story.keywordInStory) {
            score += UE_KEYWORD_PROXIMITY_BONUS;
          }
        }
      }

      // Award points: editor who wasn't caught gets bonus, editor who was caught loses
      const myStoryId = this.state.editorAssignments.get(uid);
      if (myStoryId) {
        const wasCaught = this.wasEditorCaught(myStoryId);
        if (!wasCaught) {
          score += UE_EDITOR_MAJOR_WIN;
        } else {
          score += UE_EDITOR_LOSS;
        }
      }

      // Award points for story quality (how many people got your story's editor wrong)
      // This rewards writers whose stories had well-hidden editors
      const ownedStoryId = uid;
      const ownedStory = this.state.stories.get(ownedStoryId);
      if (ownedStory) {
        let fooledCount = 0;
        for (const [guesserId, guessMap] of this.state.matchGuesses) {
          if (guesserId === uid) continue; // Skip self
          const guessedEditor = guessMap.get(ownedStoryId);
          if (guessedEditor && guessedEditor !== ownedStory.editorUserId) {
            fooledCount++;
          }
        }
        // Story owner gets bonus if their editor was sneaky
        if (fooledCount > 0) {
          score += UE_WRITER_MAJOR_WIN;
        } else {
          score += UE_WRITER_LOSS;
        }
      }

      this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + score);
    }
  }

  /** Check if the majority of players correctly identified the editor for a story. */
  private wasEditorCaught(storyId: string): boolean {
    const story = this.state.stories.get(storyId);
    if (!story) return false;

    let correctGuesses = 0;
    let totalGuessers = 0;
    for (const [guesserId, guessMap] of this.state.matchGuesses) {
      // Skip the editor themselves
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

  // ─── State Views ──────────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const timeRemaining = this.state.phaseEndsAt > 0
      ? Math.max(0, Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000))
      : -1; // infinite

    const isEditor = this.state.editorAssignments.has(userId);
    const assignedStoryId = this.state.editorAssignments.get(userId) ?? null;

    // Build submission progress (for WRITE phase)
    const submissionProgress: Record<string, number> = {};
    for (const [storyId, subs] of this.state.roundSubmissions) {
      submissionProgress[storyId] = subs.size;
    }

    // Build list of my submitted stories
    const mySubmissions: Record<string, string> = {};
    for (const [storyId, subs] of this.state.roundSubmissions) {
      const sub = subs.get(userId);
      if (sub) mySubmissions[storyId] = sub;
    }

    const base = {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      stories: this.buildAllStoryViews(),
      players: this.buildPlayerInfos(),
      timeRemaining,
      submissionProgress,
      mySubmissions,
      totalPlayers: this.state.playerIds.length,
      matchLockedIn: Array.from(this.state.matchLockedIn),
      myMatchGuesses: this.state.matchGuesses.get(userId)
        ? Object.fromEntries(this.state.matchGuesses.get(userId)!)
        : null,
      isMatchLockedIn: this.state.matchLockedIn.has(userId),
    };

    if (isEditor && assignedStoryId) {
      const story = this.state.stories.get(assignedStoryId);
      return {
        ...base,
        assignedStoryId,
        keyword: story?.keyword ?? null,
        myEdits: story?.edits ?? [],
        ...(this.state.phase === 'EDIT'
          ? { editableStory: this.buildEditableStory(assignedStoryId) }
          : {}),
      };
    }

    return base;
  }

  getStateForSpectator(): unknown {
    // Spectators see everything
    const storyReveals = this.buildStoryReveals();
    return {
      phase: this.state.phase,
      currentRound: this.state.currentRound,
      totalRounds: this.state.totalRounds,
      stories: this.buildAllStoryViews(),
      storyReveals,
      players: this.buildPlayerInfos(),
      isSpectator: true,
    };
  }

  // ─── Join-in-Progress / Reconnection ──────────────────────────

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
      const assignedStoryId = this.state.editorAssignments.get(userId);
      if (assignedStoryId && !this.state.roundEditsDone.get(assignedStoryId)) {
        this.state.roundEditsDone.set(assignedStoryId, true);
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

  // ─── Results ──────────────────────────────────────────────────

  computeResults(): MinigameResults {
    const duration = Date.now() - this.startedAt;

    // Build rankings sorted by score desc
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

    // Awards
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
        icon: '🔍',
      });
    }

    // Sneakiest Editor: editor who fooled the most people
    let sneakiest: { userId: string; fooled: number } | null = null;
    for (const [editorId, storyId] of this.state.editorAssignments) {
      let fooled = 0;
      for (const [guesserId, guessMap] of this.state.matchGuesses) {
        if (guesserId === editorId) continue;
        const guess = guessMap.get(storyId);
        if (guess && guess !== editorId) fooled++;
      }
      if (!sneakiest || fooled > sneakiest.fooled) {
        sneakiest = { userId: editorId, fooled };
      }
    }
    if (sneakiest && sneakiest.fooled > 0) {
      awards.push({
        userId: sneakiest.userId,
        title: 'Sneakiest Editor',
        description: `Fooled ${sneakiest.fooled} player(s)`,
        icon: '🥷',
      });
    }

    return {
      rankings,
      awards,
      gameSpecificData: {
        gameLog: this.actionLog,
        storyCount: this.state.stories.size,
        totalRounds: this.state.totalRounds,
      },
      duration,
    };
  }

  // ─── Helper: Add Sentence to Story ────────────────────────────

  private addSentenceToStory(storyId: string, authorId: string, authorName: string, text: string): void {
    const story = this.state.stories.get(storyId);
    if (!story) return;

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentence: StorySentence = {
      authorUserId: authorId,
      authorName,
      text,
      originalText: text,
      turnNumber: this.state.currentRound,
      words,
    };
    story.sentences.push(sentence);
  }

  // ─── Helper: Broadcast ────────────────────────────────────────

  private broadcastAllStories(): void {
    this.broadcastGameAction({
      type: 'UE_STORIES_UPDATED',
      stories: this.buildAllStoryViews(),
    });
  }

  private broadcastSubmissionProgress(): void {
    const progress: Record<string, number> = {};
    for (const [storyId, subs] of this.state.roundSubmissions) {
      progress[storyId] = subs.size;
    }
    this.context.broadcastAction({
      type: 'UE_SUBMISSION_PROGRESS',
      payload: {
        progress,
        totalPlayers: this.state.playerIds.length,
      },
    });
  }

  private sendError(userId: string, message: string): void {
    this.context.sendToPlayer(userId, 'rmhbox:game:action', {
      type: 'UE_ERROR',
      message,
    });
  }

  // ─── Helper: Build Views ──────────────────────────────────────

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
          turnNumber: s.turnNumber,
        })),
      });
    }
    return views;
  }

  private buildEditableStory(storyId: string): EditableStory | null {
    const story = this.state.stories.get(storyId);
    if (!story) return null;

    return {
      storyId: story.storyId,
      ownerName: story.ownerName,
      prompt: story.prompt,
      keyword: story.keyword,
      sentences: story.sentences.map((sentence, si) => ({
        authorName: sentence.authorName,
        words: sentence.words.map((word, wi): EditableWord => {
          const posKey = `${si}:${wi}`;
          const alreadyEdited = story.editedWordPositions.has(posKey);
          return {
            word,
            index: wi,
            sentenceIndex: si,
            isEditable: !alreadyEdited,
          };
        }),
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
        keyword: story.keyword,
        keywordInStory: story.keywordInStory,
        edits: story.edits.map((e): WordEditView => {
          const sentence = story.sentences[e.sentenceIndex];
          return {
            storyId: story.storyId,
            sentenceIndex: e.sentenceIndex,
            sentenceAuthor: sentence?.authorName ?? 'Unknown',
            originalWord: e.originalWord,
            newWord: e.newWord,
            editedOnTurn: e.editedOnTurn,
          };
        }),
        sentences: story.sentences.map((s): StorySentenceView => ({
          authorName: s.authorName,
          text: s.text,
          turnNumber: s.turnNumber,
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

  // ─── Helper: Keyword Detection ────────────────────────────────

  private checkKeywordInStory(storyId: string): boolean {
    const story = this.state.stories.get(storyId);
    if (!story) return false;

    const keyword = story.keyword.toLowerCase();
    const allText = story.sentences.map((s) => s.text).join(' ').toLowerCase();

    // Exact match check
    if (allText.includes(keyword)) return true;

    // Fuzzy match check using Fuse.js
    const words = allText.split(/\s+/);
    const fuse = new Fuse(words.map((w) => ({ word: w })), {
      keys: ['word'],
      threshold: UE_KEYWORD_FUZZY_THRESHOLD,
      includeScore: true,
    });
    const results = fuse.search(keyword);
    return results.some((r) => (r.score ?? 1) <= UE_KEYWORD_FUZZY_THRESHOLD);
  }

  // ─── Helper: Force End (host skip in REVIEW) ──────────────────

  forceEnd(reason: string): void {
    if (this.state.phase === 'REVIEW') {
      // Host is forcing the review to end — go to reveal
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

  // ─── Helper: Action Log ───────────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.actionLog.push({
      type,
      payload,
      timestamp: Date.now(),
    });
  }
}
