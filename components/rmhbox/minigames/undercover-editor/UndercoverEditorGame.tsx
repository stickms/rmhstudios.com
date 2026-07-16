/**
 * UndercoverEditorGame — Main game component for the Undercover Editor minigame.
 *
 * Round-robin design: N players create N stories over 2N steps (N write + N edit).
 * Each round, every player writes ONE sentence for ONE assigned story.
 * After each write round, editors secretly change exactly 2 words.
 * After all rounds: READING → REVIEW (match editors) → REVEAL.
 *
 * Server events handled:
 *   UE_GAME_START, UE_ROLE_ASSIGNED, UE_WRITE_START, UE_WRITE_ASSIGNMENT,
 *   UE_SENTENCE_CONFIRMED, UE_SENTENCE_UNSUBMITTED, UE_SUBMISSION_PROGRESS,
 *   UE_EDIT_START, UE_EDIT_PROMPT, UE_EDIT_CONFIRMED, UE_STORIES_UPDATED,
 *   UE_READING_START, UE_READING_SENTENCE, UE_READING_NEXT_STORY,
 *   UE_REVIEW_START, UE_MATCHING_SAVED, UE_PLAYER_LOCKED_IN,
 *   UE_REVEAL, UE_ERROR, TIMER_TICK
 */
'use client';

import { useState, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket, extractTimerTick } from '@/lib/rmhbox/minigame-client';
import { playSound } from '@/lib/rmhbox/audio';
import WriteInput from './WriteInput';
import StoryEditor from './StoryEditor';
import type { EditableStory } from './StoryEditor';
import MatchingPanel from './MatchingPanel';

import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'LOBBY' | 'WRITE' | 'EDIT' | 'READING' | 'REVIEW' | 'REVEAL' | 'GAME_OVER';

interface Sentence {
  authorName: string;
  text: string;
  roundNumber: number;
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

interface WordEditView {
  storyId: string;
  sentenceIndex: number;
  wordIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
  editedOnRound: number;
}

interface StoryRevealInfo {
  storyId: string;
  ownerName: string;
  prompt: string;
  editorUserId: string;
  editorName: string;
  edits: WordEditView[];
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

/** Story metadata used in READING phase (no sentences until revealed). */
interface ReadingStoryMeta {
  storyId: string;
  ownerName: string;
  prompt: string;
  sentenceCount: number;
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

  const { t } = useTranslation("c-rmhbox");

  // ─── Spectator / Host ──────────────────────────────────────
  const isSpectator = useRMHboxStore((s) => s.lobby?.myRole === 'spectator');
  const isHost = useRMHboxStore((s) => s.lobby?.hostUserId === s.lobby?.myUserId);

  // ─── State ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('LOBBY');
  const [assignedStoryId, setAssignedStoryId] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryData[]>([]);
  const [gamePlayers, setGamePlayers] = useState<PlayerEntry[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [writeRound, setWriteRound] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(45);

  // Write phase: ONE story assignment per round
  const [myWriteAssignment, setMyWriteAssignment] = useState<{
    storyId: string;
    ownerName: string;
    prompt: string;
    sentences: Sentence[];
  } | null>(null);
  const [mySubmission, setMySubmission] = useState<string | null>(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  // Edit phase
  const [editableStory, setEditableStory] = useState<EditableStory | null>(null);
  const [editDone, setEditDone] = useState(false);

  // Reading phase (host-driven sentence stepping)
  const [readingStories, setReadingStories] = useState<ReadingStoryMeta[]>([]);
  const [readingStoryIndex, setReadingStoryIndex] = useState(0);
  const [readingSentenceIndex, setReadingSentenceIndex] = useState(0);
  const [revealedSentences, setRevealedSentences] = useState<Sentence[]>([]);

  // Review phase: matching guesses
  const [matchGuesses, setMatchGuesses] = useState<Record<string, string>>({});
  const [isLockedIn, setIsLockedIn] = useState(false);
  const [lockedInPlayers, setLockedInPlayers] = useState<string[]>([]);

  // Reveal
  const [storyReveals, setStoryReveals] = useState<StoryRevealInfo[]>([]);
  const [matchResults, setMatchResults] = useState<Record<string, MatchResult[]>>({});
  const [scores, setScores] = useState<ScoreEntry[]>([]);

  // Error toast
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          setTotalSteps((data.totalSteps as number) ?? 0);
          setTotalPlayers((data.numPlayers as number) ?? 0);
          // Reset all state
          setMySubmission(null);
          setMyWriteAssignment(null);
          setMatchGuesses({});
          setIsLockedIn(false);
          setLockedInPlayers([]);
          setScores([]);
          setStoryReveals([]);
          setRevealedSentences([]);
          playSound('swoosh');
          break;
        }
        case 'UE_ROLE_ASSIGNED': {
          setAssignedStoryId(data.assignedStoryId as string);
          playSound('chime');
          break;
        }
        case 'UE_WRITE_START': {
          setPhase('WRITE');
          setWriteRound((data.writeRound as number) ?? 1);
          setCurrentStep((data.step as number) ?? 1);
          setTotalSteps((data.totalSteps as number) ?? totalSteps);
          if (typeof data.writeDurationSeconds === 'number') {
            setTimeRemaining(data.writeDurationSeconds as number);
          }
          // Reset write state for new round
          setMySubmission(null);
          setMyWriteAssignment(null);
          setSubmittedCount(0);
          setEditDone(false);
          playSound('chime');
          break;
        }
        case 'UE_WRITE_ASSIGNMENT': {
          // Server tells each player which story to write for this round
          setMyWriteAssignment({
            storyId: data.storyId as string,
            ownerName: data.storyOwnerName as string,
            prompt: data.prompt as string,
            sentences: (data.sentences as Sentence[]) ?? [],
          });
          break;
        }
        case 'UE_SENTENCE_CONFIRMED': {
          setMySubmission(data.text as string);
          playSound('click');
          break;
        }
        case 'UE_SENTENCE_UNSUBMITTED': {
          setMySubmission(null);
          break;
        }
        case 'UE_SUBMISSION_PROGRESS': {
          if (typeof data.submittedCount === 'number') setSubmittedCount(data.submittedCount as number);
          if (typeof data.totalPlayers === 'number') setTotalPlayers(data.totalPlayers as number);
          break;
        }
        case 'UE_EDIT_START': {
          setPhase('EDIT');
          setCurrentStep((data.step as number) ?? currentStep + 1);
          setEditDone(false);
          setEditableStory(null);
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
          playSound('click');
          break;
        }
        case 'UE_STORIES_UPDATED': {
          const updated = data.stories as StoryData[] | undefined;
          if (updated) setStories(updated);
          break;
        }
        // ─── READING Phase Events ───────────────────────────
        case 'UE_READING_START': {
          setPhase('READING');
          const readStories = data.stories as ReadingStoryMeta[] | undefined;
          if (readStories) setReadingStories(readStories);
          setReadingStoryIndex((data.readingStoryIndex as number) ?? 0);
          setReadingSentenceIndex((data.readingSentenceIndex as number) ?? 0);
          setRevealedSentences([]);
          playSound('swoosh');
          break;
        }
        case 'UE_READING_SENTENCE': {
          const sentence = data.sentence as Sentence | undefined;
          if (sentence) {
            setRevealedSentences((prev) => [...prev, sentence]);
            setReadingSentenceIndex((data.sentenceIndex as number) + 1);
          }
          playSound('click');
          break;
        }
        case 'UE_READING_NEXT_STORY': {
          setReadingStoryIndex(data.readingStoryIndex as number);
          setReadingSentenceIndex(0);
          setRevealedSentences([]);
          playSound('swoosh');
          break;
        }
        // ─── REVIEW Phase Events ────────────────────────────
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
        // ─── REVEAL Phase ───────────────────────────────────
        case 'UE_REVEAL': {
          setPhase('REVEAL');
          const reveals = data.storyReveals as StoryRevealInfo[] | undefined;
          if (reveals) setStoryReveals(reveals);
          const mr = data.matchResults as Record<string, MatchResult[]> | undefined;
          if (mr) setMatchResults(mr);
          const sc = data.scores as ScoreEntry[] | undefined;
          if (sc) setScores(sc);
          playSound('victoryFanfare');
          break;
        }
        case 'UE_ERROR': {
          const msg = data.message as string | undefined;
          if (msg) {
            setErrorMessage(msg);
            setTimeout(() => setErrorMessage(null), 3000);
          }
          break;
        }
        case 'UE_GAME_OVER': {
          setPhase('GAME_OVER');
          break;
        }
        case 'TIMER_TICK': {
          const remaining = extractTimerTick(data);
          if (remaining !== undefined) {
            setTimeRemaining(remaining);
            if (remaining <= 3 && remaining > 0) playSound('countdownBeep');
          }
          break;
        }
      }
    },
    [totalSteps, currentStep],
  );

  // Handle full state snapshot (hydration / reconnection)
  const handleStateSnapshot = useCallback(
    (data: Record<string, unknown>) => {
      const p = data.phase as string;
      if (['WRITE', 'EDIT', 'READING', 'REVIEW', 'REVEAL', 'GAME_OVER'].includes(p)) {
        setPhase(p as Phase);
      } else if (p === 'SETUP') {
        setPhase('LOBBY');
      }
      if (Array.isArray(data.stories)) setStories(data.stories as StoryData[]);
      if (Array.isArray(data.players)) setGamePlayers(data.players as PlayerEntry[]);
      if (data.assignedStoryId) setAssignedStoryId(data.assignedStoryId as string);
      if (typeof data.currentStep === 'number') setCurrentStep(data.currentStep as number);
      if (typeof data.totalSteps === 'number') setTotalSteps(data.totalSteps as number);
      if (typeof data.currentWriteRound === 'number') setWriteRound(data.currentWriteRound as number);
      if (typeof data.timeRemaining === 'number') setTimeRemaining(data.timeRemaining as number);
      if (typeof data.submittedCount === 'number') setSubmittedCount(data.submittedCount as number);
      if (typeof data.totalPlayers === 'number') setTotalPlayers(data.totalPlayers as number);
      if (data.myWriteAssignment) {
        // Reconstruct write assignment from snapshot
        const assignStoryId = data.myWriteAssignment as string;
        const storyList = data.stories as StoryData[] | undefined;
        const assignedStory = storyList?.find((s) => s.storyId === assignStoryId);
        if (assignedStory) {
          setMyWriteAssignment({
            storyId: assignedStory.storyId,
            ownerName: assignedStory.ownerName,
            prompt: assignedStory.prompt,
            sentences: assignedStory.sentences,
          });
        }
      }
      if (typeof data.mySubmission === 'string') setMySubmission(data.mySubmission as string);
      else setMySubmission(null);
      if (data.editableStory) setEditableStory(data.editableStory as EditableStory);
      if (data.myMatchGuesses) setMatchGuesses(data.myMatchGuesses as Record<string, string>);
      if (data.isMatchLockedIn) setIsLockedIn(true);
      if (Array.isArray(data.matchLockedIn)) setLockedInPlayers(data.matchLockedIn as string[]);
      if (typeof data.readingStoryIndex === 'number') setReadingStoryIndex(data.readingStoryIndex as number);
      if (typeof data.readingSentenceIndex === 'number') setReadingSentenceIndex(data.readingSentenceIndex as number);
    },
    [],
  );

  // Listen for GAME_ROUND_RESULTS for game-over
  const handleRoundResults = useCallback(() => {
    setPhase('GAME_OVER');
  }, []);

  // Subscribe to socket events + hydrate from store
  useGameSocket({
    onGameAction: handleGameAction,
    onStateSnapshot: handleStateSnapshot,
    onRoundResults: handleRoundResults,
  });

  // ─── Actions ───────────────────────────────────────────────

  const handleSubmitSentence = useCallback(
    (text: string) => {
      if (isSpectator || !myWriteAssignment) return;
      emitGameInput('WRITE_SENTENCE', { storyId: myWriteAssignment.storyId, text });
    },
    [isSpectator, myWriteAssignment],
  );

  const handleUnsubmitSentence = useCallback(() => {
    if (isSpectator || !myWriteAssignment) return;
    emitGameInput('UNSUBMIT_SENTENCE', { storyId: myWriteAssignment.storyId });
  }, [isSpectator, myWriteAssignment]);

  const handleEditTwoWords = useCallback(
    (storyId: string, edits: Array<{ wordIndex: number; newWord: string }>) => {
      if (isSpectator) return;
      emitGameInput('EDIT_WORDS', { storyId, edits });
    },
    [isSpectator],
  );

  const handleSkipEdit = useCallback(() => {
    if (isSpectator) return;
    emitGameInput('SKIP_EDIT', {});
  }, [isSpectator]);

  const handleNextSentence = useCallback(() => {
    emitGameInput('NEXT_SENTENCE', {});
  }, []);

  const handleNextStory = useCallback(() => {
    emitGameInput('NEXT_STORY', {});
  }, []);

  const handleGuessChange = useCallback(
    (storyId: string, guessedEditorId: string) => {
      if (isSpectator) return;
      setMatchGuesses((prev) => {
        const next = { ...prev };
        // If this editor was already assigned to a different story, remove that assignment
        if (guessedEditorId) {
          for (const [sid, eid] of Object.entries(next)) {
            if (eid === guessedEditorId && sid !== storyId) {
              delete next[sid];
            }
          }
        }
        next[storyId] = guessedEditorId;
        // Remove empty selections
        if (!guessedEditorId) delete next[storyId];
        emitGameInput('SUBMIT_MATCHING', { guesses: next });
        return next;
      });
    },
    [isSpectator],
  );

  const handleLockIn = useCallback(() => {
    if (isSpectator) return;
    emitGameInput('LOCK_IN_MATCHING', {});
    setIsLockedIn(true);
  }, [isSpectator]);

  // ─── Derived Values ────────────────────────────────────────

  const currentReadingStory = readingStories[readingStoryIndex] ?? null;

  /** Map storyId → display number (1-indexed order from stories array). */
  const getStoryNumber = useCallback(
    (storyId: string): number => {
      const idx = stories.findIndex((s) => s.storyId === storyId);
      if (idx !== -1) return idx + 1;
      // Fallback: check readingStories
      const rIdx = readingStories.findIndex((s) => s.storyId === storyId);
      return rIdx !== -1 ? rIdx + 1 : 1;
    },
    [stories, readingStories],
  );

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Spectator indicator */}
      {isSpectator && (
        <div className="rounded-lg bg-(--rmhbox-rare-dim) border border-(--rmhbox-rare)/30 px-3 py-1.5 text-xs font-medium text-(--rmhbox-rare)">
          👁 {t("spectating", { defaultValue: "Spectating" })}
        </div>
      )}

      {/* Error toast */}
      {errorMessage && (
        <div className="rounded-lg bg-(--rmhbox-danger-dim) border border-(--rmhbox-danger)/30 px-3 py-1.5 text-xs text-(--rmhbox-danger)">
          {errorMessage}
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
              {t("ue-setting-up-stories", { defaultValue: "Setting up the stories…" })}
            </p>
          </motion.div>
        )}

        {/* WRITE — each player writes for one assigned story */}
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
                {t("ue-write-step", { defaultValue: "Step {{currentStep}} / {{totalSteps}} · Writing Round {{writeRound}}", currentStep, totalSteps, writeRound })}
              </p>
              <p className="text-sm text-(--rmhbox-text-muted)">
                {t("ue-players-submitted", { defaultValue: "{{submittedCount}}/{{totalPlayers}} players submitted", submittedCount, totalPlayers })}
              </p>
            </div>

            {/* Write assignment — uses WriteInput which includes "Story so far" panel */}
            {myWriteAssignment && !isSpectator ? (
              <div className="w-full max-w-lg flex flex-col gap-3">
                {/* Write input or submitted indicator */}
                {mySubmission ? (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 rounded-lg bg-(--rmhbox-success-dim) border border-(--rmhbox-success)/30 px-3 py-2 text-sm text-(--rmhbox-success)">
                      ✓ {mySubmission}
                    </p>
                    <button
                      onClick={handleUnsubmitSentence}
                      className="rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) px-3 py-2 text-xs text-(--rmhbox-text-muted) hover:bg-(--rmhbox-border) transition-colors"
                    >
                      {t("edit", { defaultValue: "Edit" })}
                    </button>
                  </div>
                ) : (
                  <WriteInput
                    storyContext={myWriteAssignment.sentences.map((s) => ({
                      authorName: s.authorName,
                      text: s.text,
                    }))}
                    storyPrompt={myWriteAssignment.prompt}
                    storyNumber={getStoryNumber(myWriteAssignment.storyId)}
                    timeRemaining={timeRemaining}
                    onSubmit={handleSubmitSentence}
                  />
                )}
              </div>
            ) : isSpectator ? (
              <p className="text-xs text-(--rmhbox-text-muted) italic text-center">
                {t("ue-watching-players-write", { defaultValue: "Watching players write…" })}
              </p>
            ) : (
              <p className="text-xs text-(--rmhbox-text-muted) italic text-center">
                {t("ue-waiting-for-assignment", { defaultValue: "Waiting for assignment…" })}
              </p>
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
            <div className="text-center">
              <p className="text-xs font-medium text-(--rmhbox-text-muted) uppercase tracking-wider">
                {t("ue-edit-step", { defaultValue: "Step {{currentStep}} / {{totalSteps}} · Editing", currentStep, totalSteps })}
              </p>
            </div>

            {editableStory && !editDone ? (
              <StoryEditor
                editableStory={editableStory}
                timeRemaining={timeRemaining}
                onEdit={handleEditTwoWords}
                onSkip={handleSkipEdit}
              />
            ) : editDone ? (
              <div className="flex flex-col items-center gap-3 p-8">
                <p className="text-lg font-bold text-(--rmhbox-success)">✓ {t("ue-edit-complete", { defaultValue: "Edit Complete" })}</p>
                <p className="text-sm text-(--rmhbox-text-muted)">
                  {t("ue-waiting-for-editors", { defaultValue: "Waiting for other editors…" })}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 p-8">
                <p className="text-sm text-(--rmhbox-text-muted) italic">
                  {isSpectator ? t("ue-watching-editors-work", { defaultValue: "Watching editors work…" }) : t("ue-editors-reviewing", { defaultValue: "Editors are reviewing the stories…" })}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* READING — host-driven sentence reveal */}
        {phase === 'READING' && (
          <motion.div
            key="reading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex w-full flex-col items-center gap-4"
          >
            <div className="text-center">
              <p className="text-xs font-medium text-(--rmhbox-text-muted) uppercase tracking-wider">
                {t("ue-reading-stories", { defaultValue: "Reading Stories · {{current}} / {{total}}", current: readingStoryIndex + 1, total: readingStories.length })}
              </p>
            </div>

            {currentReadingStory && (
              <div className="w-full max-w-lg flex flex-col gap-3">
                {/* Slim "Story so far" panel — shows story number, prompt as sentence, revealed sentences */}
                <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-(--rmhbox-text-muted)">
                    {t("ue-story-number", { defaultValue: "Story {{number}}", number: readingStoryIndex + 1 })}
                  </p>
                  <div className="space-y-1.5">
                    {/* Prompt shown as first sentence */}
                    <p className="text-sm leading-relaxed text-(--rmhbox-text)">
                      <span className="opacity-50 text-xs">(prompt)</span> {currentReadingStory.prompt}
                    </p>
                    {revealedSentences.map((s, i) => (
                      <p key={i} className="text-sm leading-relaxed text-(--rmhbox-text)">
                        <span className="opacity-50 text-xs">({s.authorName})</span> {s.text}
                      </p>
                    ))}
                  </div>

                  {revealedSentences.length === 0 && (
                    <p className="mt-2 text-xs text-(--rmhbox-text-muted) italic text-center">
                      {t("ue-press-next-sentence", { defaultValue: "Press \"Next Sentence\" to begin reading…" })}
                    </p>
                  )}
                </div>

                {/* Host controls */}
                {isHost && (
                  <div className="flex items-center justify-center gap-3">
                    {readingSentenceIndex < currentReadingStory.sentenceCount ? (
                      <button
                        onClick={handleNextSentence}
                        className="flex items-center gap-1.5 rounded-lg bg-(--rmhbox-accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                      >
                        {t("ue-next-sentence", { defaultValue: "Next Sentence" })}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handleNextStory}
                        className="flex items-center gap-1.5 rounded-lg bg-(--rmhbox-accent) px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                      >
                        {readingStoryIndex + 1 < readingStories.length ? t("ue-next-story", { defaultValue: "Next Story" }) : t("ue-start-matching", { defaultValue: "Start Matching" })}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}

                {!isHost && (
                  <p className="text-xs text-(--rmhbox-text-muted) italic text-center">
                    {t("ue-host-controlling-pace", { defaultValue: "The host is controlling the reading pace…" })}
                  </p>
                )}

                {/* Sentence progress indicator */}
                <p className="text-xs text-(--rmhbox-text-muted) text-center">
                  {t("ue-sentences-revealed", { defaultValue: "{{revealed}} / {{total}} sentences revealed", revealed: readingSentenceIndex, total: currentReadingStory.sentenceCount })}
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
              myEditedStoryId={assignedStoryId}
              currentGuesses={matchGuesses}
              lockedIn={isLockedIn || isSpectator}
              lockedInPlayers={lockedInPlayers}
              onGuessChange={handleGuessChange}
              onLockIn={handleLockIn}
            />
          </motion.div>
        )}

        {/* REVEAL — full stories with in-situ edits, matching panel card style */}
        {phase === 'REVEAL' && storyReveals.length > 0 && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-(--rmhbox-text)"
          >
            <div className="flex flex-col items-center gap-1">
              <h2 className="text-lg font-bold">{t("ue-truth-revealed", { defaultValue: "The Truth Revealed" })}</h2>
              <p className="text-xs text-(--rmhbox-text-muted)">
                {t("ue-full-stories-edits-highlighted", { defaultValue: "Full stories with edits highlighted" })}
              </p>
            </div>

            {/* Story reveal cards — matching panel style */}
            <div className="flex w-full flex-col gap-4">
              {storyReveals.map((reveal, revealIdx) => {
                const myGuess = matchResults[playerId]?.find((r) => r.storyId === reveal.storyId);
                const sortedSentences = [...reveal.sentences].sort(
                  (a, b) => a.roundNumber - b.roundNumber,
                );

                return (
                  <motion.div
                    key={reveal.storyId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: revealIdx * 0.08, duration: 0.35 }}
                    className="flex flex-col gap-3 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
                  >
                    {/* Story header with match result badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t("ue-story-number", { defaultValue: "Story {{number}}", number: revealIdx + 1 })}</span>
                      {myGuess && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          myGuess.correct
                            ? 'bg-(--rmhbox-success-dim) text-(--rmhbox-success)'
                            : 'bg-(--rmhbox-danger-dim) text-(--rmhbox-danger)'
                        }`}>
                          {myGuess.correct ? `✓ ${t("correct", { defaultValue: "Correct" })}` : `✗ ${t("wrong", { defaultValue: "Wrong" })}`}
                        </span>
                      )}
                    </div>

                    {/* Editor reveal */}
                    <p className="text-sm text-(--rmhbox-text-muted)">
                      {t("ue-edited-by", { defaultValue: "Edited by:" })}{' '}
                      <span className="font-bold text-(--rmhbox-accent)">{reveal.editorName}</span>
                    </p>

                    {/* Full story with in-situ edit highlighting */}
                    <div className="flex flex-col gap-1 rounded-lg bg-(--rmhbox-surface)/60 p-3 text-sm leading-relaxed">
                      {/* Prompt as first sentence */}
                      <span className="text-(--rmhbox-text)">
                        <span className="opacity-50 text-xs">(prompt)</span> {reveal.prompt}
                      </span>

                      {/* Sentences with edits shown inline */}
                      {sortedSentences.map((sentence, sIdx) => {
                        const sentenceEdits = reveal.edits.filter(
                          (e) => e.sentenceIndex === sIdx,
                        );

                        if (sentenceEdits.length === 0) {
                          return <span key={sIdx}>{sentence.text} </span>;
                        }

                        // Build edit map by word index for in-situ display
                        const editByWordIndex = new Map<number, WordEditView>();
                        for (const edit of sentenceEdits) {
                          editByWordIndex.set(edit.wordIndex, edit);
                        }

                        const words = sentence.text.split(/\s+/).filter((w) => w.length > 0);

                        return (
                          <span key={sIdx}>
                            {words.map((word, wi) => {
                              const edit = editByWordIndex.get(wi);
                              if (edit) {
                                return (
                                  <span key={wi}>
                                    {wi > 0 && ' '}
                                    <span className="inline-flex items-center gap-0.5 rounded bg-(--rmhbox-rare-dim) px-1 py-0.5 text-[inherit]">
                                      <span className="line-through text-(--rmhbox-danger)">{edit.originalWord}</span>
                                      <span className="text-(--rmhbox-text-muted) text-[0.75em]">→</span>
                                      <span className="text-(--rmhbox-success) font-medium">{edit.newWord}</span>
                                    </span>
                                  </span>
                                );
                              }
                              return (
                                <span key={wi}>
                                  {wi > 0 && ' '}
                                  {word}
                                </span>
                              );
                            })}{' '}
                          </span>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Score summary */}
            {scores.length > 0 && (
              <div className="w-full max-w-sm">
                <h3 className="text-sm font-bold text-(--rmhbox-text) mb-2 text-center">{t("scores", { defaultValue: "Scores" })}</h3>
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
              {t("ue-game-over-calculating", { defaultValue: "Game over — calculating results…" })}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
