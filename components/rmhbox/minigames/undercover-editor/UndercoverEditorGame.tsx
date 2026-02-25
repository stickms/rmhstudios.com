/**
 * UndercoverEditorGame — Phase router for the Undercover Editor minigame.
 *
 * Parallel design: all players write sentences for ALL stories simultaneously.
 * Each player is secretly assigned as the undercover editor of one story.
 * After writing rounds, players review all stories and try to match each
 * story with its undercover editor.
 *
 * Phases:
 *   WRITE  → all players write a sentence for each story
 *   EDIT   → editors secretly edit their assigned story
 *   (repeat for N rounds)
 *   REVIEW → infinite-time matching phase
 *   REVEAL → dramatic reveal of editor assignments + scores
 *
 * Server actions handled:
 *   UE_GAME_START, UE_ROLE_ASSIGNED, UE_WRITE_START, UE_SENTENCE_CONFIRMED,
 *   UE_SENTENCE_UNSUBMITTED, UE_SUBMISSION_PROGRESS, UE_EDIT_START,
 *   UE_EDIT_PROMPT, UE_EDIT_CONFIRMED, UE_STORIES_UPDATED, UE_REVIEW_START,
 *   UE_MATCHING_SAVED, UE_PLAYER_LOCKED_IN, UE_REVEAL, UE_ERROR,
 *   TIMER_START, TIMER_TICK, MINIGAME_ROUND
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { playSound } from '@/lib/rmhbox/audio';
import StoryDisplay from './StoryDisplay';
import WriteInput from './WriteInput';
import StoryEditor from './StoryEditor';
import type { EditableStory } from './StoryEditor';
import MatchingPanel from './MatchingPanel';
import RevealScreen from './RevealScreen';
import RoleBadge from './RoleBadge';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'LOBBY' | 'WRITE' | 'EDIT' | 'REVIEW' | 'REVEAL' | 'GAME_OVER';

interface Sentence {
  authorName: string;
  text: string;
  turnNumber: number;
}

interface StoryData {
  storyId: string;
  ownerName: string;
  prompt: string;
  sentences: Sentence[];
}

interface PlayerEntry {
  userId: string;
  userName: string;
}

interface StoryRevealInfo {
  storyId: string;
  ownerName: string;
  editorUserId: string;
  editorName: string;
  keyword: string;
  keywordInStory: boolean;
  edits: Array<{
    storyId: string;
    sentenceIndex: number;
    sentenceAuthor: string;
    originalWord: string;
    newWord: string;
  }>;
  sentences: Sentence[];
}

interface MatchResult {
  storyId: string;
  guessedEditorId: string;
  actualEditorId: string;
  correct: boolean;
}

interface ScoreEntry {
  userId: string;
  userName: string;
  score: number;
}

// ─── Helper ──────────────────────────────────────────────────────

function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

// ─── Props ───────────────────────────────────────────────────────

interface UndercoverEditorGameProps {
  playerId: string;
  playerName: string;
}

// ─── Component ───────────────────────────────────────────────────

export default function UndercoverEditorGame({
  playerId,
  playerName: _playerName,
}: UndercoverEditorGameProps) {
  void _playerName;

  // ─── State ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('LOBBY');
  const [assignedStoryId, setAssignedStoryId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryData[]>([]);
  const [gamePlayers, setGamePlayers] = useState<PlayerEntry[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(45);

  // Write phase: track which stories I've submitted for
  const [mySubmissions, setMySubmissions] = useState<Record<string, string>>({});
  const [submissionProgress, setSubmissionProgress] = useState<Record<string, number>>({});
  const [totalPlayers, setTotalPlayers] = useState(0);

  // Edit phase
  const [editableStory, setEditableStory] = useState<EditableStory | null>(null);
  const [editDone, setEditDone] = useState(false);

  // Review phase: matching guesses
  const [matchGuesses, setMatchGuesses] = useState<Record<string, string>>({});
  const [isLockedIn, setIsLockedIn] = useState(false);
  const [lockedInPlayers, setLockedInPlayers] = useState<string[]>([]);

  // Reveal
  const [storyReveals, setStoryReveals] = useState<StoryRevealInfo[]>([]);
  const [matchResults, setMatchResults] = useState<Record<string, MatchResult[]>>({});
  const [scores, setScores] = useState<ScoreEntry[]>([]);

  // Currently focused story for writing (tab index)
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);

  // ─── Event Handler ─────────────────────────────────────────

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'UE_GAME_START': {
          setPhase('LOBBY');
          const s = data.stories as StoryData[] | undefined;
          if (s) setStories(s);
          const p = data.players as PlayerEntry[] | undefined;
          if (p) setGamePlayers(p);
          setTotalRounds((data.totalRounds as number) ?? 0);
          setMySubmissions({});
          setMatchGuesses({});
          setIsLockedIn(false);
          setLockedInPlayers([]);
          setScores([]);
          setStoryReveals([]);
          playSound('swoosh');
          break;
        }
        case 'UE_ROLE_ASSIGNED': {
          setAssignedStoryId(data.assignedStoryId as string);
          setKeyword(data.keyword as string);
          playSound('chime');
          break;
        }
        case 'UE_WRITE_START': {
          setPhase('WRITE');
          setCurrentRound((data.round as number) ?? currentRound + 1);
          setTotalRounds((data.totalRounds as number) ?? totalRounds);
          if (typeof data.writeDurationSeconds === 'number') {
            setTimeRemaining(data.writeDurationSeconds as number);
          }
          // Reset write state for new round
          setMySubmissions({});
          setSubmissionProgress({});
          setActiveStoryIndex(0);
          setEditDone(false);
          playSound('chime');
          break;
        }
        case 'UE_SENTENCE_CONFIRMED': {
          const storyId = data.storyId as string;
          const text = data.text as string;
          setMySubmissions((prev) => ({ ...prev, [storyId]: text }));
          playSound('click');
          break;
        }
        case 'UE_SENTENCE_UNSUBMITTED': {
          const storyId = data.storyId as string;
          setMySubmissions((prev) => {
            const next = { ...prev };
            delete next[storyId];
            return next;
          });
          break;
        }
        case 'UE_SUBMISSION_PROGRESS': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            setSubmissionProgress(pl.progress as Record<string, number>);
            if (typeof pl.totalPlayers === 'number') {
              setTotalPlayers(pl.totalPlayers as number);
            }
          }
          break;
        }
        case 'UE_EDIT_START': {
          setPhase('EDIT');
          setEditDone(false);
          if (typeof data.editDurationSeconds === 'number') {
            setTimeRemaining(data.editDurationSeconds as number);
          }
          break;
        }
        case 'UE_EDIT_PROMPT': {
          if (data.story) {
            setEditableStory(data.story as EditableStory);
          }
          playSound('chime');
          break;
        }
        case 'UE_EDIT_CONFIRMED': {
          setEditDone(true);
          // Update editable story if server sent it back
          if (data.story) {
            setEditableStory(data.story as EditableStory);
          }
          playSound('click');
          break;
        }
        case 'UE_STORIES_UPDATED': {
          const updated = data.stories as StoryData[] | undefined;
          if (updated) setStories(updated);
          break;
        }
        case 'UE_REVIEW_START': {
          setPhase('REVIEW');
          const reviewStories = data.stories as StoryData[] | undefined;
          if (reviewStories) setStories(reviewStories);
          const reviewPlayers = data.players as PlayerEntry[] | undefined;
          if (reviewPlayers) setGamePlayers(reviewPlayers);
          setMatchGuesses({});
          setIsLockedIn(false);
          setLockedInPlayers([]);
          playSound('swoosh');
          break;
        }
        case 'UE_MATCHING_SAVED': {
          const guesses = data.guesses as Record<string, string> | undefined;
          if (guesses) setMatchGuesses(guesses);
          break;
        }
        case 'UE_PLAYER_LOCKED_IN': {
          const uid = data.userId as string;
          setLockedInPlayers((prev) =>
            prev.includes(uid) ? prev : [...prev, uid],
          );
          playSound('click');
          break;
        }
        case 'UE_REVEAL': {
          setPhase('REVEAL');
          const reveals = data.storyReveals as StoryRevealInfo[] | undefined;
          if (reveals) setStoryReveals(reveals);
          const mr = data.matchResults as Record<string, MatchResult[]> | undefined;
          if (mr) setMatchResults(mr);
          const sc = data.scores as ScoreEntry[] | undefined;
          if (sc) setScores(sc);
          playSound('scoreDing');
          break;
        }
        case 'UE_ERROR': {
          // Could display an error toast
          break;
        }
        case 'UE_GAME_OVER': {
          setPhase('GAME_OVER');
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl && typeof pl.timeRemaining === 'number') {
            setTimeRemaining(pl.timeRemaining as number);
          }
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') {
            setTimeRemaining(remaining);
            if (remaining <= 3 && remaining > 0) playSound('countdownBeep');
          }
          break;
        }
        case 'MINIGAME_ROUND': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl && typeof pl.current === 'number') {
            setCurrentRound(pl.current as number);
          }
          break;
        }
      }
    },
    [currentRound, totalRounds],
  );

  // Listen for GAME_ROUND_RESULTS for game-over
  const handleRoundResults = useCallback(() => {
    setPhase('GAME_OVER');
  }, []);

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(S2C.GAME_ACTION, handleGameAction);
    socket.on(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
      socket.off(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    };
  }, [handleGameAction, handleRoundResults]);

  // Hydrate from Zustand gameState snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (['WRITE', 'EDIT', 'REVIEW', 'REVEAL', 'GAME_OVER'].includes(p)) {
      setPhase(p as Phase);
    } else if (p === 'SETUP') {
      setPhase('LOBBY');
    }
    if (Array.isArray(snapshot.stories)) setStories(snapshot.stories as StoryData[]);
    if (Array.isArray(snapshot.players)) setGamePlayers(snapshot.players as PlayerEntry[]);
    if (snapshot.assignedStoryId) setAssignedStoryId(snapshot.assignedStoryId as string);
    if (snapshot.keyword) setKeyword(snapshot.keyword as string);
    if (snapshot.currentRound != null) setCurrentRound(snapshot.currentRound as number);
    if (snapshot.totalRounds != null) setTotalRounds(snapshot.totalRounds as number);
    if (snapshot.timeRemaining != null) setTimeRemaining(snapshot.timeRemaining as number);
    if (snapshot.mySubmissions) setMySubmissions(snapshot.mySubmissions as Record<string, string>);
    if (snapshot.submissionProgress) setSubmissionProgress(snapshot.submissionProgress as Record<string, number>);
    if (typeof snapshot.totalPlayers === 'number') setTotalPlayers(snapshot.totalPlayers as number);
    if (snapshot.myMatchGuesses) setMatchGuesses(snapshot.myMatchGuesses as Record<string, string>);
    if (snapshot.isMatchLockedIn) setIsLockedIn(true);
    if (Array.isArray(snapshot.matchLockedIn)) setLockedInPlayers(snapshot.matchLockedIn as string[]);
  }, []);

  // ─── Actions ───────────────────────────────────────────────

  const handleSubmitSentence = useCallback(
    (storyId: string, text: string) => {
      emitGameInput('WRITE_SENTENCE', { storyId, text });
    },
    [],
  );

  const handleUnsubmitSentence = useCallback(
    (storyId: string) => {
      emitGameInput('UNSUBMIT_SENTENCE', { storyId });
    },
    [],
  );

  const handleEdit = useCallback(
    (sentenceIndex: number, wordIndex: number, newWord: string) => {
      if (!assignedStoryId) return;
      emitGameInput('EDIT_WORD', { storyId: assignedStoryId, sentenceIndex, wordIndex, newWord });
    },
    [assignedStoryId],
  );

  const handleSkipEdit = useCallback(() => {
    emitGameInput('SKIP_EDIT', {});
  }, []);

  const handleGuessChange = useCallback(
    (storyId: string, guessedEditorId: string) => {
      setMatchGuesses((prev) => {
        const next = { ...prev, [storyId]: guessedEditorId };
        // Auto-save to server
        emitGameInput('SUBMIT_MATCHING', { guesses: next });
        return next;
      });
    },
    [],
  );

  const handleLockIn = useCallback(() => {
    emitGameInput('LOCK_IN_MATCHING', {});
    setIsLockedIn(true);
  }, []);

  // ─── Derived Values ────────────────────────────────────────

  const activeStory = stories[activeStoryIndex] ?? null;
  const submittedCount = Object.keys(mySubmissions).length;
  const totalStories = stories.length;
  const allSubmitted = submittedCount === totalStories;

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Persistent role badge — shows assigned story and keyword */}
      {assignedStoryId && keyword && (
        <div className="self-end">
          <RoleBadge role="editor" keyword={keyword} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* LOBBY — waiting for game to start */}
        {phase === 'LOBBY' && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center p-8"
          >
            <p className="text-sm text-(--rmhbox-text-muted)">
              Setting up the stories…
            </p>
          </motion.div>
        )}

        {/* WRITE — all players write for all stories */}
        {phase === 'WRITE' && (
          <motion.div
            key="write"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center gap-4"
          >
            {/* Round indicator */}
            <div className="text-center">
              <p className="text-xs font-medium text-(--rmhbox-text-muted) uppercase tracking-wider">
                Round {currentRound} / {totalRounds}
              </p>
              <p className="text-sm text-(--rmhbox-text-muted)">
                Write a sentence for each story • {submittedCount}/{totalStories} done
              </p>
            </div>

            {/* Story tabs */}
            <div className="flex gap-1 overflow-x-auto w-full justify-center flex-wrap">
              {stories.map((story, idx) => {
                const isSubmitted = !!mySubmissions[story.storyId];
                return (
                  <button
                    key={story.storyId}
                    onClick={() => setActiveStoryIndex(idx)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      idx === activeStoryIndex
                        ? 'bg-(--rmhbox-accent) text-white'
                        : isSubmitted
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted) border border-(--rmhbox-border)'
                    }`}
                  >
                    {story.ownerName}
                    {isSubmitted && ' ✓'}
                  </button>
                );
              })}
            </div>

            {/* Active story content */}
            {activeStory && (
              <div className="w-full max-w-lg flex flex-col gap-3">
                <div className="rounded-xl bg-(--rmhbox-surface) p-3 border border-(--rmhbox-border)">
                  <p className="text-xs font-semibold text-(--rmhbox-accent) mb-1">
                    {activeStory.ownerName}&apos;s Story
                  </p>
                  <p className="text-sm text-(--rmhbox-text-muted) italic mb-2">
                    {activeStory.prompt}
                  </p>
                  {activeStory.sentences.length > 0 && (
                    <StoryDisplay
                      sentences={activeStory.sentences}
                      storyPrompt={activeStory.prompt}
                    />
                  )}
                </div>

                {/* Write input or submitted indicator */}
                {mySubmissions[activeStory.storyId] ? (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2 text-sm text-green-400">
                      ✓ {mySubmissions[activeStory.storyId]}
                    </p>
                    {!allSubmitted && (
                      <button
                        onClick={() => handleUnsubmitSentence(activeStory.storyId)}
                        className="rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) px-3 py-2 text-xs text-(--rmhbox-text-muted) hover:bg-(--rmhbox-border) transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                ) : (
                  <WriteInput
                    storyContext={activeStory.sentences.map((s) => ({
                      authorName: s.authorName,
                      text: s.text,
                    }))}
                    storyPrompt={activeStory.prompt}
                    timeRemaining={timeRemaining}
                    onSubmit={(text) => handleSubmitSentence(activeStory.storyId, text)}
                  />
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* EDIT — editors secretly edit their assigned story */}
        {phase === 'EDIT' && (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center gap-4"
          >
            {editableStory && !editDone ? (
              <StoryEditor
                editableStory={editableStory}
                keyword={keyword ?? ''}
                timeRemaining={timeRemaining}
                onEdit={handleEdit}
                onSkip={handleSkipEdit}
              />
            ) : editDone ? (
              <div className="flex flex-col items-center gap-3 p-8">
                <p className="text-lg font-bold text-green-400">✓ Edit Complete</p>
                <p className="text-sm text-(--rmhbox-text-muted)">
                  Waiting for other editors…
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-8">
                <p className="text-sm text-(--rmhbox-text-muted) italic">
                  Editors are reviewing the stories…
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* REVIEW — infinite-time matching phase */}
        {phase === 'REVIEW' && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <MatchingPanel
              stories={stories}
              players={gamePlayers}
              myPlayerId={playerId}
              currentGuesses={matchGuesses}
              lockedIn={isLockedIn}
              lockedInPlayers={lockedInPlayers}
              onGuessChange={handleGuessChange}
              onLockIn={handleLockIn}
            />
          </motion.div>
        )}

        {/* REVEAL — dramatic reveal of editor assignments */}
        {phase === 'REVEAL' && storyReveals.length > 0 && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div className="flex flex-col items-center gap-6">
              <h2 className="text-xl font-bold text-(--rmhbox-text)">
                The Truth Revealed
              </h2>

              {/* Show each story's editor */}
              <div className="flex flex-col gap-4 w-full max-w-lg">
                {storyReveals.map((reveal) => {
                  const myGuess = matchResults[playerId]?.find((r) => r.storyId === reveal.storyId);
                  return (
                    <motion.div
                      key={reveal.storyId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5 }}
                      className="rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-(--rmhbox-text)">
                          {reveal.ownerName}&apos;s Story
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          myGuess?.correct
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {myGuess?.correct ? '✓ Correct' : '✗ Wrong'}
                        </span>
                      </div>
                      <p className="text-sm text-(--rmhbox-text-muted) mb-1">
                        Editor: <span className="font-bold text-(--rmhbox-accent)">{reveal.editorName}</span>
                      </p>
                      <p className="text-sm text-(--rmhbox-text-muted) mb-1">
                        Keyword: <span className="font-bold">{reveal.keyword}</span>
                        {reveal.keywordInStory ? ' (found in story! 🎯)' : ''}
                      </p>
                      {reveal.edits.length > 0 && (
                        <div className="mt-2 text-xs text-(--rmhbox-text-muted)">
                          <p className="font-medium mb-1">Edits made:</p>
                          {reveal.edits.map((edit, i) => (
                            <p key={i}>
                              <span className="line-through text-red-400">{edit.originalWord}</span>
                              {' → '}
                              <span className="text-green-400">{edit.newWord}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Score summary */}
              {scores.length > 0 && (
                <div className="w-full max-w-sm">
                  <h3 className="text-sm font-bold text-(--rmhbox-text) mb-2 text-center">Scores</h3>
                  <div className="flex flex-col gap-1">
                    {[...scores].sort((a, b) => b.score - a.score).map((s) => (
                      <div
                        key={s.userId}
                        className="flex items-center justify-between rounded-lg bg-(--rmhbox-surface) px-3 py-1.5 text-sm"
                      >
                        <span className={`${s.userId === playerId ? 'font-bold text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'}`}>
                          {s.userName}
                        </span>
                        <span className="font-mono text-(--rmhbox-text-muted)">{s.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* GAME_OVER */}
        {phase === 'GAME_OVER' && (
          <motion.div
            key="game-over"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center p-8"
          >
            <p className="text-sm text-(--rmhbox-text-muted)">
              Game over — calculating results…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
