/**
 * FactOrFrictionGame — Phase router for the Fact or Friction minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   QUESTION_REVEAL → QuestionCard with entrance animation
 *   ANSWER          → QuestionCard + PointPotDisplay + OptionButtons + ScoreRibbon
 *   ANSWER_REVEAL   → AnswerReveal
 *   PAUSE           → Brief transition
 *
 * Handles server actions:
 *   FF_QUESTION, FF_POT_TICK, FF_ANSWER_LOCKED, FF_PLAYER_ANSWERED,
 *   FF_ANSWER_REVEAL, FF_SCORE_UPDATE, TIMER_TICK, TIMER_START,
 *   MINIGAME_ROUND, FF_GAME_OVER
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
import { playSound } from '@/lib/rmhbox/audio';
import QuestionCard from './QuestionCard';
import PointPotDisplay from './PointPotDisplay';
import OptionButton from './OptionButton';
import type { OptionState } from './OptionButton';
import AnswerReveal from './AnswerReveal';
import type { PlayerResult } from './AnswerReveal';
import ScoreRibbon from './ScoreRibbon';

type Phase = 'QUESTION_REVEAL' | 'ANSWER' | 'ANSWER_REVEAL' | 'PAUSE' | 'GAME_OVER';

interface QuestionData {
  question: string;
  category: string;
  difficulty: string;
  options: string[];
  questionIndex: number;
  totalQuestions: number;
  correctIndex?: number;
}

/** Helper: emit a game input action with the correct GameInputSchema shape */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface FactOrFrictionGameProps {
  playerId: string;
  playerName: string;
}

export default function FactOrFrictionGame({ playerId, playerName: _playerName }: FactOrFrictionGameProps) {
  void _playerName; // Consumed by MinigameProps interface; not directly used

  const [phase, setPhase] = useState<Phase>('QUESTION_REVEAL');
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [potValue, setPotValue] = useState(() => {
    const snap = useRMHboxStore.getState().gameState;
    return (snap?.potValue as number) ?? 0;
  });
  const [potMaxValue, setPotMaxValue] = useState(() => {
    const snap = useRMHboxStore.getState().gameState;
    return (snap?.potValue as number) ?? 0;
  });
  const [timeRemaining, setTimeRemaining] = useState(15);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [lockedPotValue, setLockedPotValue] = useState<number | null>(null);
  const [playersAnswered, setPlayersAnswered] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [scoreChange, setScoreChange] = useState<number | null>(null);
  const [revealData, setRevealData] = useState<{
    correctIndex: number;
    correctAnswer: string;
    options: string[];
    playerResults: PlayerResult[];
  } | null>(null);

  const players = useRMHboxStore((s) => s.lobby?.players);
  const myRole = useRMHboxStore((s) => s.lobby?.myRole);
  const isSpectator = myRole === 'spectator';
  const totalPlayers = players?.filter((p) => p.isConnected).length ?? 0;

  // Handle incoming game actions
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'FF_QUESTION': {
          setPhase('QUESTION_REVEAL');
          // Server sends question data as a nested object under `data.question`
          const qObj = data.question as Record<string, unknown>;
          const q: QuestionData = {
            question: qObj.question as string,
            category: qObj.category as string,
            difficulty: qObj.difficulty as string,
            options: qObj.options as string[],
            questionIndex: data.questionIndex as number,
            totalQuestions: data.totalQuestions as number,
          };
          setQuestionData(q);
          // Pot value already includes difficulty scaling from the server
          setPotValue(data.potValue as number ?? 1000);
          setPotMaxValue(data.potValue as number ?? 1000);
          setMyAnswer(null);
          setLockedPotValue(null);
          setPlayersAnswered(0);
          setScoreChange(null);
          setRevealData(null);
          playSound('swoosh');

          // Transition to ANSWER phase after reveal period
          // (server will send a separate event or we rely on timer)
          break;
        }
        case 'FF_ANSWER_PHASE': {
          setPhase('ANSWER');
          // Server sends `duration` (total answer time), not `timeRemaining`
          if (typeof data.duration === 'number') {
            setTimeRemaining(data.duration as number);
          }
          // Update pot value from server (already difficulty-scaled)
          if (typeof data.potValue === 'number') {
            setPotValue(data.potValue as number);
          }
          break;
        }
        case 'FF_POT_TICK': {
          // Pot value already includes difficulty scaling
          const newPot = data.potValue as number;
          if (typeof newPot === 'number') setPotValue(newPot);
          break;
        }
        case 'FF_ANSWER_LOCKED': {
          // Confirmation that our answer was accepted
          const locked = data.potValueAtSubmission as number | undefined;
          if (typeof locked === 'number') setLockedPotValue(locked);
          playSound('click');
          break;
        }
        case 'FF_PLAYER_ANSWERED': {
          // Another player answered — increment count
          setPlayersAnswered((prev) => prev + 1);
          break;
        }
        case 'FF_ANSWER_REVEAL': {
          setPhase('ANSWER_REVEAL');
          const cIdx = data.correctIndex as number;
          const opts = (data.options as string[]) ?? questionData?.options ?? [];
          const results = (data.playerResults as PlayerResult[]) ?? [];
          setRevealData({
            correctIndex: cIdx,
            correctAnswer: opts[cIdx] ?? '',
            options: opts,
            playerResults: results,
          });

          // Play sound based on result
          const myResult = results.find((r: PlayerResult) => r.userId === playerId);
          if (myResult?.isCorrect) {
            playSound('scoreDing');
          } else if (myResult && !myResult.passed && !myResult.timedOut) {
            playSound('buzzer');
          }
          break;
        }
        case 'FF_SCORE_UPDATE': {
          const scores = data.scores as Record<string, number> | undefined;
          if (scores && scores[playerId] != null) {
            const newScore = scores[playerId];
            const delta = newScore - myScore;
            setMyScore(newScore);
            if (delta !== 0) setScoreChange(delta);
            // Update live score in the GameShell footer
            useRMHboxStore.setState({ liveMinigameScore: newScore });
          }
          break;
        }
        case 'FF_PAUSE': {
          setPhase('PAUSE');
          break;
        }
        case 'FF_GAME_OVER': {
          setPhase('GAME_OVER');
          // Clear live score — coordinator handles final score update
          useRMHboxStore.setState({ liveMinigameScore: null });
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
          if (typeof remaining === 'number') {
            setTimeRemaining(remaining);
            if (remaining <= 3 && remaining > 0) playSound('countdownBeep');
          }
          break;
        }
      }
    },
    [playerId, myScore, questionData?.options],
  );

  // Listen for GAME_ROUND_RESULTS for game-over
  const handleRoundResults = useCallback(
    (_data: Record<string, unknown>) => {
      setPhase('GAME_OVER');
      useRMHboxStore.setState({ liveMinigameScore: null });
    },
    [],
  );

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

  // Clear live score when the minigame unmounts (separate effect to avoid
  // clearing on every handler re-subscription).
  useEffect(() => {
    return () => {
      useRMHboxStore.setState({ liveMinigameScore: null });
    };
  }, []);

  // Hydrate from Zustand gameState snapshot on mount.
  // The server snapshot (getStateForPlayer) sends question data under `question`,
  // scores under `scores`, and timing under `phaseStartedAt` / `phaseEndsAt`.
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (p === 'QUESTION_REVEAL' || p === 'ANSWER' || p === 'ANSWER_REVEAL' || p === 'PAUSE' || p === 'GAME_OVER') {
      setPhase(p);
    }
    if (snapshot.potValue != null) {
      setPotValue(snapshot.potValue as number);
      setPotMaxValue(snapshot.potValue as number);
    }
    if (snapshot.timeRemaining != null) setTimeRemaining(snapshot.timeRemaining as number);

    // Server sends question as nested object with {id, question, options, category, difficulty, source}
    const qObj = snapshot.question as Record<string, unknown> | undefined;
    if (qObj && qObj.question) {
      setQuestionData({
        question: qObj.question as string,
        category: qObj.category as string,
        difficulty: qObj.difficulty as string,
        options: qObj.options as string[],
        questionIndex: (snapshot.currentQuestionIndex as number) ?? 0,
        totalQuestions: (snapshot.totalQuestions as number) ?? 8,
      });
    }

    // Restore scores
    if (snapshot.scores) {
      const sc = snapshot.scores as Record<string, number>;
      if (sc[playerId] != null) {
        setMyScore(sc[playerId]);
        // Sync live score to footer
        useRMHboxStore.setState({ liveMinigameScore: sc[playerId] });
      }
    }
  }, [playerId]);

  // Submit an answer
  const handleAnswer = useCallback(
    (selectedIndex: number) => {
      if (isSpectator || myAnswer != null) return;
      setMyAnswer(selectedIndex);
      emitGameInput('SUBMIT_ANSWER', { selectedIndex });
    },
    [isSpectator, myAnswer],
  );

  // Pass on the question
  const handlePass = useCallback(() => {
    if (isSpectator || myAnswer != null) return;
    setMyAnswer(-1); // -1 = passed
    emitGameInput('PASS_QUESTION', {});
    playSound('click');
  }, [isSpectator, myAnswer]);

  // Compute option states
  const getOptionState = (index: number): OptionState => {
    if (phase === 'ANSWER_REVEAL' && revealData) {
      if (index === revealData.correctIndex) return 'correct';
      if (index === myAnswer) return 'incorrect';
      return 'disabled';
    }
    if (myAnswer != null) {
      return index === myAnswer ? 'selected' : 'disabled';
    }
    if (isSpectator) return 'disabled';
    return 'default';
  };

  return (
    <AnimatePresence mode="wait">
      {/* QUESTION_REVEAL — question entrance */}
      {phase === 'QUESTION_REVEAL' && questionData && (
        <motion.div
          key="question-reveal"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.4 }}
          className="flex w-full flex-col items-center justify-center gap-4"
        >
          <QuestionCard
            question={questionData.question}
            category={questionData.category}
            difficulty={questionData.difficulty}
            questionIndex={questionData.questionIndex}
            totalQuestions={questionData.totalQuestions}
          />
        </motion.div>
      )}

      {/* ANSWER — main gameplay */}
      {phase === 'ANSWER' && questionData && (
        <motion.div
          key="answer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col gap-4"
        >
          <QuestionCard
            question={questionData.question}
            category={questionData.category}
            difficulty={questionData.difficulty}
            questionIndex={questionData.questionIndex}
            totalQuestions={questionData.totalQuestions}
          />

          {/* Pot display */}
          <div className="flex justify-center">
            <PointPotDisplay potValue={potValue} maxValue={potMaxValue} />
          </div>

          {/* Option buttons */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {questionData.options.map((opt, i) => (
              <OptionButton
                key={i}
                index={i}
                text={opt}
                state={getOptionState(i)}
                lockedPotValue={myAnswer === i ? (lockedPotValue ?? undefined) : undefined}
                onClick={() => handleAnswer(i)}
              />
            ))}
          </div>

          {/* Score ribbon */}
          <ScoreRibbon
            score={myScore}
            scoreChange={scoreChange}
            playersAnswered={playersAnswered}
            totalPlayers={totalPlayers}
            timeRemaining={timeRemaining}
            canPass={!isSpectator && myAnswer == null}
            onPass={handlePass}
          />
        </motion.div>
      )}

      {/* ANSWER_REVEAL — show correct answer and results */}
      {phase === 'ANSWER_REVEAL' && revealData && (
        <motion.div
          key="answer-reveal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <AnswerReveal
            correctIndex={revealData.correctIndex}
            correctAnswer={revealData.correctAnswer}
            options={revealData.options}
            playerResults={revealData.playerResults}
            myPlayerId={playerId}
          />
        </motion.div>
      )}

      {/* PAUSE — brief transition */}
      {phase === 'PAUSE' && (
        <motion.div
          key="pause"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center p-8"
        >
          <p className="text-sm text-(--rmhbox-text-muted)">Next question…</p>
        </motion.div>
      )}

      {/* GAME_OVER — handled by game coordinator */}
      {phase === 'GAME_OVER' && (
        <motion.div
          key="game-over"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-center p-8"
        >
          <p className="text-sm text-(--rmhbox-text-muted)">Game over — calculating results…</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
