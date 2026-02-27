/**
 * WitWarGame — Phase router for the Wit-War minigame.
 *
 * A Quiplash-style game where players write funny answers to prompts,
 * then the audience votes head-to-head on which answer is better.
 *
 * Subscribes to WW_* and TIMER_TICK events via useGameSocket().
 * Routes to the correct sub-component based on the current phase:
 *   PROMPT_REVEAL   → PromptReveal
 *   WRITING         → WritingPhase
 *   VOTING          → VotingPhase
 *   MATCHUP_RESULTS → MatchupResult
 *   ROUND_RESULTS   → WitWarResults
 *
 * Reference: docs/rmhbox/design-spec/wit-war.md
 */
'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket, extractTimerTick } from '@/lib/rmhbox/minigame-client';
import { playSound } from '@/lib/rmhbox/audio';
import type { MinigameProps } from '../MinigameRenderer';
import PromptReveal from './PromptReveal';
import WritingPhase from './WritingPhase';
import VotingPhase from './VotingPhase';
import MatchupResult from './MatchupResult';
import WitWarResults from './WitWarResults';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'PROMPT_REVEAL' | 'WRITING' | 'VOTING' | 'MATCHUP_RESULTS' | 'ROUND_RESULTS' | 'GAME_OVER';

export interface PromptAssignment {
  promptIndex: number;
  promptText: string;
  matchupIndex: number;
}

export interface MatchupData {
  promptText: string;
  answerA: string;
  answerB: string;
  playerA: string;
  playerB: string;
  playerAName?: string;
  playerBName?: string;
  votePercentA: number;
  votePercentB: number;
  winnerId: string | null;
  isQuiplash: boolean;
}

export default function WitWarGame({ playerId }: MinigameProps) {
  const [phase, setPhase] = useState<Phase>('PROMPT_REVEAL');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(2);
  const [prompts, setPrompts] = useState<PromptAssignment[]>([]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>({});

  // Voting state
  const [matchupIndex, setMatchupIndex] = useState(0);
  const [totalMatchups, setTotalMatchups] = useState(0);
  const [currentMatchup, setCurrentMatchup] = useState<MatchupData | null>(null);
  const [isAuthor, setIsAuthor] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [totalVoters, setTotalVoters] = useState(0);

  // Matchup results state
  const [matchupResult, setMatchupResult] = useState<MatchupData | null>(null);

  // Round results
  const [roundMatchups, setRoundMatchups] = useState<MatchupData[]>([]);

  const players = useRMHboxStore((s) => s.lobby?.players);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;

      switch (type) {
        case 'WW_PROMPT_REVEAL': {
          const payload = data.payload as {
            round: number;
            totalRounds: number;
            prompts: PromptAssignment[];
          };
          setPhase('PROMPT_REVEAL');
          setCurrentRound(payload.round);
          setTotalRounds(payload.totalRounds);
          setPrompts(payload.prompts);
          setHasSubmitted(false);
          setMyVote(null);
          playSound('swoosh');
          break;
        }

        case 'WW_PHASE_CHANGE': {
          const payload = data.payload as { phase: string; round: number };
          if (payload.phase === 'PROMPT_REVEAL') {
            setPhase('PROMPT_REVEAL');
            setCurrentRound(payload.round);
          }
          break;
        }

        case 'WW_WRITING_START': {
          setPhase('WRITING');
          playSound('chime');
          break;
        }

        case 'WW_WRITING_END':
          break;

        case 'WW_SUBMIT_COUNT': {
          const payload = data.payload as { submittedCount: number; totalPlayers: number };
          setSubmittedCount(payload.submittedCount);
          setTotalPlayers(payload.totalPlayers);
          break;
        }

        case 'WW_ANSWER_ACCEPTED': {
          playSound('click');
          break;
        }

        case 'WW_MATCHUP_START': {
          const payload = data.payload as {
            matchupIndex: number;
            totalMatchups: number;
            promptText: string;
            answerA: string;
            answerB: string;
            playerA: string;
            playerB: string;
            durationSeconds: number;
          };
          setPhase('VOTING');
          setMatchupIndex(payload.matchupIndex);
          setTotalMatchups(payload.totalMatchups);
          setCurrentMatchup({
            promptText: payload.promptText,
            answerA: payload.answerA,
            answerB: payload.answerB,
            playerA: payload.playerA,
            playerB: payload.playerB,
            votePercentA: 0,
            votePercentB: 0,
            winnerId: null,
            isQuiplash: false,
          });
          setIsAuthor(payload.playerA === playerId || payload.playerB === playerId);
          setMyVote(null);
          setVoteCount(0);
          setTotalVoters(Math.max((players?.length ?? 0) - 2, 1));
          playSound('swoosh');
          break;
        }

        case 'WW_VOTE_COUNT': {
          const payload = data.payload as {
            matchupIndex: number;
            voteCount: number;
            totalVoters: number;
          };
          setVoteCount(payload.voteCount);
          setTotalVoters(payload.totalVoters);
          break;
        }

        case 'WW_MATCHUP_RESULT': {
          const payload = data.payload as {
            matchupIndex: number;
            promptText: string;
            playerA: string;
            playerAName: string;
            answerA: string;
            playerB: string;
            playerBName: string;
            answerB: string;
            votePercentA: number;
            votePercentB: number;
            winnerId: string | null;
            isQuiplash: boolean;
            scores: Record<string, number>;
          };
          setPhase('MATCHUP_RESULTS');
          setMatchupResult({
            promptText: payload.promptText,
            answerA: payload.answerA,
            answerB: payload.answerB,
            playerA: payload.playerA,
            playerB: payload.playerB,
            playerAName: payload.playerAName,
            playerBName: payload.playerBName,
            votePercentA: payload.votePercentA,
            votePercentB: payload.votePercentB,
            winnerId: payload.winnerId,
            isQuiplash: payload.isQuiplash,
          });
          setScores(payload.scores);
          playSound(payload.isQuiplash ? 'victoryFanfare' : 'scoreDing');
          break;
        }

        case 'WW_ROUND_RESULTS': {
          const payload = data.payload as {
            round: number;
            totalRounds: number;
            scores: Record<string, number>;
            matchups: MatchupData[];
          };
          setPhase('ROUND_RESULTS');
          setScores(payload.scores);
          setRoundMatchups(payload.matchups);
          setCurrentRound(payload.round);
          setTotalRounds(payload.totalRounds);
          playSound('scoreDing');
          break;
        }

        case 'TIMER_TICK': {
          const remaining = extractTimerTick(data);
          if (remaining !== undefined && remaining <= 5 && remaining > 0) {
            playSound('countdownBeep');
          }
          break;
        }

        default:
          break;
      }
    },
    [playerId, players],
  );

  const handleStateSnapshot = useCallback(
    (snapshot: Record<string, unknown>) => {
      const p = snapshot.phase as string;
      if (p) {
        setPhase(p as Phase);
      }
      if (snapshot.currentRound) setCurrentRound(snapshot.currentRound as number);
      if (snapshot.totalRounds) setTotalRounds(snapshot.totalRounds as number);
      if (snapshot.scores) setScores(snapshot.scores as Record<string, number>);
      if (Array.isArray(snapshot.prompts)) setPrompts(snapshot.prompts as PromptAssignment[]);
      if (typeof snapshot.submittedCount === 'number') setSubmittedCount(snapshot.submittedCount as number);
      if (typeof snapshot.totalPlayers === 'number') setTotalPlayers(snapshot.totalPlayers as number);
      if (typeof snapshot.hasSubmitted === 'boolean') setHasSubmitted(snapshot.hasSubmitted as boolean);
      if (typeof snapshot.matchupIndex === 'number') setMatchupIndex(snapshot.matchupIndex as number);
      if (typeof snapshot.totalMatchups === 'number') setTotalMatchups(snapshot.totalMatchups as number);

      // Reconstruct matchup data from spectator/reconnection snapshots
      if (p === 'VOTING') {
        // Spectator snapshot uses `currentMatchup`; player snapshot uses flat fields
        const cm = snapshot.currentMatchup as Record<string, unknown> | undefined;
        if (cm && typeof cm === 'object') {
          setCurrentMatchup({
            promptText: (cm.promptText as string) ?? '',
            answerA: (cm.answerA as string) ?? '',
            answerB: (cm.answerB as string) ?? '',
            playerA: (cm.playerA as string) ?? '',
            playerB: (cm.playerB as string) ?? '',
            playerAName: cm.playerAName as string | undefined,
            playerBName: cm.playerBName as string | undefined,
            votePercentA: (cm.votePercentA as number) ?? 0,
            votePercentB: (cm.votePercentB as number) ?? 0,
            winnerId: (cm.winnerId as string | null) ?? null,
            isQuiplash: (cm.isQuiplash as boolean) ?? false,
          });
          setIsAuthor((cm.playerA as string) === playerId || (cm.playerB as string) === playerId);
        } else if (snapshot.promptText) {
          // Player snapshot: flat fields
          setCurrentMatchup({
            promptText: (snapshot.promptText as string) ?? '',
            answerA: (snapshot.answerA as string) ?? '',
            answerB: (snapshot.answerB as string) ?? '',
            playerA: (snapshot.playerA as string) ?? '',
            playerB: (snapshot.playerB as string) ?? '',
            votePercentA: 0,
            votePercentB: 0,
            winnerId: null,
            isQuiplash: false,
          });
        }
        if (typeof snapshot.isAuthor === 'boolean') setIsAuthor(snapshot.isAuthor as boolean);
        if (typeof snapshot.voteCount === 'number') setVoteCount(snapshot.voteCount as number);
        if (typeof snapshot.totalVoters === 'number') setTotalVoters(snapshot.totalVoters as number);
        setMyVote((snapshot.myVote as string | null) ?? null);
      } else if (p === 'MATCHUP_RESULTS') {
        // Spectator snapshot uses `currentMatchup`; player snapshot uses `matchup`
        const cm = (snapshot.currentMatchup ?? snapshot.matchup) as Record<string, unknown> | undefined;
        if (cm && typeof cm === 'object') {
          setMatchupResult({
            promptText: (cm.promptText as string) ?? '',
            answerA: (cm.answerA as string) ?? '',
            answerB: (cm.answerB as string) ?? '',
            playerA: (cm.playerA as string) ?? '',
            playerB: (cm.playerB as string) ?? '',
            playerAName: cm.playerAName as string | undefined,
            playerBName: cm.playerBName as string | undefined,
            votePercentA: (cm.votePercentA as number) ?? 0,
            votePercentB: (cm.votePercentB as number) ?? 0,
            winnerId: (cm.winnerId as string | null) ?? null,
            isQuiplash: (cm.isQuiplash as boolean) ?? false,
          });
        }
      }
    },
    [playerId],
  );

  useGameSocket({
    onGameAction: handleGameAction,
    onStateSnapshot: handleStateSnapshot,
  });

  const handleSubmitAnswer = useCallback((promptIndex: number, answer: string) => {
    emitGameInput('WW_SUBMIT_ANSWER', { promptIndex, answer });
  }, []);

  const handleSubmitAllAnswers = useCallback(() => {
    setHasSubmitted(true);
  }, []);

  const handleCastVote = useCallback((votedForUserId: string) => {
    emitGameInput('WW_CAST_VOTE', { matchupIndex, votedForUserId });
    setMyVote(votedForUserId);
    playSound('click');
  }, [matchupIndex]);

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-4">
      <AnimatePresence mode="wait">
        {phase === 'PROMPT_REVEAL' && (
          <motion.div
            key="prompt-reveal"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <PromptReveal
              prompts={prompts}
              round={currentRound}
              totalRounds={totalRounds}
            />
          </motion.div>
        )}

        {phase === 'WRITING' && (
          <motion.div
            key="writing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <WritingPhase
              prompts={prompts}
              onSubmitAnswer={handleSubmitAnswer}
              onSubmitAll={handleSubmitAllAnswers}
              hasSubmitted={hasSubmitted}
              submittedCount={submittedCount}
              totalPlayers={totalPlayers}
            />
          </motion.div>
        )}

        {phase === 'VOTING' && currentMatchup && (
          <motion.div
            key={`voting-${matchupIndex}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <VotingPhase
              matchup={currentMatchup}
              matchupIndex={matchupIndex}
              totalMatchups={totalMatchups}
              isAuthor={isAuthor}
              myVote={myVote}
              onVote={handleCastVote}
              voteCount={voteCount}
              totalVoters={totalVoters}
            />
          </motion.div>
        )}

        {phase === 'MATCHUP_RESULTS' && matchupResult && (
          <motion.div
            key={`result-${matchupIndex}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full"
          >
            <MatchupResult matchup={matchupResult} />
          </motion.div>
        )}

        {(phase === 'ROUND_RESULTS' || phase === 'GAME_OVER') && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full"
          >
            <WitWarResults
              scores={scores}
              matchups={roundMatchups}
              round={currentRound}
              totalRounds={totalRounds}
              isGameOver={phase === 'GAME_OVER'}
              players={players ?? []}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
