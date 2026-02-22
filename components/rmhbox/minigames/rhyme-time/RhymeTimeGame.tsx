/**
 * RhymeTimeGame — Phase router for the Rhyme Time minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   ROUND_START  → Animated root-word reveal
 *   INPUT        → RhymeTimeInput (text entry)
 *   SCORING      → RhymeTimeResults (word breakdown)
 *   INTERMISSION → RhymeTimeScoreboard (standings between rounds)
 *   GAME_OVER    → RhymeTimeScoreboard (final scores + awards)
 *
 * Handles server actions:
 *   RT_ROUND_START, RT_RHYME_SUBMITTED, RT_SUBMISSION_COUNT,
 *   RT_ROUND_RESULTS, RT_INTERMISSION, RT_GAME_OVER, TIMER_TICK
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { S2C, C2S } from '@/lib/rmhbox/events';
import RhymeTimeInput from './RhymeTimeInput';
import RhymeTimeResults from './RhymeTimeResults';
import RhymeTimeScoreboard from './RhymeTimeScoreboard';
import type { Submission, PlayerSubmissionCount } from './RhymeTimeInput';
import type { WordResult, PlayerBreakdown } from './RhymeTimeResults';
import type { Standing, AwardEntry } from './RhymeTimeScoreboard';

type Phase = 'ROUND_START' | 'INPUT' | 'SCORING' | 'INTERMISSION' | 'GAME_OVER';

interface RhymeTimeGameProps {
  playerId: string;
  playerName: string;
}

export default function RhymeTimeGame({ playerId, playerName }: RhymeTimeGameProps) {
  const [phase, setPhase] = useState<Phase>('ROUND_START');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [rootWord, setRootWord] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [totalDuration, setTotalDuration] = useState(60);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [submissionCounts, setSubmissionCounts] = useState<PlayerSubmissionCount[]>([]);
  const [wordResults, setWordResults] = useState<WordResult[]>([]);
  const [playerBreakdowns, setPlayerBreakdowns] = useState<PlayerBreakdown[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);

  // Handle incoming game actions
  const handleGameAction = useCallback(
    (data: { action: string; payload: Record<string, unknown> }) => {
      const { action, payload } = data;

      switch (action) {
        case 'RT_ROUND_START': {
          setPhase('ROUND_START');
          setRootWord(payload.rootWord as string);
          setCurrentRound(payload.round as number);
          setTotalRounds(payload.totalRounds as number);
          setTimeRemaining(payload.duration as number);
          setTotalDuration(payload.duration as number);
          setMySubmissions([]);
          setSubmissionCounts([]);
          // Transition to INPUT after reveal animation
          setTimeout(() => setPhase('INPUT'), 3000);
          break;
        }
        case 'RT_RHYME_SUBMITTED': {
          const sub = payload as unknown as {
            word: string;
            status: Submission['status'];
            invalidReason?: string;
          };
          setMySubmissions((prev) => [...prev, sub]);
          break;
        }
        case 'RT_SUBMISSION_COUNT': {
          setSubmissionCounts(payload.counts as PlayerSubmissionCount[]);
          break;
        }
        case 'RT_ROUND_RESULTS': {
          setPhase('SCORING');
          setWordResults(payload.words as WordResult[]);
          setPlayerBreakdowns(payload.breakdowns as PlayerBreakdown[]);
          break;
        }
        case 'RT_INTERMISSION': {
          setPhase('INTERMISSION');
          setStandings(payload.standings as Standing[]);
          break;
        }
        case 'RT_GAME_OVER': {
          setPhase('GAME_OVER');
          setStandings(payload.standings as Standing[]);
          setAwards((payload.awards as AwardEntry[]) || []);
          break;
        }
        case 'TIMER_TICK': {
          setTimeRemaining(payload.remaining as number);
          break;
        }
      }
    },
    [],
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

  // Submit a word
  const handleSubmitWord = useCallback(
    (word: string) => {
      emit(C2S.GAME_INPUT, { type: 'RT_SUBMIT_RHYME', word });
    },
    [],
  );

  return (
    <AnimatePresence mode="wait">
      {/* ROUND_START — animated root-word reveal */}
      {phase === 'ROUND_START' && (
        <motion.div
          key="round-start"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 text-[var(--rmhbox-text)]"
        >
          <p className="text-sm uppercase tracking-wider text-[var(--rmhbox-text-muted)]">
            Round {currentRound} of {totalRounds}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
            className="text-6xl font-extrabold text-[var(--rmhbox-accent)]"
          >
            {rootWord}
          </motion.h1>
          <p className="text-sm text-[var(--rmhbox-text-muted)]">Get ready to rhyme!</p>
        </motion.div>
      )}

      {/* INPUT — word submission phase */}
      {phase === 'INPUT' && (
        <motion.div
          key="input"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full"
        >
          <RhymeTimeInput
            rootWord={rootWord}
            timeRemaining={timeRemaining}
            totalDuration={totalDuration}
            mySubmissions={mySubmissions}
            submissionCounts={submissionCounts}
            onSubmit={handleSubmitWord}
          />
        </motion.div>
      )}

      {/* SCORING — round results */}
      {phase === 'SCORING' && (
        <motion.div
          key="scoring"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <RhymeTimeResults
            rootWord={rootWord}
            currentUserId={playerId}
            wordResults={wordResults}
            playerBreakdowns={playerBreakdowns}
            roundNumber={currentRound}
          />
        </motion.div>
      )}

      {/* INTERMISSION / GAME_OVER — scoreboard */}
      {(phase === 'INTERMISSION' || phase === 'GAME_OVER') && (
        <motion.div
          key="scoreboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <RhymeTimeScoreboard
            standings={standings}
            currentUserId={playerId}
            currentRound={currentRound}
            totalRounds={totalRounds}
            isGameOver={phase === 'GAME_OVER'}
            awards={awards}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
