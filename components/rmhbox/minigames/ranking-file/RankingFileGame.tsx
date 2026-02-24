/**
 * RankingFileGame — Phase router for the Ranking File minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   CATEGORY_REVEAL → CategoryReveal (animated category + items display)
 *   RANKING         → RankingList + submit button (drag-and-drop ordering)
 *   LOCK_IN         → RankingList with "Last chance!" urgency
 *   RESULTS_REVEAL  → ResultsComparison (player vs group average)
 *   TRANSITION      → Brief transition screen between rounds
 *   GAME_OVER       → RankingFileResults (final standings + recap)
 *
 * Handles server actions:
 *   RF_CATEGORY_REVEAL, RF_SUBMISSION_COUNT, RF_LOCK_IN_PHASE,
 *   RF_ROUND_RESULTS, RF_SCORE_UPDATE, RF_GAME_OVER, TIMER_TICK
 *
 * Props:
 *   playerId   — Current player's user ID
 *   playerName — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import CategoryReveal from './CategoryReveal';
import RankingList from './RankingList';
import ResultsComparison from './ResultsComparison';
import RankingFileResults from './RankingFileResults';

type Phase =
  | 'CATEGORY_REVEAL'
  | 'RANKING'
  | 'LOCK_IN'
  | 'RESULTS_REVEAL'
  | 'TRANSITION'
  | 'GAME_OVER';

/** Helper: emit a game input action with the correct shape */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface Category {
  name: string;
  items: string[];
  emoji: string;
}

interface PlayerResult {
  userId: string;
  userName: string;
  ranking: number[];
  distance: number;
  roundScore: number;
  isExactMatch: boolean;
  isOutlier: boolean;
}

interface FinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  averageDistance: number;
  exactMatches: number;
  outlierRounds: number;
}

interface CategoryResult {
  roundNumber: number;
  category: Category;
}

interface RankingFileGameProps {
  playerId: string;
  playerName: string;
}

export default function RankingFileGame({ playerId, playerName: _playerName }: RankingFileGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('CATEGORY_REVEAL');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(0);
  const [category, setCategory] = useState<Category>({ name: '', items: [], emoji: '' });
  const [ranking, setRanking] = useState<number[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  // Results state
  const [myRanking, setMyRanking] = useState<number[]>([]);
  const [averageRanking, setAverageRanking] = useState<number[]>([]);
  const [consensusOrder, setConsensusOrder] = useState<Array<{ item: string; avgRank: number }>>([]);
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [mostConsensus, setMostConsensus] = useState({ userId: '', userName: '' });
  const [mostUnique, setMostUnique] = useState({ userId: '', userName: '' });

  // Game-over state
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);
  const [categoryResults, setCategoryResults] = useState<CategoryResult[]>([]);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'RF_CATEGORY_REVEAL': {
          setPhase('CATEGORY_REVEAL');
          setCurrentRound(data.round as number);
          setTotalRounds(data.totalRounds as number);
          const cat = data.category as Category;
          setCategory(cat);
          // Initialize ranking as default order [0, 1, 2, ...]
          setRanking(cat.items.map((_, i) => i));
          setHasSubmitted(false);
          setSubmittedCount(0);
          setTimeRemaining((data.rankingDurationSeconds as number) ?? 60);

          // Auto-transition to ranking phase after a short reveal
          setTimeout(() => setPhase('RANKING'), 4000);
          break;
        }
        case 'RF_SUBMISSION_COUNT': {
          setSubmittedCount(data.submitted as number);
          setTotalPlayers(data.total as number);
          break;
        }
        case 'RF_LOCK_IN_PHASE': {
          setPhase('LOCK_IN');
          setTimeRemaining(data.lockInSeconds as number);
          break;
        }
        case 'RF_ROUND_RESULTS': {
          setPhase('RESULTS_REVEAL');
          setAverageRanking(data.averageRanking as number[]);
          setConsensusOrder(data.consensusOrder as Array<{ item: string; avgRank: number }>);
          setPlayerResults(data.playerResults as PlayerResult[]);
          setMostConsensus(data.mostConsensus as { userId: string; userName: string });
          setMostUnique(data.mostUnique as { userId: string; userName: string });
          // Preserve the player's own ranking for comparison
          const myResult = (data.playerResults as PlayerResult[])
            ?.find((p) => p.userId === playerId);
          if (myResult) setMyRanking(myResult.ranking);
          break;
        }
        case 'RF_SCORE_UPDATE': {
          // Scores are tracked but displayed in results; transition to next round
          setPhase('TRANSITION');
          setTimeout(() => {
            // Phase will be updated by next RF_CATEGORY_REVEAL
          }, 2000);
          break;
        }
        case 'RF_GAME_OVER': {
          setPhase('GAME_OVER');
          setFinalRankings(data.finalRankings as FinalRanking[]);
          setCategoryResults(data.categoryResults as CategoryResult[]);
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

  // Also listen for GAME_ROUND_RESULTS for game-over from coordinator
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      const rankings = data.rankings as FinalRanking[] | undefined;
      if (rankings) {
        setPhase('GAME_OVER');
        setFinalRankings(rankings);
      }
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

  // Hydrate from Zustand snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (['CATEGORY_REVEAL', 'RANKING', 'LOCK_IN', 'RESULTS_REVEAL', 'TRANSITION', 'GAME_OVER'].includes(p)) {
      setPhase(p as Phase);
    }
    if (snapshot.currentRound) setCurrentRound(snapshot.currentRound as number);
    if (snapshot.totalRounds) setTotalRounds(snapshot.totalRounds as number);
    if (snapshot.category) setCategory(snapshot.category as Category);
    if (snapshot.timeRemaining != null) setTimeRemaining(snapshot.timeRemaining as number);
    if (Array.isArray(snapshot.ranking)) setRanking(snapshot.ranking as number[]);
  }, []);

  // Submit ranking to server
  const handleSubmit = useCallback(() => {
    if (hasSubmitted) return;
    setHasSubmitted(true);
    setMyRanking([...ranking]);
    emitGameInput('RF_SUBMIT_RANKING', { ranking });
  }, [hasSubmitted, ranking]);

  return (
    <AnimatePresence mode="wait">
      {/* CATEGORY_REVEAL */}
      {phase === 'CATEGORY_REVEAL' && (
        <motion.div
          key="category-reveal"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex w-full items-center justify-center"
        >
          <CategoryReveal
            category={category}
            round={currentRound}
            totalRounds={totalRounds}
          />
        </motion.div>
      )}

      {/* RANKING / LOCK_IN */}
      {(phase === 'RANKING' || phase === 'LOCK_IN') && (
        <motion.div
          key="ranking"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-4 w-full text-(--rmhbox-text)"
        >
          {/* Header */}
          <div className="text-center">
            <p className="text-sm text-(--rmhbox-text-muted)">
              {category.emoji} {category.name}
            </p>
            <p className="text-lg font-bold tabular-nums">
              ⏱️ {timeRemaining}s
            </p>
          </div>

          {/* Ranking list */}
          <RankingList
            items={category.items}
            ranking={ranking}
            onRankingChange={setRanking}
            hasSubmitted={hasSubmitted}
            isLockIn={phase === 'LOCK_IN'}
          />

          {/* Submit button */}
          {!hasSubmitted ? (
            <button
              onClick={handleSubmit}
              className={`
                w-full max-w-md rounded-lg px-6 py-3 text-base font-bold
                transition-all duration-200
                ${phase === 'LOCK_IN'
                  ? 'bg-(--rmhbox-danger) text-white animate-pulse'
                  : 'bg-(--rmhbox-accent) text-white hover:opacity-90'}
              `}
            >
              {phase === 'LOCK_IN' ? '⚡ Lock In Now!' : '🔒 Submit Ranking'}
            </button>
          ) : (
            <p className="text-sm text-(--rmhbox-text-muted)">
              Waiting for others… ({submittedCount}/{totalPlayers})
            </p>
          )}
        </motion.div>
      )}

      {/* RESULTS_REVEAL */}
      {phase === 'RESULTS_REVEAL' && (
        <motion.div
          key="results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ResultsComparison
            myRanking={myRanking}
            averageRanking={averageRanking}
            items={category.items}
            playerResults={playerResults}
            mostConsensus={mostConsensus}
            mostUnique={mostUnique}
          />
        </motion.div>
      )}

      {/* TRANSITION */}
      {phase === 'TRANSITION' && (
        <motion.div
          key="transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center gap-3 text-(--rmhbox-text)"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="text-4xl"
          >
            📊
          </motion.div>
          <p className="text-lg font-medium text-(--rmhbox-text-muted)">
            Next round coming up…
          </p>
        </motion.div>
      )}

      {/* GAME_OVER */}
      {phase === 'GAME_OVER' && (
        <motion.div
          key="game-over"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <RankingFileResults
            finalRankings={finalRankings}
            categoryResults={categoryResults}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
