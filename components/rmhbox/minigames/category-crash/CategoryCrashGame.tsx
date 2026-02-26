/**
 * CategoryCrashGame — Phase router for the Category Crash minigame.
 *
 * A brainstorming game where players fill in 5 categories with answers
 * starting with a random letter. After input, a peer-review phase lets
 * players "crash" (challenge) dubious answers. Unique, unchallenged
 * answers score the most.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   REVEAL            → Letter + category reveal animation
 *   INPUT             → CategoryInput (5 text fields)
 *   PEER_REVIEW       → PeerReview (crash grid)
 *   CRASH_RESOLUTION  → Crash resolution animation
 *   ROUND_RESULTS     → CategoryCrashResults (de-anonymized scores)
 *
 * Handles server actions:
 *   CC_ROUND_START, CC_INPUT_START, CC_PEER_REVIEW_START,
 *   CC_CRASH_RESOLUTION_START, CC_ROUND_RESULTS, CC_LOCK_STATUS,
 *   CC_ANSWERS_SAVED, CC_ANSWERS_SUBMITTED, CC_CRASH_RECORDED,
 *   CC_UNCRASH_RECORDED, CC_CRASH_REJECTED, CC_SAVE_REJECTED,
 *   CC_SUBMIT_REJECTED, TIMER_TICK
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import CategoryInput from './CategoryInput';
import PeerReview from './PeerReview';
import CategoryCrashResults from './CategoryCrashResults';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'REVEAL' | 'INPUT' | 'PEER_REVIEW' | 'CRASH_RESOLUTION' | 'ROUND_RESULTS' | 'GAME_OVER';

export interface Category {
  id: string;
  name: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  examples?: string[];
}

export interface AnonymizedAnswerSet {
  anonymousLabel: string;
  answers: (string | null)[];
}

export interface CCPlayerResult {
  userId: string;
  userName: string;
  answers: (string | null)[];
  pointsPerCategory: number[];
  roundScore: number;
  crashedIndices: number[];
  duplicateIndices: number[];
  invalidIndices: number[];
  uniqueIndices: number[];
}

export interface CCRoundResults {
  roundNumber: number;
  letter: string;
  categories: Category[];
  playerResults: Record<string, CCPlayerResult>;
}

interface CrashEntry {
  targetUserId: string;
  categoryIndex: number;
}

/** Helper: emit a game input action */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface CategoryCrashGameProps {
  playerId: string;
  playerName: string;
}

export default function CategoryCrashGame({ playerId, playerName: _playerName }: CategoryCrashGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('REVEAL');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(2);
  const [letter, setLetter] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [myAnswers, setMyAnswers] = useState<(string | null)[]>([null, null, null, null, null]);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedCount, setLockedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [anonymizedAnswers, setAnonymizedAnswers] = useState<AnonymizedAnswerSet[]>([]);
  const [myCrashes, setMyCrashes] = useState<CrashEntry[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [roundResults, setRoundResults] = useState<CCRoundResults | null>(null);
  const [anonymizationMap, setAnonymizationMap] = useState<Record<string, string>>({});
  const [myAnonymousLabel, setMyAnonymousLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track spectator status
  const isSpectator = useRMHboxStore((s) => s.lobby?.myRole === 'spectator');

  const players = useRMHboxStore((s) => s.lobby?.players);

  /** Handle incremental GAME_ACTION events */
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;

      switch (type) {
        case 'CC_ROUND_START': {
          setPhase('REVEAL');
          setCurrentRound(data.round as number);
          setTotalRounds(data.totalRounds as number);
          setLetter(data.letter as string);
          setCategories(data.categories as Category[]);
          setTimeRemaining(data.duration as number);
          setMyAnswers([null, null, null, null, null]);
          setIsLocked(false);
          setLockedCount(0);
          setMyCrashes([]);
          setRoundResults(null);
          setAnonymizedAnswers([]);
          // Server will send CC_INPUT_START when the reveal period ends
          break;
        }
        case 'CC_INPUT_START': {
          setPhase('INPUT');
          setTimeRemaining(data.timeRemaining as number ?? data.duration as number);
          break;
        }
        case 'CC_ANSWERS_SAVED': {
          const saved = data.answers as (string | null)[];
          if (saved) setMyAnswers(saved);
          break;
        }
        case 'CC_ANSWERS_SUBMITTED': {
          setIsLocked(true);
          break;
        }
        case 'CC_LOCK_STATUS': {
          setLockedCount(data.lockedCount as number);
          setTotalPlayers(data.totalPlayers as number);
          break;
        }
        case 'CC_PEER_REVIEW_START': {
          setPhase('PEER_REVIEW');
          setAnonymizedAnswers(data.anonymizedAnswers as AnonymizedAnswerSet[]);
          setTimeRemaining(data.duration as number ?? data.timeRemaining as number);
          if (data.categories) setCategories(data.categories as Category[]);
          if (data.letter) setLetter(data.letter as string);
          setMyCrashes([]);
          break;
        }
        case 'CC_MY_ANONYMOUS_LABEL': {
          setMyAnonymousLabel(data.myAnonymousLabel as string);
          break;
        }
        case 'CC_CRASH_RECORDED': {
          const entry: CrashEntry = {
            targetUserId: data.targetUserId as string,
            categoryIndex: data.categoryIndex as number,
          };
          setMyCrashes((prev) => [...prev, entry]);
          break;
        }
        case 'CC_UNCRASH_RECORDED': {
          const target = data.targetUserId as string;
          const catIdx = data.categoryIndex as number;
          setMyCrashes((prev) =>
            prev.filter((c) => !(c.targetUserId === target && c.categoryIndex === catIdx)),
          );
          break;
        }
        case 'CC_CRASH_RESOLUTION_START': {
          setPhase('CRASH_RESOLUTION');
          setTimeRemaining(data.duration as number ?? 5);
          break;
        }
        case 'CC_ROUND_RESULTS': {
          setPhase('ROUND_RESULTS');
          setRoundResults(data.results as CCRoundResults);
          const newScores = data.scores as Record<string, number>;
          setScores(newScores);
          setAnonymizationMap(data.anonymizationMap as Record<string, string> ?? {});

          // Update footer score in the lobby store so GameShell reflects
          // the cumulative score between CC sub-rounds.
          const myNewScore = newScores?.[playerId];
          if (typeof myNewScore === 'number') {
            useRMHboxStore.setState((state) => ({
              lobby: state.lobby
                ? {
                    ...state.lobby,
                    players: state.lobby.players.map((p) =>
                      p.userId === state.lobby!.myUserId
                        ? { ...p, score: myNewScore }
                        : p,
                    ),
                  }
                : null,
            }));
          }
          break;
        }
        case 'CC_SAVE_REJECTED':
        case 'CC_SUBMIT_REJECTED':
        case 'CC_CRASH_REJECTED':
        case 'CC_UNCRASH_REJECTED': {
          setErrorMsg(data.reason as string);
          globalThis.setTimeout(() => setErrorMsg(null), 3000);
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            setTimeRemaining(pl.timeRemaining as number);
          }
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') setTimeRemaining(remaining);
          break;
        }
      }
    },
    [playerId],
  );

  /** Handle full state snapshot (reconnection) */
  const handleStateSnapshot = useCallback(
    (data: Record<string, unknown>) => {
      setPhase(data.phase as Phase);
      setCurrentRound(data.currentRound as number);
      setTotalRounds(data.totalRounds as number);
      setLetter(data.letter as string);
      setCategories(data.categories as Category[]);
      setScores(data.scores as Record<string, number> ?? {});
      setTimeRemaining(data.timeRemaining as number ?? 0);
      if (data.myAnswers) setMyAnswers(data.myAnswers as (string | null)[]);
      if (data.isLocked !== undefined) setIsLocked(data.isLocked as boolean);
      if (data.lockedCount !== undefined) setLockedCount(data.lockedCount as number);
      if (data.totalPlayers !== undefined) setTotalPlayers(data.totalPlayers as number);
      if (data.anonymizedAnswers) setAnonymizedAnswers(data.anonymizedAnswers as AnonymizedAnswerSet[]);
      if (data.myCrashes) setMyCrashes(data.myCrashes as CrashEntry[]);
      if (data.myAnonymousLabel) setMyAnonymousLabel(data.myAnonymousLabel as string);
      if (data.roundResults) setRoundResults(data.roundResults as CCRoundResults);
      if (data.anonymizationMap) setAnonymizationMap(data.anonymizationMap as Record<string, string>);
    },
    [],
  );

  /** Handle game-over results from the game coordinator */
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      if (data.rankings) setPhase('GAME_OVER');
    },
    [],
  );

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on(S2C.GAME_ACTION, handleGameAction);
    socket.on(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
    socket.on(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
      socket.off(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
      socket.off(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    };
  }, [handleGameAction, handleStateSnapshot, handleRoundResults]);

  // Hydrate from the Zustand gameState snapshot on mount.
  // This fixes the race condition where the server broadcasts initial game state
  // before the lazy-loaded component has mounted and subscribed to socket events.
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (snapshot && Object.keys(snapshot).length > 0 && snapshot.phase) {
      handleStateSnapshot(snapshot as Record<string, unknown>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Action Handlers ────────────────────────────────────────────

  const handleSaveAnswers = useCallback((answers: (string | null)[]) => {
    if (isSpectator) return;
    setMyAnswers(answers);
    emitGameInput('SAVE_ANSWERS', { answers });
  }, [isSpectator]);

  const handleCrash = useCallback((targetUserId: string, categoryIndex: number) => {
    if (isSpectator) return;
    emitGameInput('CRASH_ANSWER', { targetUserId, categoryIndex });
  }, [isSpectator]);

  const handleUncrash = useCallback((targetUserId: string, categoryIndex: number) => {
    if (isSpectator) return;
    emitGameInput('UNCRASH_ANSWER', { targetUserId, categoryIndex });
  }, [isSpectator]);

  // Player name lookup
  const getPlayerName = useCallback(
    (userId: string) => players?.find((p) => p.userId === userId)?.userName ?? userId,
    [players],
  );

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4 text-(--rmhbox-text)">
      {/* Error toast */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-lg bg-(--rmhbox-danger-dim) border border-(--rmhbox-danger)/40 px-4 py-2 text-center text-sm text-(--rmhbox-danger)"
          >
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* REVEAL — Letter + category animation */}
        {phase === 'REVEAL' && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center gap-6 py-8"
          >
            <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">
              Round {currentRound} of {totalRounds}
            </p>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-(--rmhbox-accent) bg-(--rmhbox-accent)/10 text-5xl font-extrabold text-(--rmhbox-accent)"
            >
              {letter}
            </motion.div>
            <div className="flex flex-wrap justify-center gap-2">
              {categories.map((cat, i) => (
                <motion.span
                  key={cat.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 + i * 0.15 }}
                  className="rounded-full border border-(--rmhbox-border) bg-(--rmhbox-surface) px-3 py-1 text-sm font-medium"
                >
                  {cat.name}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        {/* INPUT — Fill in 5 categories */}
        {phase === 'INPUT' && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CategoryInput
              letter={letter}
              categories={categories}
              myAnswers={myAnswers}
              isLocked={isLocked}
              timeRemaining={timeRemaining}
              onSave={handleSaveAnswers}
            />
          </motion.div>
        )}

        {/* PEER_REVIEW — Crash other players' answers */}
        {phase === 'PEER_REVIEW' && (
          <motion.div
            key="peer-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <PeerReview
              letter={letter}
              categories={categories}
              anonymizedAnswers={anonymizedAnswers}
              myCrashes={myCrashes}
              timeRemaining={timeRemaining}
              currentUserId={playerId}
              myAnonymousLabel={myAnonymousLabel}
              onCrash={handleCrash}
              onUncrash={handleUncrash}
            />
          </motion.div>
        )}

        {/* CRASH_RESOLUTION — Animation of results */}
        {phase === 'CRASH_RESOLUTION' && (
          <motion.div
            key="crash-resolution"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-3 py-12"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="text-4xl"
            >
              <Flame className="h-10 w-10 text-orange-400" />
            </motion.div>
            <h3 className="text-lg font-bold">Resolving Crashes…</h3>
            <p className="text-sm text-(--rmhbox-text-muted)">Tallying votes and checking answers</p>
          </motion.div>
        )}

        {/* ROUND_RESULTS / GAME_OVER — Full results display */}
        {(phase === 'ROUND_RESULTS' || phase === 'GAME_OVER') && roundResults && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CategoryCrashResults
              roundResults={roundResults}
              scores={scores}
              anonymizationMap={anonymizationMap}
              currentUserId={playerId}
              currentRound={currentRound}
              totalRounds={totalRounds}
              isGameOver={phase === 'GAME_OVER'}
              getPlayerName={getPlayerName}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
