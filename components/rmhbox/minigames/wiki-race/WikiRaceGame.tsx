/**
 * WikiRaceGame — Phase router for the Wiki-Race minigame.
 *
 * Players race from a start Wikipedia article to a target article by
 * clicking internal wiki links. The server validates every navigation
 * server-side (anti-cheat) and sends sanitized article HTML.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   ARTICLE_REVEAL → ArticleReveal (start + target descriptions)
 *   NAVIGATION     → WikiFrame (article HTML) + BreadcrumbTrail
 *   RESULTS        → WikiRaceResults (paths, scores, awards)
 *
 * Handles server actions:
 *   WR_ARTICLES_REVEALED, WR_NAVIGATION_START, WR_ARTICLE_CONTENT,
 *   WR_PLAYER_PROGRESS, WR_PLAYER_FINISHED, WR_RESULTS,
 *   WR_NAVIGATE_REJECTED, TIMER_TICK
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import ArticleReveal from './ArticleReveal';
import WikiFrame from './WikiFrame';
import BreadcrumbTrail from './BreadcrumbTrail';
import PlayerProgressBar from './PlayerProgressBar';
import WikiRaceResults from './WikiRaceResults';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'ARTICLE_REVEAL' | 'NAVIGATION' | 'RESULTS';

interface ArticleInfo {
  title: string;
  description: string;
}

interface OtherPlayer {
  userId: string;
  userName: string;
  clickCount: number;
  pathLength: number;
  hasFinished: boolean;
  finishRank: number;
}

interface WRPlayerResult {
  userName: string;
  path: string[];
  clickCount: number;
  hasFinished: boolean;
  finishRank: number;
  score: number;
}

/** Helper: emit a game input action */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface WikiRaceGameProps {
  playerId: string;
  playerName: string;
}

export default function WikiRaceGame({ playerId, playerName: _playerName }: WikiRaceGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('ARTICLE_REVEAL');
  const [startArticle, setStartArticle] = useState<ArticleInfo | null>(null);
  const [targetArticle, setTargetArticle] = useState<ArticleInfo | null>(null);
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [duration, setDuration] = useState(0);

  // Navigation state
  const [currentTitle, setCurrentTitle] = useState('');
  const [articleHtml, setArticleHtml] = useState('');
  const [path, setPath] = useState<string[]>([]);
  const [clickCount, setClickCount] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  const [finishRank, setFinishRank] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Other players
  const [otherPlayers, setOtherPlayers] = useState<Record<string, OtherPlayer>>({});

  // Results
  const [results, setResults] = useState<Record<string, WRPlayerResult> | null>(null);

  // Error
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const players = useRMHboxStore((s) => s.lobby?.players);

  /** Handle incremental GAME_ACTION events */
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;

      switch (type) {
        case 'WR_ARTICLES_REVEALED': {
          setPhase('ARTICLE_REVEAL');
          setStartArticle(data.startArticle as ArticleInfo);
          setTargetArticle(data.targetArticle as ArticleInfo);
          setDifficulty(data.difficulty as string);
          setDuration(data.duration as number);
          setTimeRemaining(data.duration as number);
          setPath([]);
          setClickCount(0);
          setHasFinished(false);
          setFinishRank(0);
          setResults(null);
          setArticleHtml('');
          setOtherPlayers({});
          break;
        }
        case 'WR_NAVIGATION_START': {
          setPhase('NAVIGATION');
          setDuration(data.duration as number);
          setTimeRemaining(data.timeRemaining as number ?? data.duration as number);
          setIsLoading(true);
          break;
        }
        case 'WR_ARTICLE_CONTENT': {
          setCurrentTitle(data.title as string);
          setArticleHtml(data.html as string);
          setIsLoading(false);
          // Update path with new title if not already last entry
          setPath((prev) => {
            if (prev.length === 0) return [data.title as string];
            if (prev[prev.length - 1] === data.title) return prev;
            return [...prev, data.title as string];
          });
          break;
        }
        case 'WR_PLAYER_PROGRESS': {
          const uid = data.userId as string;
          if (uid === playerId) {
            setClickCount(data.clickCount as number);
          } else {
            setOtherPlayers((prev) => ({
              ...prev,
              [uid]: {
                ...prev[uid],
                userId: uid,
                userName: prev[uid]?.userName ?? uid,
                clickCount: data.clickCount as number,
                pathLength: data.pathLength as number,
                hasFinished: prev[uid]?.hasFinished ?? false,
                finishRank: prev[uid]?.finishRank ?? 0,
              },
            }));
          }
          break;
        }
        case 'WR_PLAYER_FINISHED': {
          const uid = data.userId as string;
          if (uid === playerId) {
            setHasFinished(true);
            setFinishRank(data.rank as number);
          } else {
            setOtherPlayers((prev) => ({
              ...prev,
              [uid]: {
                ...prev[uid],
                userId: uid,
                userName: prev[uid]?.userName ?? uid,
                clickCount: data.clickCount as number,
                pathLength: data.pathLength as number,
                hasFinished: true,
                finishRank: data.rank as number,
              },
            }));
          }
          break;
        }
        case 'WR_RESULTS': {
          setPhase('RESULTS');
          setResults(data.playerResults as Record<string, WRPlayerResult>);
          break;
        }
        case 'WR_NAVIGATE_REJECTED': {
          setIsLoading(false);
          setErrorMsg(data.reason as string);
          globalThis.setTimeout(() => setErrorMsg(null), 2000);
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
      setStartArticle(data.startArticle as ArticleInfo);
      setTargetArticle(data.targetArticle as ArticleInfo);
      setDifficulty(data.difficulty as string);
      setTimeRemaining(data.timeRemaining as number ?? 0);

      const myState = data.myState as Record<string, unknown> | null;
      if (myState) {
        setCurrentTitle(myState.currentArticleTitle as string);
        setPath(myState.path as string[]);
        setClickCount(myState.clickCount as number);
        setHasFinished(myState.hasFinished as boolean);
        setFinishRank(myState.finishRank as number);
      }

      const other = data.otherPlayers as Record<string, OtherPlayer> | undefined;
      if (other) setOtherPlayers(other);
    },
    [],
  );

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on(S2C.GAME_ACTION, handleGameAction);
    socket.on(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
      socket.off(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
    };
  }, [handleGameAction, handleStateSnapshot]);

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

  const handleNavigate = useCallback((targetTitle: string) => {
    if (hasFinished) return;
    setIsLoading(true);
    emitGameInput('NAVIGATE', { targetTitle });
  }, [hasFinished]);

  const handleGoBack = useCallback((targetTitle: string, pathIndex: number) => {
    if (hasFinished) return;
    setIsLoading(true);
    // Truncate path locally for snappy UI
    setPath((prev) => prev.slice(0, pathIndex + 1));
    emitGameInput('GO_BACK', { targetTitle, pathIndex });
  }, [hasFinished]);

  // Player name lookup
  const getPlayerName = useCallback(
    (userId: string) => players?.find((p) => p.userId === userId)?.userName ?? userId,
    [players],
  );

  // Populate other player names from lobby
  useEffect(() => {
    if (!players) return;
    setOtherPlayers((prev) => {
      const next = { ...prev };
      for (const p of players) {
        if (p.userId !== playerId && next[p.userId]) {
          next[p.userId] = { ...next[p.userId], userName: p.userName };
        }
      }
      return next;
    });
  }, [players, playerId]);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4 text-(--rmhbox-text)">
      {/* Error toast */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-lg bg-red-500/20 border border-red-500/40 px-4 py-2 text-center text-sm text-red-300"
          >
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* ARTICLE_REVEAL */}
        {phase === 'ARTICLE_REVEAL' && startArticle && targetArticle && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <ArticleReveal
              startArticle={startArticle}
              targetArticle={targetArticle}
              difficulty={difficulty}
              duration={duration}
            />
          </motion.div>
        )}

        {/* NAVIGATION */}
        {phase === 'NAVIGATION' && (
          <motion.div
            key="navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            {/* Target reminder + timer */}
            <div className="flex items-center justify-between rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-(--rmhbox-text-muted)">Target:</span>
                <span className="font-bold text-(--rmhbox-accent)">
                  {targetArticle?.title}
                </span>
              </div>
              <div
                className={`rounded-lg px-3 py-1 text-sm font-medium ${
                  timeRemaining <= 15
                    ? 'bg-red-500/20 text-red-300 animate-pulse'
                    : 'bg-(--rmhbox-surface) text-(--rmhbox-text-muted)'
                }`}
              >
                {timeRemaining}s
              </div>
            </div>

            {/* Finished banner */}
            {hasFinished && (
              <div className="rounded-lg bg-(--rmhbox-success-dim) border border-(--rmhbox-success)/40 px-4 py-3 text-center">
                <span className="text-lg font-bold text-(--rmhbox-success)">
                  <Flag className="h-5 w-5 inline" /> Finished! Rank #{finishRank}
                </span>
                <p className="text-sm text-(--rmhbox-success)/70">
                  {clickCount} clicks • Viewing target article
                </p>
              </div>
            )}

            {/* Breadcrumb trail */}
            <BreadcrumbTrail
              path={path}
              startTitle={startArticle?.title ?? ''}
              targetTitle={targetArticle?.title ?? ''}
              onGoBack={handleGoBack}
              disabled={hasFinished}
            />

            {/* Article frame */}
            <WikiFrame
              html={articleHtml}
              currentTitle={currentTitle}
              isLoading={isLoading}
              disabled={hasFinished}
              onNavigate={handleNavigate}
            />

            {/* Other players progress */}
            {Object.keys(otherPlayers).length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3">
                <span className="text-xs font-medium uppercase tracking-wider text-(--rmhbox-text-muted)">
                  Other Players
                </span>
                {Object.values(otherPlayers).map((p) => (
                  <PlayerProgressBar
                    key={p.userId}
                    name={p.userName}
                    clickCount={p.clickCount}
                    hasFinished={p.hasFinished}
                    finishRank={p.finishRank}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* RESULTS */}
        {phase === 'RESULTS' && results && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <WikiRaceResults
              results={results}
              startTitle={startArticle?.title ?? ''}
              targetTitle={targetArticle?.title ?? ''}
              currentUserId={playerId}
              getPlayerName={getPlayerName}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
