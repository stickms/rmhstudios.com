/**
 * RMHbox — Undercover Editor Minigame Server Handler
 *
 * Collaborative storytelling with a hidden saboteur. Players take turns
 * adding one sentence to a shared story. One player is secretly the
 * **Editor** — they can subtly change one word in any previous sentence
 * on each turn. The Editor wins if the keyword ends up in the story
 * without the Writers catching them; the Writers win if they correctly
 * identify the Editor via a vote.
 *
 * Phases per turn:
 *   WRITE → EDIT (Editor only) → (next turn or REVIEW → ACCUSATION → REVEAL)
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
  EditWordSchema,
  SkipEditSchema,
  CastAccusationSchema,
} from '@/lib/rmhbox/undercover-editor/schemas';
import type { StoryPrompt, Keyword } from '@/lib/rmhbox/undercover-editor/schemas';
import {
  UE_MIN_PLAYERS,
  UE_ROTATIONS,
  UE_WRITE_TIMEOUT_SECONDS,
  UE_EDIT_TIMEOUT_SECONDS,
  UE_REVIEW_DURATION_SECONDS,
  UE_ACCUSATION_DURATION_SECONDS,
  UE_REVEAL_DURATION_SECONDS,
  UE_DISCONNECT_TURN_WAIT_SECONDS,
  UE_WRITER_MAJOR_WIN,
  UE_WRITER_MINOR_WIN,
  UE_WRITER_LOSS,
  UE_WRITER_MINOR_LOSS,
  UE_EDITOR_MAJOR_WIN,
  UE_EDITOR_MINOR_WIN,
  UE_EDITOR_PARTIAL,
  UE_EDITOR_LOSS,
  UE_CORRECT_VOTE_BONUS,
  UE_KEYWORD_PROXIMITY_BONUS,
  UE_KEYWORD_FUZZY_THRESHOLD,
} from '@/lib/rmhbox/constants';
import { logger } from '../../logger';
import Fuse from 'fuse.js';
import type {
  UEPhase,
  StorySentence,
  WordEdit,
  UndercoverEditorState,
  StorySentenceView,
  EditableStory,
  EditableWord,
  WordEditView,
  VoteResult,
  ScoreResult,
  PlayerTurnInfo,
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

// ─── Undercover Editor Minigame ──────────────────────────────────

export class UndercoverEditorGame extends BaseMinigame {
  private promptPool: StoryPrompt[];
  private keywordPool: Keyword[];
  private usedPromptIds: Set<string> = new Set();
  private usedKeywordIds: Set<string> = new Set();
  private state!: UndercoverEditorState;
  private startedAt: number = 0;
  private actionLog: GameLogAction[] = [];
  private writeTimeoutHandle: NodeJS.Timeout | null = null;
  private editTimeoutHandle: NodeJS.Timeout | null = null;
  private disconnectWaitHandle: NodeJS.Timeout | null = null;

  constructor(context: MinigameContext) {
    super(context);
    this.promptPool = loadPrompts();
    this.keywordPool = loadKeywords();
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  start(): void {
    this.isRunning = true;
    this.startedAt = Date.now();

    const rotations = this.getSetting('rotations', UE_ROTATIONS);

    // Select prompt and keyword
    const prompt = selectPromptForGame(this.promptPool, this.usedPromptIds);
    this.usedPromptIds.add(prompt.id);
    const keyword = selectKeywordForGame(this.keywordPool, this.usedKeywordIds);
    this.usedKeywordIds.add(keyword.id);

    // Build turn order (shuffled player IDs)
    const playerIds = Array.from(this.context.players.keys());
    shuffleArray(playerIds);

    // Select Editor: not first or last position
    const editorSlot =
      playerIds.length <= 2
        ? 0
        : 1 + Math.floor(Math.random() * (playerIds.length - 2));
    const editorUserId = playerIds[editorSlot];

    const totalTurns = playerIds.length * rotations;

    // Initialize scores
    const playerScores = new Map<string, number>();
    for (const uid of playerIds) {
      playerScores.set(uid, 0);
    }

    const now = Date.now();
    this.state = {
      storyPrompt: prompt.text,
      keyword: keyword.word,
      editorUserId,
      turnOrder: playerIds,
      currentTurnIndex: -1,
      totalTurns,
      phase: 'SETUP' as UEPhase,
      sentences: [],
      edits: [],
      editedWordPositions: new Set(),
      votes: new Map(),
      keywordInStory: false,
      editorWasCaught: false,
      winner: null,
      playerScores,
      phaseStartedAt: now,
      phaseEndsAt: now,
    };

    logger.info({
      event: 'undercover_editor:start',
      lobbyId: this.context.lobbyId,
      playerCount: playerIds.length,
      totalTurns,
      editorUserId,
      keyword: keyword.word,
    });

    // Build PlayerTurnInfo array
    const turnInfos = this.buildPlayerTurnInfos();

    // Broadcast game start to all
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_GAME_START',
      storyPrompt: prompt.text,
      turnOrder: turnInfos,
      totalTurns,
    });

    // Send role assignments individually
    for (const uid of playerIds) {
      if (uid === editorUserId) {
        this.context.sendToPlayer(uid, 'rmhbox:game:action', {
          type: 'UE_ROLE_ASSIGNED',
          role: 'editor',
          keyword: keyword.word,
        });
      } else {
        this.context.sendToPlayer(uid, 'rmhbox:game:action', {
          type: 'UE_ROLE_ASSIGNED',
          role: 'writer',
        });
      }
    }

    this.startNextTurn();
  }

  // ─── Turn Lifecycle ────────────────────────────────────────────

  private startNextTurn(): void {
    if (!this.isRunning) return;

    this.state.currentTurnIndex++;

    if (this.state.currentTurnIndex >= this.state.totalTurns) {
      this.startReviewPhase();
      return;
    }

    const activeUserId = this.getActivePlayerId();
    const player = this.context.players.get(activeUserId);
    const activeUserName = player?.userName ?? 'Unknown';

    this.state.phase = 'WRITE';
    const writeTimeout = this.getSetting('writeTimeout', UE_WRITE_TIMEOUT_SECONDS);
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + writeTimeout * 1000;

    this.broadcastRound(this.state.currentTurnIndex + 1, this.state.totalTurns);

    this.logAction('turn_start', {
      turnNumber: this.state.currentTurnIndex + 1,
      activeUserId,
      sentenceIndex: this.state.sentences.length,
    });

    logger.info({
      event: 'undercover_editor:turn_start',
      lobbyId: this.context.lobbyId,
      turnNumber: this.state.currentTurnIndex + 1,
      activeUserId,
      activeUserName,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_TURN_START',
      turnNumber: this.state.currentTurnIndex + 1,
      activeUserId,
      activeUserName,
      writeDurationSeconds: writeTimeout,
    });

    // Check if active player is disconnected
    const isDisconnected = player && !player.isConnected;
    if (isDisconnected) {
      this.startPhaseTimer(UE_DISCONNECT_TURN_WAIT_SECONDS);
      this.disconnectWaitHandle = this.setTimeout(() => {
        this.disconnectWaitHandle = null;
        // Check again; they may have reconnected
        const p = this.context.players.get(activeUserId);
        if (!p || !p.isConnected) {
          this.handleWriteTimeout();
        }
      }, UE_DISCONNECT_TURN_WAIT_SECONDS * 1000);
    } else {
      this.startPhaseTimer(writeTimeout);
      this.writeTimeoutHandle = this.setTimeout(
        () => this.handleWriteTimeout(),
        writeTimeout * 1000,
      );
    }
  }

  private handleWriteTimeout(): void {
    if (!this.isRunning || this.state.phase !== 'WRITE') return;
    this.clearPhaseTimer();
    this.clearTrackedTimeout(this.writeTimeoutHandle);
    this.writeTimeoutHandle = null;

    const activeUserId = this.getActivePlayerId();

    logger.info({
      event: 'undercover_editor:write_timeout',
      lobbyId: this.context.lobbyId,
      turnNumber: this.state.currentTurnIndex + 1,
      activeUserId,
    });

    this.afterSentenceSubmitted(activeUserId, '...');
  }

  private afterSentenceSubmitted(activeUserId: string, text: string): void {
    const player = this.context.players.get(activeUserId);
    const authorName = player?.userName ?? 'Unknown';
    const turnNumber = this.state.currentTurnIndex + 1;

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const sentence: StorySentence = {
      authorUserId: activeUserId,
      authorName,
      text,
      originalText: text,
      turnNumber,
      words,
    };
    this.state.sentences.push(sentence);

    this.logAction('word_added', {
      userId: activeUserId,
      sentenceIndex: this.state.sentences.length - 1,
      word: text,
    });

    const fullStory = this.buildStoryView();

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_SENTENCE_ADDED',
      turnNumber,
      authorName,
      sentence: text,
      fullStory,
    });

    // Editor gets an edit phase on every turn
    this.startEditPhase();
  }

  private startEditPhase(): void {
    if (!this.isRunning) return;

    const editorPlayer = this.context.players.get(this.state.editorUserId);

    // If the Editor is fully disconnected, skip the edit phase
    if (!editorPlayer || !editorPlayer.isConnected) {
      logger.info({
        event: 'undercover_editor:edit_skipped_disconnected',
        lobbyId: this.context.lobbyId,
        turnNumber: this.state.currentTurnIndex + 1,
      });
      this.logAction('editor_skip', {
        sentenceIndex: this.state.sentences.length - 1,
      });
      this.startNextTurn();
      return;
    }

    this.state.phase = 'EDIT';
    const editTimeout = this.getSetting('editTimeout', UE_EDIT_TIMEOUT_SECONDS);
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + editTimeout * 1000;

    const editableStory = this.buildEditableStory();

    // Send edit prompt to Editor ONLY
    this.context.sendToPlayer(this.state.editorUserId, 'rmhbox:game:action', {
      type: 'UE_EDIT_PROMPT',
      story: editableStory,
      editDurationSeconds: editTimeout,
    });

    // Start timer for the Editor only (phase timer broadcasts to all, but
    // Writers just see a waiting state — the timer is invisible to them in
    // the client, which shows "The story is being reviewed..." or similar)
    this.startPhaseTimer(editTimeout);

    this.editTimeoutHandle = this.setTimeout(
      () => this.handleEditTimeout(),
      editTimeout * 1000,
    );
  }

  private handleEditTimeout(): void {
    if (!this.isRunning || this.state.phase !== 'EDIT') return;
    this.clearPhaseTimer();
    this.clearTrackedTimeout(this.editTimeoutHandle);
    this.editTimeoutHandle = null;

    logger.info({
      event: 'undercover_editor:edit_timeout',
      lobbyId: this.context.lobbyId,
      turnNumber: this.state.currentTurnIndex + 1,
    });

    this.logAction('editor_skip', {
      sentenceIndex: this.state.sentences.length - 1,
    });

    // Broadcast unchanged story to maintain illusion
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_STORY_UPDATED',
      fullStory: this.buildStoryView(),
    });

    this.startNextTurn();
  }

  private afterEditApplied(edit: WordEdit): void {
    const sentence = this.state.sentences[edit.sentenceIndex];
    sentence.words[edit.wordIndex] = edit.newWord;
    sentence.text = sentence.words.join(' ');

    this.state.edits.push(edit);
    this.state.editedWordPositions.add(`${edit.sentenceIndex}:${edit.wordIndex}`);

    this.logAction('editor_swap', {
      sentenceIndex: edit.sentenceIndex,
      originalWord: edit.originalWord,
      replacementWord: edit.newWord,
      position: edit.wordIndex,
    });

    logger.info({
      event: 'undercover_editor:edit_applied',
      lobbyId: this.context.lobbyId,
      turnNumber: this.state.currentTurnIndex + 1,
      sentenceIndex: edit.sentenceIndex,
      originalWord: edit.originalWord,
      newWord: edit.newWord,
    });

    // Broadcast updated story to all (edit is invisible to Writers)
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_STORY_UPDATED',
      fullStory: this.buildStoryView(),
    });

    this.startNextTurn();
  }

  // ─── Review / Accusation / Reveal ──────────────────────────────

  private startReviewPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'REVIEW';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + UE_REVIEW_DURATION_SECONDS * 1000;

    // Log story snapshot
    this.logAction('story_snapshot', {
      sentences: this.state.sentences.map((s) => s.text),
    });

    logger.info({
      event: 'undercover_editor:review_start',
      lobbyId: this.context.lobbyId,
      sentenceCount: this.state.sentences.length,
    });

    const fullStory = this.buildStoryView();

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_REVIEW_START',
      fullStory,
      reviewDurationSeconds: UE_REVIEW_DURATION_SECONDS,
    });

    this.startPhaseTimer(UE_REVIEW_DURATION_SECONDS);
    this.setTimeout(
      () => this.startAccusationPhase(),
      UE_REVIEW_DURATION_SECONDS * 1000,
    );
  }

  private startAccusationPhase(): void {
    if (!this.isRunning) return;

    this.state.phase = 'ACCUSATION';
    this.state.votes = new Map();
    const accusationDuration = this.getSetting(
      'accusationDuration',
      UE_ACCUSATION_DURATION_SECONDS,
    );
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + accusationDuration * 1000;

    const players: Array<{ userId: string; userName: string }> = [];
    for (const uid of this.state.turnOrder) {
      const p = this.context.players.get(uid);
      players.push({ userId: uid, userName: p?.userName ?? 'Unknown' });
    }

    logger.info({
      event: 'undercover_editor:accusation_start',
      lobbyId: this.context.lobbyId,
      accusationDuration,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_ACCUSATION_START',
      players,
      accusationDurationSeconds: accusationDuration,
    });

    this.startPhaseTimer(accusationDuration);
    this.setTimeout(() => this.endAccusationPhase(), accusationDuration * 1000);
  }

  private endAccusationPhase(): void {
    if (!this.isRunning) return;
    this.clearPhaseTimer();

    this.state.phase = 'REVEAL';
    const now = Date.now();
    this.state.phaseStartedAt = now;
    this.state.phaseEndsAt = now + UE_REVEAL_DURATION_SECONDS * 1000;

    // Tally votes
    const voteCounts = new Map<string, number>();
    for (const accusedId of this.state.votes.values()) {
      voteCounts.set(accusedId, (voteCounts.get(accusedId) ?? 0) + 1);
    }

    // Find plurality
    let mostVotedUserId: string | null = null;
    let maxVotes = 0;
    let isTie = false;
    for (const [uid, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        mostVotedUserId = uid;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    // Tie or no votes → Editor wins by default (not caught)
    const editorCaught = !isTie && mostVotedUserId === this.state.editorUserId;
    this.state.editorWasCaught = editorCaught;

    // Check keyword in story (exact match, case-insensitive)
    const allWords = this.state.sentences.flatMap((s) =>
      s.words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')),
    );
    const keywordLower = this.state.keyword.toLowerCase().replace(/[^a-z0-9]/g, '');
    const keywordInStory = allWords.includes(keywordLower);
    this.state.keywordInStory = keywordInStory;

    // Check keyword proximity via Fuse.js (only if no exact match)
    let proximityMatch = false;
    if (!keywordInStory && allWords.length > 0) {
      const fuse = new Fuse(
        allWords.map((w) => ({ word: w })),
        { keys: ['word'], threshold: UE_KEYWORD_FUZZY_THRESHOLD, includeScore: true },
      );
      const results = fuse.search(keywordLower);
      proximityMatch = results.length > 0;
    }

    // Determine winner and apply scores
    let winner: 'editor' | 'writers';
    const scoreBreakdowns = new Map<string, Record<string, number>>();

    for (const uid of this.state.turnOrder) {
      scoreBreakdowns.set(uid, {});
    }

    if (editorCaught && !keywordInStory) {
      // Scenario 1: Writers major win
      winner = 'writers';
      for (const uid of this.state.turnOrder) {
        const breakdown = scoreBreakdowns.get(uid)!;
        if (uid === this.state.editorUserId) {
          breakdown.base = UE_EDITOR_LOSS;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_EDITOR_LOSS);
        } else {
          breakdown.base = UE_WRITER_MAJOR_WIN;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_WRITER_MAJOR_WIN);
        }
      }
    } else if (editorCaught && keywordInStory) {
      // Scenario 2: Writers minor win
      winner = 'writers';
      for (const uid of this.state.turnOrder) {
        const breakdown = scoreBreakdowns.get(uid)!;
        if (uid === this.state.editorUserId) {
          breakdown.base = UE_EDITOR_PARTIAL;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_EDITOR_PARTIAL);
        } else {
          breakdown.base = UE_WRITER_MINOR_WIN;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_WRITER_MINOR_WIN);
        }
      }
    } else if (!editorCaught && keywordInStory) {
      // Scenario 3: Editor major win
      winner = 'editor';
      for (const uid of this.state.turnOrder) {
        const breakdown = scoreBreakdowns.get(uid)!;
        if (uid === this.state.editorUserId) {
          breakdown.base = UE_EDITOR_MAJOR_WIN;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_EDITOR_MAJOR_WIN);
        } else {
          breakdown.base = UE_WRITER_LOSS;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_WRITER_LOSS);
        }
      }
    } else {
      // Scenario 4: Editor minor win (not caught, keyword not in story)
      winner = 'editor';
      for (const uid of this.state.turnOrder) {
        const breakdown = scoreBreakdowns.get(uid)!;
        if (uid === this.state.editorUserId) {
          breakdown.base = UE_EDITOR_MINOR_WIN;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_EDITOR_MINOR_WIN);
        } else {
          breakdown.base = UE_WRITER_MINOR_LOSS;
          this.state.playerScores.set(uid, (this.state.playerScores.get(uid) ?? 0) + UE_WRITER_MINOR_LOSS);
        }
      }
    }

    this.state.winner = winner;

    // Correct vote bonus for Writers who voted correctly
    for (const [voterId, accusedId] of this.state.votes) {
      if (voterId !== this.state.editorUserId && accusedId === this.state.editorUserId) {
        const breakdown = scoreBreakdowns.get(voterId)!;
        breakdown.correctVoteBonus = UE_CORRECT_VOTE_BONUS;
        this.state.playerScores.set(
          voterId,
          (this.state.playerScores.get(voterId) ?? 0) + UE_CORRECT_VOTE_BONUS,
        );
      }
    }

    // Keyword proximity bonus for Editor
    if (proximityMatch && !keywordInStory) {
      const breakdown = scoreBreakdowns.get(this.state.editorUserId)!;
      breakdown.proximityBonus = UE_KEYWORD_PROXIMITY_BONUS;
      this.state.playerScores.set(
        this.state.editorUserId,
        (this.state.playerScores.get(this.state.editorUserId) ?? 0) + UE_KEYWORD_PROXIMITY_BONUS,
      );
    }

    // Build reveal data
    const editorPlayer = this.context.players.get(this.state.editorUserId);
    const editorName = editorPlayer?.userName ?? 'Unknown';

    const editsView: WordEditView[] = this.state.edits.map((e) => ({
      sentenceIndex: e.sentenceIndex,
      sentenceAuthor: this.state.sentences[e.sentenceIndex]?.authorName ?? 'Unknown',
      originalWord: e.originalWord,
      newWord: e.newWord,
      editedOnTurn: e.editedOnTurn,
    }));

    const voteResults: VoteResult[] = [];
    for (const [voterId, accusedId] of this.state.votes) {
      const voter = this.context.players.get(voterId);
      const accused = this.context.players.get(accusedId);
      voteResults.push({
        voterId,
        voterName: voter?.userName ?? 'Unknown',
        accusedUserId: accusedId,
        accusedName: accused?.userName ?? 'Unknown',
      });
    }

    // Build vote result for game log
    const voteLogMap: Record<string, string[]> = {};
    for (const [voterId, accusedId] of this.state.votes) {
      if (!voteLogMap[accusedId]) voteLogMap[accusedId] = [];
      voteLogMap[accusedId].push(voterId);
    }
    this.logAction('vote_result', {
      votes: voteLogMap,
      editorCaught,
    });

    this.logAction('final_reveal', {
      editorUserId: this.state.editorUserId,
      keyword: this.state.keyword,
      allSwaps: this.state.edits.map((e) => ({
        sentenceIndex: e.sentenceIndex,
        originalWord: e.originalWord,
        replacementWord: e.newWord,
      })),
    });

    const scores: ScoreResult[] = this.state.turnOrder.map((uid) => {
      const p = this.context.players.get(uid);
      return {
        userId: uid,
        userName: p?.userName ?? 'Unknown',
        role: uid === this.state.editorUserId ? ('editor' as const) : ('writer' as const),
        score: this.state.playerScores.get(uid) ?? 0,
        breakdown: scoreBreakdowns.get(uid) ?? {},
      };
    });

    logger.info({
      event: 'undercover_editor:reveal',
      lobbyId: this.context.lobbyId,
      editorUserId: this.state.editorUserId,
      editorCaught,
      keywordInStory,
      winner,
      proximityMatch,
    });

    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_REVEAL',
      editorUserId: this.state.editorUserId,
      editorName,
      keyword: this.state.keyword,
      keywordInStory,
      editorCaught,
      edits: editsView,
      votes: voteResults,
      winner,
      scores,
    });

    this.startPhaseTimer(UE_REVEAL_DURATION_SECONDS);
    this.setTimeout(() => this.endGame(), UE_REVEAL_DURATION_SECONDS * 1000);
  }

  // ─── Input Handling ─────────────────────────────────────────────

  handleInput(userId: string, action: string, data: unknown): void {
    switch (action) {
      case 'WRITE_SENTENCE':
        this.handleWriteSentence(userId, data);
        break;
      case 'EDIT_WORD':
        this.handleEditWord(userId, data);
        break;
      case 'SKIP_EDIT':
        this.handleSkipEdit(userId, data);
        break;
      case 'CAST_ACCUSATION':
        this.handleCastAccusation(userId, data);
        break;
    }
  }

  private handleWriteSentence(userId: string, data: unknown): void {
    if (this.state.phase !== 'WRITE') {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    const activeUserId = this.getActivePlayerId();
    if (userId !== activeUserId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'not_your_turn',
      });
      return;
    }

    const parsed = WriteSentenceSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    // Cancel write timeout
    this.clearPhaseTimer();
    this.clearTrackedTimeout(this.writeTimeoutHandle);
    this.writeTimeoutHandle = null;
    this.clearTrackedTimeout(this.disconnectWaitHandle);
    this.disconnectWaitHandle = null;

    const text = sanitizeString(parsed.data.text);
    this.afterSentenceSubmitted(userId, text);
  }

  private handleEditWord(userId: string, data: unknown): void {
    if (this.state.phase !== 'EDIT') {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    if (userId !== this.state.editorUserId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'not_editor',
      });
      return;
    }

    const parsed = EditWordSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { sentenceIndex, wordIndex, newWord } = parsed.data;

    // Bounds check
    if (sentenceIndex < 0 || sentenceIndex >= this.state.sentences.length) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'invalid_sentence_index',
      });
      return;
    }

    const sentence = this.state.sentences[sentenceIndex];
    if (wordIndex < 0 || wordIndex >= sentence.words.length) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'invalid_word_index',
      });
      return;
    }

    // Cannot re-edit an already edited position
    const posKey = `${sentenceIndex}:${wordIndex}`;
    if (this.state.editedWordPositions.has(posKey)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'already_edited',
      });
      return;
    }

    // Cannot edit current sentence if Editor wrote it
    const activeUserId = this.getActivePlayerId();
    const lastSentenceIndex = this.state.sentences.length - 1;
    if (
      activeUserId === this.state.editorUserId &&
      sentenceIndex === lastSentenceIndex
    ) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'cannot_edit_own_sentence',
      });
      return;
    }

    // Cancel edit timeout
    this.clearPhaseTimer();
    this.clearTrackedTimeout(this.editTimeoutHandle);
    this.editTimeoutHandle = null;

    const sanitizedWord = sanitizeString(newWord);
    const edit: WordEdit = {
      sentenceIndex,
      wordIndex,
      originalWord: sentence.words[wordIndex],
      newWord: sanitizedWord,
      editedOnTurn: this.state.currentTurnIndex + 1,
    };

    this.afterEditApplied(edit);
  }

  private handleSkipEdit(userId: string, data: unknown): void {
    if (this.state.phase !== 'EDIT') {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    if (userId !== this.state.editorUserId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'not_editor',
      });
      return;
    }

    const parsed = SkipEditSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    // Cancel edit timeout
    this.clearPhaseTimer();
    this.clearTrackedTimeout(this.editTimeoutHandle);
    this.editTimeoutHandle = null;

    logger.info({
      event: 'undercover_editor:edit_skipped',
      lobbyId: this.context.lobbyId,
      turnNumber: this.state.currentTurnIndex + 1,
    });

    this.logAction('editor_skip', {
      sentenceIndex: this.state.sentences.length - 1,
    });

    // Broadcast unchanged story to maintain illusion
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_STORY_UPDATED',
      fullStory: this.buildStoryView(),
    });

    this.startNextTurn();
  }

  private handleCastAccusation(userId: string, data: unknown): void {
    if (this.state.phase !== 'ACCUSATION') {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'wrong_phase',
      });
      return;
    }

    const parsed = CastAccusationSchema.safeParse(data);
    if (!parsed.success) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'invalid_input',
      });
      return;
    }

    const { targetUserId } = parsed.data;

    // Validate target is a real player in the game
    if (!this.state.turnOrder.includes(targetUserId)) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'invalid_target',
      });
      return;
    }

    // Cannot vote for self
    if (targetUserId === userId) {
      this.context.sendToPlayer(userId, 'rmhbox:game:action', {
        type: 'UE_INPUT_REJECTED',
        reason: 'cannot_vote_self',
      });
      return;
    }

    // Record/overwrite vote
    this.state.votes.set(userId, targetUserId);

    this.logAction('accusation_vote', {
      voterId: userId,
      suspectedUserId: targetUserId,
    });

    // Broadcast that someone voted (not who for)
    this.context.broadcastToLobby('rmhbox:game:action', {
      type: 'UE_VOTE_CAST',
      voterId: userId,
      hasVoted: true,
    });
  }

  // ─── State Masking ──────────────────────────────────────────────

  getStateForPlayer(userId: string): unknown {
    const isEditor = userId === this.state.editorUserId;
    const activeUserId = this.getActivePlayerId();
    const timeRemaining = Math.max(
      0,
      Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000),
    );

    const base = {
      storyPrompt: this.state.storyPrompt,
      myRole: isEditor ? 'editor' : 'writer',
      turnOrder: this.buildPlayerTurnInfos(),
      currentTurnIndex: this.state.currentTurnIndex,
      totalTurns: this.state.totalTurns,
      phase: this.state.phase,
      story: this.buildStoryView(),
      isMyTurn: userId === activeUserId,
      timeRemaining,
      myVote: this.state.votes.get(userId) ?? null,
      votedPlayers: Array.from(this.state.votes.keys()),
    };

    if (isEditor) {
      return {
        ...base,
        keyword: this.state.keyword,
        myEdits: this.state.edits,
        ...(this.state.phase === 'EDIT'
          ? { editableStory: this.buildEditableStory() }
          : {}),
      };
    }

    return base;
  }

  getStateForSpectator(): unknown {
    const activeUserId = this.getActivePlayerId();
    const timeRemaining = Math.max(
      0,
      Math.ceil((this.state.phaseEndsAt - Date.now()) / 1000),
    );

    // Build full votes map for spectators
    const votesMap: Record<string, string> = {};
    for (const [voterId, accusedId] of this.state.votes) {
      votesMap[voterId] = accusedId;
    }

    return {
      storyPrompt: this.state.storyPrompt,
      editorUserId: this.state.editorUserId,
      keyword: this.state.keyword,
      turnOrder: this.buildPlayerTurnInfos(),
      currentTurnIndex: this.state.currentTurnIndex,
      totalTurns: this.state.totalTurns,
      phase: this.state.phase,
      story: this.buildStoryView(),
      activeUserId,
      timeRemaining,
      edits: this.state.edits,
      votes: votesMap,
      isSpectator: true,
    };
  }

  // ─── Join-in-Progress / Reconnection / Disconnect ──────────────

  handlePlayerJoin(userId: string): void {
    // spectate_only — new players get spectator state
    this.context.sendToPlayer(
      userId,
      'rmhbox:game:state_snapshot',
      this.getStateForSpectator(),
    );

    logger.info({
      event: 'undercover_editor:player_join_spectate',
      lobbyId: this.context.lobbyId,
      userId,
    });
  }

  handlePlayerDisconnect(userId: string): void {
    logger.info({
      event: 'undercover_editor:player_disconnect',
      lobbyId: this.context.lobbyId,
      userId,
      phase: this.state.phase,
    });

    // Check if we've dropped below minimum players
    const connectedCount = this.getConnectedPlayerCount();
    if (connectedCount < UE_MIN_PLAYERS) {
      logger.warn({
        event: 'undercover_editor:below_min_players',
        lobbyId: this.context.lobbyId,
        connectedCount,
      });
      this.forceEnd('below_min_players');
    }
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

  // ─── Results & Awards ──────────────────────────────────────────

  computeResults(): MinigameResults {
    const rankings = this.computeRankings();
    const awards = this.computeAwards();
    const duration = Date.now() - this.startedAt;

    return {
      rankings,
      awards,
      gameSpecificData: {
        edits: this.state.edits,
        votes: Object.fromEntries(this.state.votes),
        winner: this.state.winner,
        keyword: this.state.keyword,
        gameLog: this.buildGameLog(),
      },
      duration,
    };
  }

  private computeRankings(): PlayerRanking[] {
    const entries: PlayerRanking[] = [];

    for (const uid of this.state.turnOrder) {
      const player = this.context.players.get(uid);
      const score = this.state.playerScores.get(uid) ?? 0;

      entries.push({
        userId: uid,
        userName: player?.userName ?? 'Unknown',
        score,
        rank: 0,
        deltas: {
          base: score,
        },
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  }

  private computeAwards(): Award[] {
    const awards: Award[] = [];

    // Master of Disguise — Editor who wasn't caught AND got the keyword in
    if (!this.state.editorWasCaught && this.state.keywordInStory) {
      awards.push({
        userId: this.state.editorUserId,
        title: 'Master of Disguise',
        description: 'Planted the keyword without getting caught',
        icon: 'mask',
      });
    }

    // Eagle Eye — each Writer who correctly voted for the Editor
    for (const [voterId, accusedId] of this.state.votes) {
      if (voterId !== this.state.editorUserId && accusedId === this.state.editorUserId) {
        awards.push({
          userId: voterId,
          title: 'Eagle Eye',
          description: 'Correctly identified the Editor',
          icon: 'eye',
        });
      }
    }

    // Shakespeare — Player who wrote the longest sentence (by word count)
    let longestWordCount = 0;
    let shakespeareUserId: string | null = null;
    for (const sentence of this.state.sentences) {
      if (sentence.words.length > longestWordCount) {
        longestWordCount = sentence.words.length;
        shakespeareUserId = sentence.authorUserId;
      }
    }
    if (shakespeareUserId) {
      awards.push({
        userId: shakespeareUserId,
        title: 'Shakespeare',
        description: `Wrote a ${longestWordCount}-word sentence`,
        icon: 'quill',
      });
    }

    // Smooth Operator — Editor who made the most edits without getting caught
    if (!this.state.editorWasCaught && this.state.edits.length > 0) {
      awards.push({
        userId: this.state.editorUserId,
        title: 'Smooth Operator',
        description: `Made ${this.state.edits.length} sneaky edit${this.state.edits.length > 1 ? 's' : ''}`,
        icon: 'wand-2',
      });
    }

    // Red Herring — Writer who received the most accusation votes (falsely accused)
    const falseAccusationCounts = new Map<string, number>();
    for (const accusedId of this.state.votes.values()) {
      if (accusedId !== this.state.editorUserId) {
        falseAccusationCounts.set(
          accusedId,
          (falseAccusationCounts.get(accusedId) ?? 0) + 1,
        );
      }
    }
    let maxFalseAccusations = 0;
    let redHerringUserId: string | null = null;
    for (const [uid, count] of falseAccusationCounts) {
      if (count > maxFalseAccusations) {
        maxFalseAccusations = count;
        redHerringUserId = uid;
      }
    }
    if (redHerringUserId && maxFalseAccusations > 0) {
      awards.push({
        userId: redHerringUserId,
        title: 'Red Herring',
        description: `Falsely accused ${maxFalseAccusations} time${maxFalseAccusations > 1 ? 's' : ''}`,
        icon: 'fish',
      });
    }

    return awards;
  }

  // ─── Game Log ──────────────────────────────────────────────────

  private logAction(type: string, payload: Record<string, unknown>): void {
    this.actionLog.push({
      type,
      payload,
      timestamp: Date.now(),
    });
  }

  private buildGameLog(): Record<string, unknown> {
    const writerUserIds = this.state.turnOrder.filter(
      (uid) => uid !== this.state.editorUserId,
    );

    return {
      lobbyId: this.context.lobbyId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      initialState: {
        storyTitle: this.state.storyPrompt,
        originalStory: this.state.sentences.map((s) => s.originalText),
        keyword: this.state.keyword,
        editorUserId: this.state.editorUserId,
        writerUserIds,
        turnsPerRound: this.state.turnOrder.length,
        gameSettings: this.context.gameSettings,
      },
      playerCount: this.state.turnOrder.length,
      players: this.state.turnOrder.map((uid) => ({
        userId: uid,
        userName: this.context.players.get(uid)?.userName ?? 'Unknown',
      })),
      actions: this.actionLog,
      finalResults: this.state.turnOrder.map((uid) => ({
        userId: uid,
        userName: this.context.players.get(uid)?.userName ?? 'Unknown',
        score: this.state.playerScores.get(uid) ?? 0,
      })),
    };
  }

  // ─── End Game ──────────────────────────────────────────────────

  private endGame(): void {
    if (!this.isRunning) return;

    logger.info({
      event: 'undercover_editor:game_end',
      lobbyId: this.context.lobbyId,
      winner: this.state.winner,
      editorCaught: this.state.editorWasCaught,
      keywordInStory: this.state.keywordInStory,
    });

    this.cleanup();
    this.context.onComplete(this.computeResults());
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private getActivePlayerId(): string {
    return this.state.turnOrder[
      this.state.currentTurnIndex % this.state.turnOrder.length
    ];
  }

  private buildStoryView(): StorySentenceView[] {
    return this.state.sentences.map((s) => ({
      authorName: s.authorName,
      text: s.text,
      turnNumber: s.turnNumber,
    }));
  }

  private buildEditableStory(): EditableStory {
    const activeUserId = this.getActivePlayerId();
    const lastSentenceIndex = this.state.sentences.length - 1;

    return {
      sentences: this.state.sentences.map((sentence, si) => ({
        authorName: sentence.authorName,
        words: sentence.words.map((word, wi): EditableWord => {
          const posKey = `${si}:${wi}`;
          const alreadyEdited = this.state.editedWordPositions.has(posKey);
          // Cannot edit the current sentence if the Editor wrote it
          const isCurrentEditorSentence =
            activeUserId === this.state.editorUserId && si === lastSentenceIndex;

          return {
            word,
            index: wi,
            sentenceIndex: si,
            isEditable: !alreadyEdited && !isCurrentEditorSentence,
          };
        }),
      })),
    };
  }

  private buildPlayerTurnInfos(): PlayerTurnInfo[] {
    return this.state.turnOrder.map((uid) => {
      const player = this.context.players.get(uid);
      const turnNumbers: number[] = [];
      for (let i = 0; i < this.state.totalTurns; i++) {
        if (this.state.turnOrder[i % this.state.turnOrder.length] === uid) {
          turnNumbers.push(i + 1);
        }
      }
      return {
        userId: uid,
        userName: player?.userName ?? 'Unknown',
        turnNumbers,
      };
    });
  }

  private getConnectedPlayerCount(): number {
    let count = 0;
    for (const uid of this.state.turnOrder) {
      const p = this.context.players.get(uid);
      if (p && p.isConnected) {
        count++;
      }
    }
    return count;
  }
}
