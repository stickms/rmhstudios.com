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

type ECPhase = 'PRODUCER_ASSIGNMENT' | 'MOVIE_SELECTION' | 'EMOJI_CONSTRUCTION' | 'ROUND_RESULTS' | 'TRANSITION';

const MAX_EMOJIS = 12;
const MAX_GUESSES = 5;

interface PlayerResult {
  userId: string;
  userName: string;
  guessedCorrectly: boolean;
  points: number;
  guessNumber?: number;
}

/** A player who has guessed correctly this round */
export interface CorrectGuesserInfo {
  userId: string;
  userName: string;
  rank: number;
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
  const [movieChoices, setMovieChoices] = useState<Array<{ title: string; year: number; genre: string[]; difficulty: string }>>([]);
  const [emojis, setEmojis] = useState<string[]>([]);
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [hasGuessedCorrectly, setHasGuessedCorrectly] = useState(false);
  const [guessCount, setGuessCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const [notification, setNotification] = useState('');
  const [correctGuessers, setCorrectGuessers] = useState<CorrectGuesserInfo[]>([]);
  // Movie titles for fuzzy autocomplete
  const [movieTitles, setMovieTitles] = useState<string[]>([]);
  // Round results state
  const [resultsMovieTitle, setResultsMovieTitle] = useState('');
  const [resultsEmojis, setResultsEmojis] = useState<string[]>([]);
  const [resultsProducerName, setResultsProducerName] = useState('');
  const [resultsProducerPoints, setResultsProducerPoints] = useState(0);
  const [resultsPlayers, setResultsPlayers] = useState<PlayerResult[]>([]);
  const [noEmojisSkipped, setNoEmojisSkipped] = useState(false);

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
          const pid = (data.producerUserId ?? data.producerId) as string;
          setProducerId(pid);
          setProducerName((data.producerUserName ?? data.producerName) as string);
          setRoundNumber(data.round as number ?? roundNumber);
          setMovieTitle('');
          setMovieChoices([]);
          setEmojis([]);
          setGuesses([]);
          setHasGuessedCorrectly(false);
          setGuessCount(0);
          setCorrectCount(0);
          setCorrectGuessers([]);
          setPhase('PRODUCER_ASSIGNMENT');
          break;
        }
        case 'EC_MOVIE_CHOICES': {
          // Producer receives 3 movie choices
          const movies = data.movies as Array<{ title: string; year: number; genre: string[]; difficulty: string }>;
          setMovieChoices(movies ?? []);
          setPhase('MOVIE_SELECTION');
          break;
        }
        case 'EC_MOVIE_SELECTION_START': {
          // Audience notification that producer is picking
          if (!isProducer) setPhase('MOVIE_SELECTION');
          break;
        }
        case 'EC_MOVIE_ASSIGNED': {
          // Server sends data.movie.title or data.movieTitle
          const movie = data.movie as { title?: string } | undefined;
          setMovieTitle((movie?.title ?? data.movieTitle) as string);
          setMovieChoices([]);
          setPhase('EMOJI_CONSTRUCTION');
          break;
        }
        case 'EC_CONSTRUCTION_START':
          // Marks the start of the emoji construction phase — transition audience too
          if (Array.isArray(data.movieTitles)) setMovieTitles(data.movieTitles as string[]);
          if (phase !== 'EMOJI_CONSTRUCTION') setPhase('EMOJI_CONSTRUCTION');
          break;
        case 'EC_EMOJI_UPDATED': {
          const seq = (data.emojiSequence ?? data.emojis) as string[] | undefined;
          setEmojis(seq ?? []);
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
          // Server now sends the full list of correct guessers
          if (Array.isArray(data.correctGuessers)) {
            setCorrectGuessers(data.correctGuessers as CorrectGuesserInfo[]);
          }
          setCorrectCount((data.correctGuessers as CorrectGuesserInfo[] | undefined)?.length ?? 0);
          break;
        }
        case 'EC_GUESS_COUNT': {
          setGuessCount(data.totalGuesses as number);
          setCorrectCount(data.correctGuesses as number);
          break;
        }
        case 'EC_ROUND_OVER': {
          // Server sends movie.title, emojiSequence, correctGuessers, roundScores
          const movie = data.movie as { title?: string } | undefined;
          setResultsMovieTitle((movie?.title ?? data.movieTitle) as string);
          const emojiSeq = (data.emojiSequence ?? data.emojis) as string[] | undefined;
          setResultsEmojis(emojiSeq ?? []);

          // Reconstruct producer info and results from the server data
          const correctGuessers = (data.correctGuessers ?? []) as Array<{ userId: string; userName: string; rank: number }>;
          const roundScores = (data.roundScores ?? {}) as Record<string, number>;
          
          // Extract producer points first
          setResultsProducerPoints(roundScores[producerId] ?? 0);
          setResultsProducerName(producerName);

          // Build audience player results from roundScores (exclude producer)
          const playerResults: PlayerResult[] = [];
          for (const [uid, pts] of Object.entries(roundScores)) {
            if (uid === producerId) continue;
            const cg = correctGuessers.find((g) => g.userId === uid);
            playerResults.push({
              userId: uid,
              userName: cg?.userName ?? uid,
              guessedCorrectly: !!cg,
              points: pts,
              guessNumber: cg?.rank,
            });
          }
          setResultsPlayers(data.results as PlayerResult[] ?? playerResults);
          setNoEmojisSkipped(!!data.noEmojis);
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
    [phase, roundNumber, producerId, producerName, isProducer],
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
    if (p === 'PRODUCER_ASSIGNMENT' || p === 'MOVIE_SELECTION' || p === 'EMOJI_CONSTRUCTION' || p === 'ROUND_RESULTS' || p === 'TRANSITION') {
      setPhase(p as ECPhase);
    }
    if (snapshot.producerUserId) setProducerId(snapshot.producerUserId as string);
    else if (snapshot.producerId) setProducerId(snapshot.producerId as string);
    if (snapshot.producerUserName) setProducerName(snapshot.producerUserName as string);
    else if (snapshot.producerName) setProducerName(snapshot.producerName as string);
    if (snapshot.movieTitle) setMovieTitle(snapshot.movieTitle as string);
    else if (snapshot.movie && typeof snapshot.movie === 'object') {
      const m = snapshot.movie as { title?: string };
      if (m.title) setMovieTitle(m.title);
    }
    if (Array.isArray(snapshot.movieTitles)) setMovieTitles(snapshot.movieTitles as string[]);
    const seq = (snapshot.emojiSequence ?? snapshot.emojis) as string[] | undefined;
    if (Array.isArray(seq)) setEmojis(seq);
    if (snapshot.currentRound) setRoundNumber(snapshot.currentRound as number);
    else if (snapshot.roundNumber) setRoundNumber(snapshot.roundNumber as number);
  }, []);

  // Producer actions — emit is outside the state updater to avoid
  // double-firing in React StrictMode
  const handleAddEmoji = useCallback(
    (emoji: string) => {
      const position = emojis.length;
      setEmojis((prev) => {
        if (prev.length >= MAX_EMOJIS) return prev;
        return [...prev, emoji];
      });
      if (emojis.length < MAX_EMOJIS) {
        emitGameInput('ADD_EMOJI', { emoji, position });
      }
    },
    [emojis.length],
  );

  const handleRemoveEmoji = useCallback(
    (index: number) => {
      setEmojis((prev) => prev.filter((_, i) => i !== index));
      emitGameInput('REMOVE_EMOJI', { position: index });
    },
    [],
  );

  // Audience actions
  const handleSubmitGuess = useCallback(
    (guess: string) => {
      emitGameInput('SUBMIT_GUESS', { guess });
    },
    [],
  );

  // Movie selection action (producer picks from 3 choices)
  const handleSelectMovie = useCallback(
    (title: string) => {
      emitGameInput('SELECT_MOVIE', { movieTitle: title });
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
              ? 'You will pick a movie to describe with emojis'
              : 'Get ready to guess the movie from emojis'}
          </p>
        </div>
      );

    case 'MOVIE_SELECTION':
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in">
          {isProducer ? (
            <>
              <span className="text-4xl">🎥</span>
              <h2 className="text-xl font-bold text-(--rmhbox-text)">Choose Your Movie</h2>
              <p className="text-sm text-(--rmhbox-text-muted) mb-2">
                Pick the movie you want to describe with emojis
              </p>
              <div className="flex flex-col gap-3 w-full max-w-sm">
                {movieChoices.map((movie) => (
                  <button
                    key={movie.title}
                    onClick={() => handleSelectMovie(movie.title)}
                    className="p-4 rounded-xl bg-(--rmhbox-surface) border border-(--rmhbox-border) hover:border-(--rmhbox-accent) hover:bg-(--rmhbox-border) transition-all text-left"
                  >
                    <div className="font-semibold text-(--rmhbox-text)">{movie.title} ({movie.year})</div>
                    <div className="text-xs text-(--rmhbox-text-muted) mt-1">
                      {movie.genre.join(', ')} • {movie.difficulty}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-(--rmhbox-text-muted)">
                {timeRemaining}s remaining
              </p>
            </>
          ) : (
            <>
              <span className="text-4xl">🤔</span>
              <h2 className="text-xl font-bold text-(--rmhbox-text)">
                {producerName} is choosing a movie…
              </h2>
              <p className="text-sm text-(--rmhbox-text-muted)">Get ready to guess!</p>
            </>
          )}
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
              correctGuessers={correctGuessers}
              movieTitles={movieTitles}
            />
          )}
        </div>
      );

    case 'ROUND_RESULTS':
      return noEmojisSkipped ? (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in">
          <span className="text-5xl">⏭️</span>
          <h2 className="text-xl font-bold text-(--rmhbox-text)">Round Skipped</h2>
          <p className="text-sm text-(--rmhbox-text-muted)">
            The producer didn&apos;t submit any emojis — the round has been skipped.
          </p>
          <p className="text-lg font-semibold text-(--rmhbox-accent)">
            🎬 {resultsMovieTitle}
          </p>
        </div>
      ) : (
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
