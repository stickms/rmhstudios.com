/**
 * IdentityCrisisGame — Phase router for the Identity Crisis minigame.
 *
 * Subscribes to IC_* WebSocket events via the game action channel and routes
 * to the correct sub-component based on the current game phase:
 *   ASSIGNMENT_REVEAL → IdentityReveal grid of others' identities
 *   ASK (my turn)     → QuestionInput + identity cards
 *   ASK (other's turn)→ Waiting view with asker identity
 *   VOTE              → VotePanel
 *   VOTE_RESULTS      → VoteResultBar + optional early guess
 *   FINAL_GUESS       → GuessInput
 *   RESULTS           → IdentityReveal dramatic reveal + rankings
 *
 * Handles server actions:
 *   IC_IDENTITIES_REVEAL, IC_TURN_START_SELF, IC_TURN_START,
 *   IC_VOTE_START, IC_VOTE_COUNT, IC_VOTE_RESULTS,
 *   IC_FINAL_GUESS_START, IC_EARLY_GUESS_RESULT, IC_RESULTS,
 *   TIMER_TICK, TIMER_START
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
import { Hourglass } from 'lucide-react';
import IdentityCard from './IdentityCard';
import HiddenIdentityCard from './HiddenIdentityCard';
import QuestionInput from './QuestionInput';
import VotePanel from './VotePanel';
import VoteResultBar from './VoteResultBar';
import QuestionHistory from './QuestionHistory';
import GuessInput from './GuessInput';
import IdentityReveal from './IdentityReveal';

// ─── Types ──────────────────────────────────────────────────────

type Phase = 'ASSIGNMENT_REVEAL' | 'ASK' | 'VOTE' | 'VOTE_RESULTS' | 'FINAL_GUESS' | 'RESULTS';

interface IdentityAssignment {
  userId: string;
  userName: string;
  identity: string;
}

interface QuestionEntry {
  question: string;
  askerName: string;
  votes: { yes: number; no: number; maybe: number };
  majorityAnswer: string;
}

interface RevealEntry {
  userId: string;
  userName: string;
  identity: string;
  guessedCorrectly: boolean;
  guess: string | null;
  questionsAsked: number;
  wasEarlyGuesser: boolean;
}

interface RankingEntry {
  userId: string;
  userName: string;
  totalScore: number;
  rank: number;
  guessedCorrectly: boolean;
  questionsUsed: number;
  votingAccuracyPct: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

// ─── Component ──────────────────────────────────────────────────

interface IdentityCrisisGameProps {
  playerId: string;
  playerName: string;
}

export default function IdentityCrisisGame({ playerId, playerName }: IdentityCrisisGameProps) {
  const [phase, setPhase] = useState<Phase>('ASSIGNMENT_REVEAL');
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [identities, setIdentities] = useState<IdentityAssignment[]>([]);
  const [questionsRemaining, setQuestionsRemaining] = useState(0);
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);

  // ASK phase state
  const [currentAskerId, setCurrentAskerId] = useState<string | null>(null);
  const [currentAskerName, setCurrentAskerName] = useState('');

  // VOTE phase state
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAskerIdentity, setCurrentAskerIdentity] = useState('');
  const [myVote, setMyVote] = useState<string | null>(null);
  const [votesReceived, setVotesReceived] = useState(0);
  const [totalVoters, setTotalVoters] = useState(0);

  // VOTE_RESULTS state
  const [lastVotes, setLastVotes] = useState({ yes: 0, no: 0, maybe: 0 });
  const [lastMajority, setLastMajority] = useState('');
  const [earlyGuessOpen, setEarlyGuessOpen] = useState(false);

  // Question history
  const [questionHistory, setQuestionHistory] = useState<QuestionEntry[]>([]);

  // RESULTS state
  const [reveals, setReveals] = useState<RevealEntry[]>([]);
  const [finalRankings, setFinalRankings] = useState<RankingEntry[]>([]);

  const isMyTurn = currentAskerId === playerId;

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;
      // Server wraps data in a `payload` field for most IC events
      const payload = (data.payload ?? data) as Record<string, unknown>;

      switch (actionType) {
        case 'IC_IDENTITIES_REVEAL': {
          setPhase('ASSIGNMENT_REVEAL');
          const assignments = payload.identities as IdentityAssignment[] | undefined;
          if (assignments) setIdentities(assignments);
          break;
        }
        case 'IC_TURN_START_SELF':
        case 'IC_TURN_START': {
          setPhase('ASK');
          setCurrentAskerId(payload.askerId as string);
          setCurrentAskerName(payload.askerName as string ?? '');
          setMyVote(null);
          setEarlyGuessOpen(false);
          break;
        }
        case 'IC_VOTE_START': {
          setPhase('VOTE');
          setCurrentQuestion(payload.question as string);
          setCurrentAskerName(payload.askerName as string ?? '');
          setCurrentAskerIdentity(payload.askerIdentity as string ?? '');
          setMyVote(null);
          setVotesReceived(0);
          setTotalVoters(payload.totalVoters as number ?? 0);
          break;
        }
        case 'IC_VOTE_COUNT': {
          setVotesReceived(payload.voteCount as number ?? 0);
          setTotalVoters(payload.totalEligible as number ?? totalVoters);
          break;
        }
        case 'IC_VOTE_RESULTS': {
          setPhase('VOTE_RESULTS');
          const tally = payload.tally as { yes: number; no: number; maybe: number } | undefined;
          if (tally) setLastVotes(tally);
          const result = payload.result as string ?? '';
          setLastMajority(result);
          setEarlyGuessOpen(false);

          // Append to question history
          setQuestionHistory((prev) => [
            ...prev,
            {
              question: payload.question as string ?? currentQuestion,
              askerName: payload.askerName as string ?? currentAskerName,
              votes: tally ?? { yes: 0, no: 0, maybe: 0 },
              majorityAnswer: result,
            },
          ]);
          break;
        }
        case 'IC_EARLY_GUESS_RESULT': {
          // Sent privately to the player who guessed
          const correct = payload.correct as boolean;
          if (correct) setHasGuessedCorrectly(true);
          setEarlyGuessOpen(false);
          break;
        }
        case 'IC_EARLY_GUESS_MADE': {
          // Broadcast to all — early guess window still open for others
          setEarlyGuessOpen(true);
          break;
        }
        case 'IC_FINAL_GUESS_START': {
          setPhase('FINAL_GUESS');
          if (payload.alreadyGuessed) setHasGuessedCorrectly(true);
          if (payload.otherIdentities) {
            setIdentities(payload.otherIdentities as IdentityAssignment[]);
          }
          break;
        }
        case 'IC_RESULTS': {
          setPhase('RESULTS');
          const resultsPayload = payload;
          const rankings = resultsPayload.rankings as RankingEntry[] | undefined;
          if (rankings) setFinalRankings(rankings);
          const guessResults = resultsPayload.guessResults as RevealEntry[] | undefined;
          if (guessResults) setReveals(guessResults);
          break;
        }
        case 'TIMER_START': {
          const pl = payload as Record<string, unknown>;
          if (pl.totalDuration) setTimeRemaining(pl.totalDuration as number);
          break;
        }
        case 'TIMER_TICK': {
          const remaining = (payload.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') setTimeRemaining(remaining);
          break;
        }
      }
    },
    [playerId, currentQuestion, currentAskerName, totalVoters],
  );

  // Also handle game-over via GAME_ROUND_RESULTS
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      const rankings = data.rankings as RankingEntry[] | undefined;
      if (rankings) {
        setPhase('RESULTS');
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

  // Hydrate from gameState snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (['ASSIGNMENT_REVEAL', 'ASK', 'VOTE', 'VOTE_RESULTS', 'FINAL_GUESS', 'RESULTS'].includes(p)) {
      setPhase(p as Phase);
    }
    if (snapshot.timeRemaining != null) setTimeRemaining(snapshot.timeRemaining as number);
    if (snapshot.identities) setIdentities(snapshot.identities as IdentityAssignment[]);
    if (snapshot.askerId) setCurrentAskerId(snapshot.askerId as string);
    if (snapshot.askerName) setCurrentAskerName(snapshot.askerName as string);
  }, []);

  // ─── Callbacks ──────────────────────────────────────────────────

  const handleAskQuestion = useCallback((question: string) => {
    emitGameInput('IC_ASK_QUESTION', { question });
  }, []);

  const handleVote = useCallback((vote: string) => {
    setMyVote(vote);
    emitGameInput('IC_VOTE', { vote });
  }, []);

  const handleGuess = useCallback((guess: string) => {
    emitGameInput('IC_FINAL_GUESS', { guess });
  }, []);

  const handleEarlyGuess = useCallback((guess: string) => {
    emitGameInput('IC_EARLY_GUESS', { guess });
    setEarlyGuessOpen(false);
  }, []);

  // ─── Identity cards grid ──────────────────────────────────────

  const renderIdentityCards = () => {
    const otherIdentities = identities.filter((id) => id.userId !== playerId);

    return (
      <div className="flex flex-wrap justify-center gap-2">
        <HiddenIdentityCard
          userName={playerName}
          questionsRemaining={questionsRemaining}
          hasGuessedCorrectly={hasGuessedCorrectly}
        />
        {otherIdentities.map((id) => (
          <IdentityCard
            key={id.userId}
            userId={id.userId}
            userName={id.userName}
            identity={id.identity}
            isHighlighted={id.userId === currentAskerId}
          />
        ))}
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <AnimatePresence mode="wait">
      {/* ASSIGNMENT_REVEAL — Show assigned identities */}
      {phase === 'ASSIGNMENT_REVEAL' && (
        <motion.div
          key="assignment"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-4 text-(--rmhbox-text)"
        >
          <h2 className="text-lg font-extrabold">Identities Assigned!</h2>
          <p className="text-xs text-(--rmhbox-text-muted)">
            Everyone can see everyone else&apos;s identity — except their own.
          </p>
          {renderIdentityCards()}
        </motion.div>
      )}

      {/* ASK — My turn: show question input */}
      {phase === 'ASK' && isMyTurn && (
        <motion.div
          key="ask-my-turn"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col items-center gap-4"
        >
          <h2 className="text-sm font-semibold text-(--rmhbox-accent)">Your turn to ask!</h2>
          {renderIdentityCards()}
          <QuestionInput
            onSubmit={handleAskQuestion}
            timeRemaining={timeRemaining}
            maxLength={150}
          />
          {questionHistory.length > 0 && <QuestionHistory questions={questionHistory} />}
        </motion.div>
      )}

      {/* ASK — Other player's turn: waiting view */}
      {phase === 'ASK' && !isMyTurn && (
        <motion.div
          key="ask-waiting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col items-center gap-4 text-(--rmhbox-text)"
        >
          <div className="flex items-center gap-2 text-sm text-(--rmhbox-text-muted)">
            <Hourglass className="h-4 w-4 animate-pulse" />
            <span>
              <span className="font-semibold text-(--rmhbox-accent)">{currentAskerName}</span> is asking a question…
            </span>
          </div>
          {renderIdentityCards()}
          {questionHistory.length > 0 && <QuestionHistory questions={questionHistory} />}
        </motion.div>
      )}

      {/* VOTE — Vote on the current question */}
      {phase === 'VOTE' && (
        <motion.div
          key="vote"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col items-center gap-4"
        >
          <VotePanel
            question={currentQuestion}
            askerName={currentAskerName}
            askerIdentity={currentAskerIdentity}
            myVote={myVote}
            onVote={handleVote}
            votesReceived={votesReceived}
            totalVoters={totalVoters}
            timeRemaining={timeRemaining}
          />
        </motion.div>
      )}

      {/* VOTE_RESULTS — Show vote outcome + optional early guess */}
      {phase === 'VOTE_RESULTS' && (
        <motion.div
          key="vote-results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col items-center gap-4 text-(--rmhbox-text)"
        >
          <p className="text-sm text-(--rmhbox-text-muted)">
            <span className="font-semibold text-(--rmhbox-accent)">{currentAskerName}</span> asked:
            &ldquo;{currentQuestion}&rdquo;
          </p>
          <VoteResultBar votes={lastVotes} majorityAnswer={lastMajority} />

          {earlyGuessOpen && !hasGuessedCorrectly && (
            <div className="mt-2 w-full max-w-md">
              <GuessInput onSubmit={handleEarlyGuess} isEarlyGuess />
            </div>
          )}
        </motion.div>
      )}

      {/* FINAL_GUESS — Everyone guesses their identity */}
      {phase === 'FINAL_GUESS' && (
        <motion.div
          key="final-guess"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col items-center gap-4"
        >
          <h2 className="text-lg font-extrabold text-(--rmhbox-text)">Final Guess!</h2>
          {renderIdentityCards()}
          {!hasGuessedCorrectly ? (
            <GuessInput onSubmit={handleGuess} timeRemaining={timeRemaining} />
          ) : (
            <p className="text-sm font-semibold text-(--rmhbox-success)">
              You already guessed correctly! ✓
            </p>
          )}
        </motion.div>
      )}

      {/* RESULTS — Final reveal + rankings */}
      {phase === 'RESULTS' && (
        <motion.div
          key="results"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="flex w-full justify-center"
        >
          <IdentityReveal reveals={reveals} finalRankings={finalRankings} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
