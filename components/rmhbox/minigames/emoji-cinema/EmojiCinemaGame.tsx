/**
 * Emoji Cinema — Main Game Component
 *
 * Phase router that renders the appropriate sub-component based on
 * the current game phase and the player's role (Producer vs Audience).
 *
 * Subscribes to EC_* and TIMER_TICK events via socket GAME_ACTION.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import type { MinigameProps } from '../MinigameRenderer';
import ProducerView from './ProducerView';
import AudienceView from './AudienceView';
import RoundResults from './RoundResults';
import type { GuessEntry } from './GuessHistory';

type ECPhase = 'PRODUCER_ASSIGNMENT' | 'EMOJI_CONSTRUCTION' | 'ROUND_RESULTS' | 'TRANSITION';

const MAX_EMOJIS = 12;
const MAX_GUESSES = 5;

interface PlayerResult {
  userId: string;
  userName: string;
  guessedCorrectly: boolean;
  points: number;
  guessNumber?: number;
}

/** Helper: emit a game input action */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

export default function EmojiCinemaGame({ playerId }: MinigameProps) {
  const [phase, setPhase] = useState<ECPhase>('PRODUCER_ASSIGNMENT');
  const [producerId, setProducerId] = useState('');
  const [producerName, setProducerName] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [emojis, setEmojis] = useState<string[]>([]);
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);
  const [guessCount, setGuessCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const [notification, setNotification] = useState('');

  // Round results state
  const [resultsMovieTitle, setResultsMovieTitle] = useState('');
  const [resultsEmojis, setResultsEmojis] = useState<string[]>([]);
  const [resultsProducerName, setResultsProducerName] = useState('');
  const [resultsProducerPoints, setResultsProducerPoints] = useState(0);
  const [resultsPlayers, setResultsPlayers] = useState<PlayerResult[]>([]);

  const isProducer = playerId === producerId;

  // Clear notifications after a delay
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(''), 3000);
    return () => clearTimeout(t);
  }, [notification]);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'EC_PRODUCER_ASSIGNED': {
          const pid = data.producerId as string;
          setProducerId(pid);
          setProducerName(data.producerName as string);
          setRoundNumber(data.round as number ?? roundNumber);
          setMovieTitle('');
          setEmojis([]);
          setGuesses([]);
          setHasGuessedCorrectly(false);
          setGuessCount(0);
          setCorrectCount(0);
          setPhase('PRODUCER_ASSIGNMENT');
          break;
        }
        case 'EC_MOVIE_ASSIGNED': {
          setMovieTitle(data.movieTitle as string);
          setPhase('EMOJI_CONSTRUCTION');
          break;
        }
        case 'EC_EMOJI_UPDATED': {
          setEmojis(data.emojis as string[]);
          if (phase !== 'EMOJI_CONSTRUCTION') setPhase('EMOJI_CONSTRUCTION');
          break;
        }
        case 'EC_GUESS_RESULT': {
          const result = data.result as 'correct' | 'close' | 'wrong';
          setGuesses((prev) => [...prev, { guess: data.guess as string, result }]);
          if (result === 'correct') setHasGuessedCorrectly(true);
          break;
        }
        case 'EC_CLOSE_GUESS': {
          setNotification(`🔥 ${data.userName as string} is close!`);
          break;
        }
        case 'EC_CORRECT_GUESS': {
          setNotification(`✅ ${data.userName as string} guessed correctly!`);
          break;
        }
        case 'EC_GUESS_COUNT': {
          setGuessCount(data.totalGuesses as number);
          setCorrectCount(data.correctGuesses as number);
          break;
        }
        case 'EC_ROUND_OVER': {
          setResultsMovieTitle(data.movieTitle as string);
          setResultsEmojis(data.emojis as string[]);
          setResultsProducerName(data.producerName as string);
          setResultsProducerPoints(data.producerPoints as number ?? 0);
          setResultsPlayers(data.results as PlayerResult[] ?? []);
          setPhase('ROUND_RESULTS');
          break;
        }
        case 'EC_TRANSITION': {
          setPhase('TRANSITION');
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
    [phase, roundNumber],
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
    if (p === 'PRODUCER_ASSIGNMENT' || p === 'EMOJI_CONSTRUCTION' || p === 'ROUND_RESULTS' || p === 'TRANSITION') {
      setPhase(p as ECPhase);
    }
    if (snapshot.producerId) setProducerId(snapshot.producerId as string);
    if (snapshot.producerName) setProducerName(snapshot.producerName as string);
    if (snapshot.movieTitle) setMovieTitle(snapshot.movieTitle as string);
    if (Array.isArray(snapshot.emojis)) setEmojis(snapshot.emojis as string[]);
    if (snapshot.roundNumber) setRoundNumber(snapshot.roundNumber as number);
  }, []);

  // Producer actions
  const handleAddEmoji = useCallback(
    (emoji: string) => {
      setEmojis((prev) => {
        if (prev.length >= MAX_EMOJIS) return prev;
        const next = [...prev, emoji];
        emitGameInput('EC_UPDATE_EMOJIS', { emojis: next });
        return next;
      });
    },
    [],
  );

  const handleRemoveEmoji = useCallback(
    (index: number) => {
      setEmojis((prev) => {
        const next = prev.filter((_, i) => i !== index);
        emitGameInput('EC_UPDATE_EMOJIS', { emojis: next });
        return next;
      });
    },
    [],
  );

  // Audience actions
  const handleSubmitGuess = useCallback(
    (guess: string) => {
      emitGameInput('EC_SUBMIT_GUESS', { guess });
    },
    [],
  );

  // Render based on phase
  switch (phase) {
    case 'PRODUCER_ASSIGNMENT':
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in">
          <span className="text-5xl">🎬</span>
          <h2 className="text-2xl font-bold text-(--rmhbox-text)">
            {isProducer ? "You're the Producer!" : `${producerName || 'Someone'} is the Producer`}
          </h2>
          <p className="text-sm text-(--rmhbox-text-muted)">
            {isProducer
              ? 'You will get a movie to describe with emojis'
              : 'Get ready to guess the movie from emojis'}
          </p>
        </div>
      );

    case 'EMOJI_CONSTRUCTION':
      return (
        <div className="relative">
          {notification && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) text-sm text-(--rmhbox-text) shadow-lg animate-in fade-in slide-in-from-top">
              {notification}
            </div>
          )}
          {isProducer ? (
            <ProducerView
              movieTitle={movieTitle}
              emojis={emojis}
              maxEmojis={MAX_EMOJIS}
              onAddEmoji={handleAddEmoji}
              onRemoveEmoji={handleRemoveEmoji}
              guessCount={guessCount}
              correctCount={correctCount}
              timeRemaining={timeRemaining}
            />
          ) : (
            <AudienceView
              emojis={emojis}
              maxEmojis={MAX_EMOJIS}
              producerName={producerName}
              roundNumber={roundNumber}
              guesses={guesses}
              maxGuesses={MAX_GUESSES}
              hasGuessedCorrectly={hasGuessedCorrectly}
              onSubmitGuess={handleSubmitGuess}
              timeRemaining={timeRemaining}
            />
          )}
        </div>
      );

    case 'ROUND_RESULTS':
      return (
        <RoundResults
          movieTitle={resultsMovieTitle}
          emojis={resultsEmojis}
          producerName={resultsProducerName}
          producerPoints={resultsProducerPoints}
          results={resultsPlayers}
          roundNumber={roundNumber}
        />
      );

    case 'TRANSITION':
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center animate-in fade-in">
          <span className="text-4xl animate-bounce">🎬</span>
          <p className="text-sm text-(--rmhbox-text-muted)">Next round starting…</p>
        </div>
      );

    default:
      return null;
  }
}
