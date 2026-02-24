/**
 * HumanKeyboardGame — Phase router for the Human Keyboard minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   SENTENCE_REVEAL → Animated sentence reveal
 *   TYPING          → Active typing phase with keyboard + progress
 *   RESULTS         → HumanKeyboardResults (stats + MVP)
 *
 * Handles server actions:
 *   HK_SENTENCE_REVEAL, HK_KEY_ASSIGNMENT, HK_KEY_CORRECT,
 *   HK_KEY_WRONG, HK_KEY_WRONG_PLAYER, HK_CURSOR_LOCKED,
 *   HK_SPACE_AUTO, HK_RESHUFFLE_WARNING, HK_RESHUFFLE,
 *   HK_COMPLETE, HK_RESULTS, TIMER_TICK
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { useHeaderTimer } from '../MinigameRenderer';
import SentenceDisplay from './SentenceDisplay';
import KeyAssignment from './KeyAssignment';
import KeyboardLayout from './KeyboardLayout';
import ProgressBar from './ProgressBar';
import ReshuffleWarning from './ReshuffleWarning';
import HumanKeyboardResults from './HumanKeyboardResults';
import type { PlayerResult, TeamPerformance } from './HumanKeyboardResults';

type Phase = 'SENTENCE_REVEAL' | 'TYPING' | 'RESULTS';

/** Helper: emit a game input action */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface HumanKeyboardGameProps {
  playerId: string;
  playerName: string;
}

export default function HumanKeyboardGame({ playerId, playerName: _playerName }: HumanKeyboardGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('SENTENCE_REVEAL');
  const [sentence, setSentence] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [myKeys, setMyKeys] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [locked, setLocked] = useState(false);
  const [reshuffleCountdown, setReshuffleCountdown] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);

  // Stats tracking
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(false);

  // Results
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance | null>(null);

  const { startTimer, tickTimer, clearTimer } = useHeaderTimer();

  // Derived: next expected letter
  const nextExpectedLetter =
    cursorPosition < sentence.length
      ? sentence[cursorPosition].toUpperCase()
      : null;

  // Whether the expected letter is one of this player's keys
  const isMyTurn =
    nextExpectedLetter != null &&
    nextExpectedLetter !== ' ' &&
    myKeys.includes(nextExpectedLetter);

  // Handle incoming game actions
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'HK_SENTENCE_REVEAL': {
          setPhase('SENTENCE_REVEAL');
          setSentence(data.sentence as string);
          setCursorPosition(0);
          setProgress(0);
          setMyKeys([]);
          setCorrectCount(0);
          setWrongCount(0);
          setLocked(false);
          setCompleted(false);
          if (typeof data.duration === 'number') {
            startTimer(data.duration as number);
          }
          break;
        }
        case 'HK_KEY_ASSIGNMENT': {
          setPhase('TYPING');
          const keys = data.keys as string[];
          if (keys) setMyKeys(keys.map((k) => k.toUpperCase()));
          break;
        }
        case 'HK_KEY_CORRECT': {
          const pos = data.cursorPosition as number;
          if (typeof pos === 'number') setCursorPosition(pos);
          if (typeof data.progress === 'number') setProgress(data.progress as number);
          // If this player pressed the key
          if (data.userId === playerId) {
            setCorrectCount((c: number) => c + 1);
          }
          setLocked(false);
          break;
        }
        case 'HK_KEY_WRONG': {
          if (data.userId === playerId) {
            setWrongCount((c: number) => c + 1);
            setWrongFlash(true);
            setTimeout(() => setWrongFlash(false), 300);
          }
          break;
        }
        case 'HK_KEY_WRONG_PLAYER': {
          // Wrong player pressed — brief visual feedback
          if (data.userId === playerId) {
            setWrongFlash(true);
            setTimeout(() => setWrongFlash(false), 300);
          }
          break;
        }
        case 'HK_CURSOR_LOCKED': {
          setLocked(true);
          break;
        }
        case 'HK_SPACE_AUTO': {
          const pos = data.cursorPosition as number;
          if (typeof pos === 'number') setCursorPosition(pos);
          if (typeof data.progress === 'number') setProgress(data.progress as number);
          break;
        }
        case 'HK_RESHUFFLE_WARNING': {
          setReshuffleCountdown(data.seconds as number);
          break;
        }
        case 'HK_RESHUFFLE': {
          setReshuffleCountdown(null);
          const keys = data.keys as string[];
          if (keys) setMyKeys(keys.map((k) => k.toUpperCase()));
          break;
        }
        case 'HK_COMPLETE': {
          setCompleted(true);
          setProgress(1);
          clearTimer();
          break;
        }
        case 'HK_RESULTS': {
          setPhase('RESULTS');
          clearTimer();
          if (Array.isArray(data.playerResults)) {
            setPlayerResults(data.playerResults as PlayerResult[]);
          }
          if (data.teamPerformance) {
            setTeamPerformance(data.teamPerformance as TeamPerformance);
          }
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl && typeof pl.totalDuration === 'number') {
            startTimer(pl.totalDuration as number, pl.timeRemaining as number | undefined);
          }
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') tickTimer(remaining);
          break;
        }
      }
    },
    [playerId, startTimer, tickTimer, clearTimer],
  );

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(S2C.GAME_ACTION, handleGameAction);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
    };
  }, [handleGameAction]);

  // Hydrate from Zustand gameState snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (p === 'SENTENCE_REVEAL' || p === 'TYPING' || p === 'RESULTS') {
      setPhase(p);
    }
    if (snapshot.sentence) setSentence(snapshot.sentence as string);
    if (typeof snapshot.cursorPosition === 'number') setCursorPosition(snapshot.cursorPosition as number);
    if (typeof snapshot.progress === 'number') setProgress(snapshot.progress as number);
    if (Array.isArray(snapshot.myKeys)) setMyKeys((snapshot.myKeys as string[]).map((k) => k.toUpperCase()));
  }, []);

  // Handle player key press
  const handleKeyPress = useCallback(
    (key: string) => {
      if (locked) return;
      emitGameInput('HK_PRESS', { key: key.toLowerCase() });
    },
    [locked],
  );

  return (
    <AnimatePresence mode="wait">
      {/* SENTENCE_REVEAL — animated sentence display */}
      {phase === 'SENTENCE_REVEAL' && (
        <motion.div
          key="sentence-reveal"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 text-(--rmhbox-text)"
        >
          <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">
            Type this sentence together!
          </p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
            className="max-w-md"
          >
            <SentenceDisplay sentence={sentence} displayCursorPosition={0} />
          </motion.div>
          <p className="text-sm text-(--rmhbox-text-muted)">Waiting for key assignments…</p>
        </motion.div>
      )}

      {/* TYPING — active game phase */}
      {phase === 'TYPING' && (
        <motion.div
          key="typing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`relative flex w-full flex-col items-center gap-4 ${
            wrongFlash ? 'animate-[shake_0.3s_ease-in-out]' : ''
          }`}
        >
          <ReshuffleWarning secondsRemaining={reshuffleCountdown} />

          <SentenceDisplay sentence={sentence} displayCursorPosition={cursorPosition} />

          <ProgressBar progress={progress} />

          <KeyAssignment
            myKeys={myKeys}
            nextExpectedLetter={nextExpectedLetter}
            isMyTurn={isMyTurn}
            onKeyPress={handleKeyPress}
          />

          <KeyboardLayout
            myKeys={myKeys}
            nextExpectedLetter={isMyTurn ? nextExpectedLetter : null}
            onKeyPress={handleKeyPress}
          />

          <div className="flex gap-4 text-xs text-(--rmhbox-text-muted)">
            <span>✓ {correctCount}</span>
            <span>✗ {wrongCount}</span>
          </div>
        </motion.div>
      )}

      {/* RESULTS — game over */}
      {phase === 'RESULTS' && (
        <motion.div
          key="results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <HumanKeyboardResults
            playerResults={playerResults}
            teamPerformance={teamPerformance}
            completed={completed}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
