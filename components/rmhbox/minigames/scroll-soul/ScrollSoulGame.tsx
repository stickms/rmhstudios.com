/**
 * ScrollSoulGame — Phase router for the Scroll Soul minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   COUNTDOWN  → Countdown display with player list
 *   ACTIVE     → ScrollCanvas + controls + FakeAdOverlay (if ad active)
 *   GAME_OVER  → ScrollSoulResults (final rankings)
 *
 * Handles server actions:
 *   SC_COUNTDOWN, SC_STATE_UPDATE, SC_AD_SPAWN, SC_AD_DISMISSED,
 *   SC_AD_EFFECT_APPLIED, SC_AD_TRICKED, SC_PLAYER_ELIMINATED,
 *   SC_GAME_OVER, TIMER_TICK, TIMER_START
 *
 * Keyboard handler for A/D or arrows (horizontal) + W/space (jump)
 * emits SC_MOVE at 15 Hz.
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit as socketEmit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { useHeaderTimer, useMinigameRound } from '../MinigameRenderer';
import { SC_CANVAS_WIDTH, SC_CANVAS_HEIGHT } from '@/lib/rmhbox/constants';
import ScrollCanvas from './ScrollCanvas';
import FakeAdOverlay from './FakeAdOverlay';
import ScrollSoulResults from './ScrollSoulResults';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'COUNTDOWN' | 'ACTIVE' | 'GAME_OVER';

export interface SCPlayer {
  userId: string;
  userName: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alive: boolean;
}

export interface SCPlatform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'static' | 'moving' | 'shrinking';
}

export interface SCActiveAd {
  adId: string;
  template: string;
  headline: string;
  body: string;
  realCloseButton: { x: number; y: number; size: number };
  fakeCloseButton: { x: number; y: number; size: number };
}

export interface SCScoreEntry {
  userId: string;
  userName: string;
  score: number;
}

export interface SCFinalRanking {
  userId: string;
  userName: string;
  rank: number;
  totalScore: number;
  survivalTimeMs: number;
  adsCorrectlyDismissed: number;
  adsFailed: number;
  eliminationRank: number;
}

// ─── Helpers ─────────────────────────────────────────────────────

const MOVE_INTERVAL_MS = 1000 / 15; // 15 Hz

function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  socketEmit(C2S.GAME_INPUT, { lobbyId, action, data });
}

// ─── Component ───────────────────────────────────────────────────

interface ScrollSoulGameProps {
  playerId: string;
  playerName: string;
}

export default function ScrollSoulGame({ playerId, playerName: _playerName }: ScrollSoulGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('COUNTDOWN');
  const [players, setPlayers] = useState<SCPlayer[]>([]);
  const [platforms, setPlatforms] = useState<SCPlatform[]>([]);
  const [viewportY, setViewportY] = useState(0);
  const [scrollSpeed, setScrollSpeed] = useState(1.0);
  const [lavaY, setLavaY] = useState(0);
  const [alivePlayers, setAlivePlayers] = useState<string[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [scores, setScores] = useState<SCScoreEntry[]>([]);
  const [activeAd, setActiveAd] = useState<SCActiveAd | null>(null);
  const [activeEffect, setActiveEffect] = useState<string | null>(null);
  const [finalRankings, setFinalRankings] = useState<SCFinalRanking[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [totalSurvivalTimeMs, setTotalSurvivalTimeMs] = useState(0);
  const [eliminated, setEliminated] = useState(false);

  const { startTimer, tickTimer, clearTimer } = useHeaderTimer();
  const { clearRound } = useMinigameRound();

  const keysDown = useRef(new Set<string>());
  const moveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lobbyPlayers = useRMHboxStore((s) => s.lobby?.players);

  // ─── Game action handler ─────────────────────────────────────

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'SC_COUNTDOWN': {
          setPhase('COUNTDOWN');
          if (data.players) setPlayers(data.players as SCPlayer[]);
          if (data.alivePlayers) setAlivePlayers(data.alivePlayers as string[]);
          break;
        }
        case 'SC_STATE_UPDATE': {
          if (phase === 'COUNTDOWN') setPhase('ACTIVE');
          if (data.players) {
            const updated = data.players as SCPlayer[];
            setPlayers(updated);
            setAlivePlayers(updated.filter((p) => p.alive).map((p) => p.userId));
            // Check if current player is eliminated
            const me = updated.find((p) => p.userId === playerId);
            if (me && !me.alive) setEliminated(true);
          }
          if (data.platforms) setPlatforms(data.platforms as SCPlatform[]);
          if (typeof data.viewportY === 'number') setViewportY(data.viewportY as number);
          if (typeof data.scrollSpeed === 'number') setScrollSpeed(data.scrollSpeed as number);
          if (typeof data.lavaY === 'number') setLavaY(data.lavaY as number);
          if (typeof data.elapsedMs === 'number') setElapsedMs(data.elapsedMs as number);
          if (data.scores) {
            const raw = data.scores as Record<string, number>;
            setScores(
              Object.entries(raw).map(([uid, sc]) => {
                const p = lobbyPlayers?.find((pl) => pl.userId === uid);
                return { userId: uid, userName: p?.userName ?? uid, score: sc };
              }),
            );
          }
          break;
        }
        case 'SC_AD_SPAWN': {
          setActiveAd(data.ad as SCActiveAd);
          break;
        }
        case 'SC_AD_DISMISSED': {
          setActiveAd(null);
          break;
        }
        case 'SC_AD_EFFECT_APPLIED': {
          setActiveEffect(data.effect as string);
          setActiveAd(null);
          // Clear effect after it expires
          setTimeout(() => setActiveEffect(null), (data.durationMs as number) ?? 3000);
          break;
        }
        case 'SC_AD_TRICKED': {
          setActiveEffect(data.effect as string);
          setActiveAd(null);
          setTimeout(() => setActiveEffect(null), (data.durationMs as number) ?? 3000);
          break;
        }
        case 'SC_PLAYER_ELIMINATED': {
          const uid = data.userId as string;
          setAlivePlayers((prev) => prev.filter((id) => id !== uid));
          if (uid === playerId) setEliminated(true);
          break;
        }
        case 'SC_GAME_OVER': {
          setPhase('GAME_OVER');
          clearTimer();
          clearRound();
          if (data.rankings) setFinalRankings(data.rankings as SCFinalRanking[]);
          if (data.winner) setWinner(data.winner as string);
          if (typeof data.totalSurvivalTimeMs === 'number') {
            setTotalSurvivalTimeMs(data.totalSurvivalTimeMs as number);
          }
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            const total = pl.totalDuration as number;
            const remaining = pl.timeRemaining as number;
            startTimer(total, remaining);
          }
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') {
            tickTimer(remaining);
          }
          break;
        }
      }
    },
    [lobbyPlayers, phase, playerId, startTimer, tickTimer, clearTimer, clearRound],
  );

  // Handle game-over via GAME_ROUND_RESULTS
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      const rankings = data.rankings as SCFinalRanking[] | undefined;
      if (rankings) {
        setPhase('GAME_OVER');
        clearTimer();
        clearRound();
        setFinalRankings(rankings);
        if (data.winner) setWinner(data.winner as string);
        if (typeof data.totalSurvivalTimeMs === 'number') {
          setTotalSurvivalTimeMs(data.totalSurvivalTimeMs as number);
        }
      }
    },
    [clearTimer, clearRound],
  );

  // ─── Socket subscriptions ───────────────────────────────────

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

  // ─── Hydrate from Zustand snapshot on mount ─────────────────

  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (p === 'COUNTDOWN' || p === 'ACTIVE' || p === 'GAME_OVER') {
      setPhase(p as Phase);
    }
    if (snapshot.players) setPlayers(snapshot.players as SCPlayer[]);
    if (snapshot.platforms) setPlatforms(snapshot.platforms as SCPlatform[]);
    if (typeof snapshot.viewportY === 'number') setViewportY(snapshot.viewportY as number);
    if (typeof snapshot.lavaY === 'number') setLavaY(snapshot.lavaY as number);
    if (typeof snapshot.scrollSpeed === 'number') setScrollSpeed(snapshot.scrollSpeed as number);
  }, []);

  // ─── Keyboard input (A/D/arrows + W/space → SC_MOVE at 15 Hz) ─

  useEffect(() => {
    if (phase !== 'ACTIVE' || eliminated) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['a', 'd', 'w', ' ', 'arrowleft', 'arrowright', 'arrowup'].includes(key)) {
        e.preventDefault();
        keysDown.current.add(key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.toLowerCase());
    };

    const tick = () => {
      const keys = keysDown.current;
      if (keys.size === 0) return;

      let dx = 0;
      const jump = keys.has('w') || keys.has(' ') || keys.has('arrowup');
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;

      emitGameInput('SC_MOVE', { dx, jump });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    moveTimerRef.current = setInterval(tick, MOVE_INTERVAL_MS);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (moveTimerRef.current) clearInterval(moveTimerRef.current);
      keysDown.current.clear();
    };
  }, [phase, eliminated]);

  // ─── Ad close handler ───────────────────────────────────────

  const handleAdClose = useCallback(
    (adId: string, clickPosition: { x: number; y: number }) => {
      emitGameInput('SC_AD_CLOSE', { adId, clickPosition });
    },
    [],
  );

  // ─── Render ─────────────────────────────────────────────────

  const isAlive = alivePlayers.includes(playerId);

  return (
    <AnimatePresence mode="wait">
      {/* COUNTDOWN — player list and countdown display */}
      {phase === 'COUNTDOWN' && (
        <motion.div
          key="countdown"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 text-(--rmhbox-text)"
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6, type: 'spring' }}
            className="text-4xl font-extrabold text-(--rmhbox-accent)"
          >
            Scroll Soul
          </motion.h1>
          <p className="text-sm text-(--rmhbox-text-muted)">
            Climb the platforms! Don&apos;t fall into the lava!
          </p>
          {/* Player list */}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {players.map((p) => (
              <span
                key={p.userId}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: p.color + '33', color: p.color }}
              >
                {p.userName}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* ACTIVE (alive) — game canvas + controls + ad overlay */}
      {phase === 'ACTIVE' && isAlive && (
        <motion.div
          key="active-alive"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="relative flex w-full flex-col items-center gap-2"
        >
          <div className="flex items-center gap-4 text-sm text-(--rmhbox-text-muted)">
            <span>Speed: {scrollSpeed.toFixed(1)}x</span>
            <span className="font-mono">{Math.floor(elapsedMs / 1000)}s</span>
            <span>{alivePlayers.length} alive</span>
          </div>
          {activeEffect && (
            <div className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400">
              Effect: {activeEffect}
            </div>
          )}
          <ScrollCanvas
            players={players}
            platforms={platforms}
            viewportY={viewportY}
            lavaY={lavaY}
            myUserId={playerId}
            canvasWidth={SC_CANVAS_WIDTH}
            canvasHeight={SC_CANVAS_HEIGHT}
          />
          {scores.length > 0 && (
            <div className="flex gap-3 text-xs text-(--rmhbox-text-muted)">
              {scores.map((s) => (
                <span key={s.userId} className={s.userId === playerId ? 'text-(--rmhbox-accent) font-semibold' : ''}>
                  {s.userName}: {s.score}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-(--rmhbox-text-muted)">A/D or ←/→ to move · W/Space to jump</p>
          {/* Fake ad overlay */}
          {activeAd && (
            <FakeAdOverlay ad={activeAd} onClose={handleAdClose} />
          )}
        </motion.div>
      )}

      {/* ACTIVE (eliminated) — spectator mode */}
      {phase === 'ACTIVE' && !isAlive && (
        <motion.div
          key="active-spectator"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="relative flex w-full flex-col items-center gap-2"
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-400"
          >
            💀 Eliminated — Spectating
          </motion.div>
          <div className="flex items-center gap-4 text-sm text-(--rmhbox-text-muted)">
            <span>{alivePlayers.length} alive</span>
            <span className="font-mono">{Math.floor(elapsedMs / 1000)}s</span>
          </div>
          <div className="opacity-70">
            <ScrollCanvas
              players={players}
              platforms={platforms}
              viewportY={viewportY}
              lavaY={lavaY}
              myUserId={playerId}
              canvasWidth={SC_CANVAS_WIDTH}
              canvasHeight={SC_CANVAS_HEIGHT}
            />
          </div>
        </motion.div>
      )}

      {/* GAME_OVER — final results */}
      {phase === 'GAME_OVER' && (
        <motion.div
          key="game-over"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ScrollSoulResults
            finalRankings={finalRankings}
            totalSurvivalTimeMs={totalSurvivalTimeMs}
            winner={winner}
            currentUserId={playerId}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
