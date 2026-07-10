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
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket, extractTimerTick } from '@/lib/rmhbox/minigame-client';
import { playSound } from '@/lib/rmhbox/audio';
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

  // Track spectator status from the store (not from snapshot data)
  const { t } = useTranslation("c-rmhbox");

  const isSpectator = useRMHboxStore((s) => s.lobby?.myRole === 'spectator');

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
          playSound('swoosh');
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
          playSound('scoreDing');
          break;
        }
        case 'WR_RESULTS': {
          setPhase('RESULTS');
          setResults(data.playerResults as Record<string, WRPlayerResult>);
          playSound('victoryFanfare');
          break;
        }
        case 'WR_NAVIGATE_REJECTED': {
          setIsLoading(false);
          setErrorMsg(data.reason as string);
          globalThis.setTimeout(() => setErrorMsg(null), 2000);
          playSound('buzzer');
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
          const remaining = extractTimerTick(data);
          if (remaining !== undefined) {
            setTimeRemaining(remaining);
            if (remaining <= 5 && remaining > 0) playSound('countdownBeep');
          }
          break;
        }
      }
    },
    [playerId],
  );

  /** Handle full state snapshot (reconnection / spectator player switch) */
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
        // Restore article HTML from the snapshot so the page renders
        // immediately on reconnect without waiting for an async fetch.
        if (myState.currentArticleHtml) {
          setArticleHtml(myState.currentArticleHtml as string);
        }
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

  // Subscribe to socket events and hydrate from store on mount
  useGameSocket({
    onGameAction: handleGameAction,
    onStateSnapshot: handleStateSnapshot,
  });

  // ─── Action Handlers ────────────────────────────────────────────

  const handleNavigate = useCallback((targetTitle: string) => {
    if (hasFinished || isSpectator) return;
    setIsLoading(true);
    emitGameInput('NAVIGATE', { targetTitle });
    playSound('click');
  }, [hasFinished, isSpectator]);

  const handleGoBack = useCallback((targetTitle: string, pathIndex: number) => {
    if (hasFinished || isSpectator) return;
    setIsLoading(true);
    // Truncate path locally for snappy UI
    setPath((prev) => prev.slice(0, pathIndex + 1));
    emitGameInput('GO_BACK', { targetTitle, pathIndex });
  }, [hasFinished, isSpectator]);

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
              <div className="flex flex-col gap-0.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-(--rmhbox-text-muted)">{t("target-label", { defaultValue: "Target:" })}</span>
                  <span className="font-bold text-(--rmhbox-accent)">
                    {targetArticle?.title}
                  </span>
                </div>
                {targetArticle?.description && (
                  <span className="text-xs text-(--rmhbox-text-muted) italic">
                    {targetArticle.description}
                  </span>
                )}
              </div>
              <div
                className={`shrink-0 rounded-lg px-3 py-1 text-sm font-medium ${
                  timeRemaining <= 15
                    ? 'bg-(--rmhbox-danger-dim) text-(--rmhbox-danger) animate-pulse'
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
                  <Flag className="h-5 w-5 inline" /> {t("finished-rank", { defaultValue: "Finished! Rank #{{rank}}", rank: finishRank })}
                </span>
                <p className="text-sm text-(--rmhbox-success)/70">
                  {t("finished-clicks", { defaultValue: "{{clicks}} clicks • Viewing target article", clicks: clickCount })}
                </p>
              </div>
            )}

            {/* Breadcrumb trail */}
            <BreadcrumbTrail
              path={path}
              startTitle={startArticle?.title ?? ''}
              targetTitle={targetArticle?.title ?? ''}
              onGoBack={handleGoBack}
              disabled={hasFinished || isSpectator}
            />

            {/* Article frame */}
            <WikiFrame
              html={articleHtml}
              currentTitle={currentTitle}
              isLoading={isLoading}
              disabled={hasFinished || isSpectator}
              onNavigate={handleNavigate}
            />

            {/* Other players progress */}
            {Object.keys(otherPlayers).length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3">
                <span className="text-xs font-medium uppercase tracking-wider text-(--rmhbox-text-muted)">
                  {t("other-players", { defaultValue: "Other Players" })}
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
