/**
 * WitWarLashGame — Phase router for the Wit War Lash minigame.
 *
 * A Quiplash-style game where players write funny answers to prompts,
 * then the audience votes head-to-head on which answer is better.
 *
 * Subscribes to game action events and routes to the correct
 * sub-component based on the current phase:
 *   PROMPT_REVEAL   → PromptReveal
 *   WRITING         → WritingPhase
 *   VOTING          → VotingPhase
 *   MATCHUP_RESULTS → MatchupResult
 *   ROUND_RESULTS   → WitWarLashResults
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { emit } from '@/lib/rmhbox/socket';
import PromptReveal from './PromptReveal';
import WritingPhase from './WritingPhase';
import VotingPhase from './VotingPhase';
import MatchupResult from './MatchupResult';
import WitWarLashResults from './WitWarLashResults';

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

function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface WitWarLashGameProps {
  playerId: string;
  playerName: string;
}

export default function WitWarLashGame({ playerId, playerName: _playerName }: WitWarLashGameProps) {
  void _playerName;

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
  const [votingDuration, setVotingDuration] = useState(15);

  // Matchup results state
  const [matchupResult, setMatchupResult] = useState<MatchupData | null>(null);

  // Round results
  const [roundMatchups, setRoundMatchups] = useState<MatchupData[]>([]);

  const players = useRMHboxStore((s) => s.lobby?.players);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;

      switch (type) {
        case 'WWL_PROMPT_REVEAL': {
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
          break;
        }

        case 'WWL_PHASE_CHANGE': {
          const payload = data.payload as { phase: string; round: number };
          if (payload.phase === 'PROMPT_REVEAL') {
            setPhase('PROMPT_REVEAL');
            setCurrentRound(payload.round);
          }
          break;
        }

        case 'WWL_WRITING_START': {
          const payload = data.payload as { durationSeconds: number };
          setPhase('WRITING');
          void payload;
          break;
        }

        case 'WWL_WRITING_END':
          break;

        case 'WWL_SUBMIT_COUNT': {
          const payload = data.payload as { submittedCount: number; totalPlayers: number };
          setSubmittedCount(payload.submittedCount);
          setTotalPlayers(payload.totalPlayers);
          break;
        }

        case 'WWL_ANSWER_ACCEPTED': {
          const payload = data.payload as { promptIndex: number };
          void payload;
          break;
        }

        case 'WWL_MATCHUP_START': {
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
          setVotingDuration(payload.durationSeconds);
          break;
        }

        case 'WWL_VOTE_COUNT': {
          const payload = data.payload as {
            matchupIndex: number;
            voteCount: number;
            totalVoters: number;
          };
          setVoteCount(payload.voteCount);
          setTotalVoters(payload.totalVoters);
          break;
        }

        case 'WWL_MATCHUP_RESULT': {
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
          break;
        }

        case 'WWL_ROUND_RESULTS': {
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
          break;
        }

        default:
          break;
      }
    },
    [playerId, players],
  );

  useEffect(() => {
    const store = useRMHboxStore.getState();
    const gameState = store.gameState;

    if (gameState.lastAction) {
      handleGameAction(gameState.lastAction as Record<string, unknown>);
    }
  }, [handleGameAction]);

  useEffect(() => {
    const unsub = useRMHboxStore.subscribe((state, prevState) => {
      if (state.gameState.lastAction !== prevState.gameState.lastAction && state.gameState.lastAction) {
        handleGameAction(state.gameState.lastAction as Record<string, unknown>);
      }
    });
    return unsub;
  }, [handleGameAction]);

  const handleSubmitAnswer = useCallback((promptIndex: number, answer: string) => {
    emitGameInput('WWL_SUBMIT_ANSWER', { promptIndex, answer });
  }, []);

  const handleSubmitAllAnswers = useCallback(() => {
    setHasSubmitted(true);
  }, []);

  const handleCastVote = useCallback((votedForUserId: string) => {
    emitGameInput('WWL_CAST_VOTE', { matchupIndex, votedForUserId });
    setMyVote(votedForUserId);
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
            <WitWarLashResults
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
