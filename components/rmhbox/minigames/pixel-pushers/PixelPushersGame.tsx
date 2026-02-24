/**
 * PixelPushersGame — Phase router for the Pixel Pushers minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   LEVEL_PREVIEW  → Level preview with layout visualization
 *   ACTIVE         → GameCanvas with keyboard input
 *   LEVEL_COMPLETE → Level completion celebration
 *   GAME_OVER      → PixelPushersResults (final rankings)
 *
 * Handles server actions:
 *   PP_LEVEL_START, PP_STATE_UPDATE, PP_PUSH_EVENT,
 *   PP_POLARITY_WARNING, PP_POLARITY_FLIP, PP_POLARITY_RESTORE,
 *   PP_WAYPOINT_REACHED, PP_LEVEL_COMPLETE, PP_LEVEL_FAILED,
 *   PP_GAME_OVER, TIMER_TICK, TIMER_START
 *
 * Keyboard handler for WASD/arrow keys emits PP_MOVE at 15 Hz.
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
import GameCanvas from './GameCanvas';
import PixelPushersResults from './PixelPushersResults';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'LEVEL_PREVIEW' | 'ACTIVE' | 'LEVEL_COMPLETE' | 'GAME_OVER';

interface Vec2 {
  x: number;
  y: number;
}

interface Pusher {
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
  polarityFlipped: boolean;
}

interface Wall {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Waypoint {
  id: number;
  x: number;
  y: number;
  radius: number;
  reached: boolean;
  color: string;
}

interface GoalZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Layout {
  width: number;
  height: number;
}

interface ScoreEntry {
  userId: string;
  userName: string;
  score: number;
}

export interface FinalRanking {
  userId: string;
  userName: string;
  rank: number;
  score: number;
  pushCount: number;
  polarityFlipsHandled: number;
}

// ─── Helpers ─────────────────────────────────────────────────────

const MOVE_INTERVAL_MS = 1000 / 15; // 15 Hz

function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  socketEmit(C2S.GAME_INPUT, { lobbyId, action, data });
}

// ─── Component ───────────────────────────────────────────────────

interface PixelPushersGameProps {
  playerId: string;
  playerName: string;
}

export default function PixelPushersGame({ playerId, playerName: _playerName }: PixelPushersGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('LEVEL_PREVIEW');
  const [level, setLevel] = useState(1);
  const [levelName, setLevelName] = useState('');
  const [layout, setLayout] = useState<Layout>({ width: 800, height: 600 });
  const [ball, setBall] = useState<Vec2>({ x: 400, y: 300 });
  const [pushers, setPushers] = useState<Pusher[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [goalZone, setGoalZone] = useState<GoalZone>({ x: 700, y: 500, width: 60, height: 60 });
  const [walls, setWalls] = useState<Wall[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [finalRankings, setFinalRankings] = useState<FinalRanking[]>([]);

  const { startTimer, tickTimer, clearTimer } = useHeaderTimer();
  const { setRound, clearRound } = useMinigameRound();

  // Keyboard movement tracking at 15 Hz
  const keysDown = useRef(new Set<string>());
  const moveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const players = useRMHboxStore((s) => s.lobby?.players);

  // ─── Game action handler ─────────────────────────────────────

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'PP_LEVEL_START': {
          setPhase('LEVEL_PREVIEW');
          setLevel(data.level as number);
          setLevelName((data.levelName as string) ?? `Level ${data.level}`);
          if (data.layout) setLayout(data.layout as Layout);
          if (data.ball) setBall(data.ball as Vec2);
          if (data.pushers) setPushers(data.pushers as Pusher[]);
          if (data.waypoints) setWaypoints(data.waypoints as Waypoint[]);
          if (data.goalZone) setGoalZone(data.goalZone as GoalZone);
          if (data.walls) setWalls(data.walls as Wall[]);
          if (data.totalLevels) setRound(data.level as number, data.totalLevels as number);
          // Auto-transition to ACTIVE after the server sends PP_STATE_UPDATE
          break;
        }
        case 'PP_STATE_UPDATE': {
          if (phase === 'LEVEL_PREVIEW') setPhase('ACTIVE');
          if (data.ball) setBall(data.ball as Vec2);
          if (data.pushers) setPushers(data.pushers as Pusher[]);
          if (data.waypoints) setWaypoints(data.waypoints as Waypoint[]);
          if (data.scores) {
            const raw = data.scores as Record<string, number>;
            setScores(
              Object.entries(raw).map(([uid, sc]) => {
                const p = players?.find((pl) => pl.userId === uid);
                return { userId: uid, userName: p?.userName ?? uid, score: sc };
              }),
            );
          }
          break;
        }
        case 'PP_PUSH_EVENT': {
          // Visual feedback could be added here; state update follows
          break;
        }
        case 'PP_POLARITY_WARNING': {
          // Could trigger a UI warning overlay
          break;
        }
        case 'PP_POLARITY_FLIP': {
          if (data.pushers) setPushers(data.pushers as Pusher[]);
          break;
        }
        case 'PP_POLARITY_RESTORE': {
          if (data.pushers) setPushers(data.pushers as Pusher[]);
          break;
        }
        case 'PP_WAYPOINT_REACHED': {
          if (data.waypoints) setWaypoints(data.waypoints as Waypoint[]);
          break;
        }
        case 'PP_LEVEL_COMPLETE': {
          setPhase('LEVEL_COMPLETE');
          clearTimer();
          if (data.scores) {
            const raw = data.scores as Record<string, number>;
            setScores(
              Object.entries(raw).map(([uid, sc]) => {
                const p = players?.find((pl) => pl.userId === uid);
                return { userId: uid, userName: p?.userName ?? uid, score: sc };
              }),
            );
          }
          break;
        }
        case 'PP_LEVEL_FAILED': {
          setPhase('LEVEL_COMPLETE');
          clearTimer();
          break;
        }
        case 'PP_GAME_OVER': {
          setPhase('GAME_OVER');
          clearTimer();
          clearRound();
          if (data.rankings) setFinalRankings(data.rankings as FinalRanking[]);
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            const total = pl.totalDuration as number;
            const remaining = pl.timeRemaining as number;
            setTimeRemaining(remaining);
            startTimer(total, remaining);
          }
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') {
            setTimeRemaining(remaining);
            tickTimer(remaining);
          }
          break;
        }
      }
    },
    [players, phase, startTimer, tickTimer, clearTimer, setRound, clearRound],
  );

  // Handle game-over via GAME_ROUND_RESULTS (same pattern as other minigames)
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      const rankings = data.rankings as FinalRanking[] | undefined;
      if (rankings) {
        setPhase('GAME_OVER');
        clearTimer();
        clearRound();
        setFinalRankings(rankings);
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
    if (p === 'LEVEL_PREVIEW' || p === 'ACTIVE' || p === 'LEVEL_COMPLETE' || p === 'GAME_OVER') {
      setPhase(p);
    }
    if (snapshot.level) setLevel(snapshot.level as number);
    if (snapshot.levelName) setLevelName(snapshot.levelName as string);
    if (snapshot.layout) setLayout(snapshot.layout as Layout);
    if (snapshot.ball) setBall(snapshot.ball as Vec2);
    if (snapshot.pushers) setPushers(snapshot.pushers as Pusher[]);
    if (snapshot.waypoints) setWaypoints(snapshot.waypoints as Waypoint[]);
    if (snapshot.goalZone) setGoalZone(snapshot.goalZone as GoalZone);
    if (snapshot.walls) setWalls(snapshot.walls as Wall[]);
  }, []);

  // ─── Keyboard input (WASD / Arrow keys → PP_MOVE at 15 Hz) ─

  useEffect(() => {
    if (phase !== 'ACTIVE') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
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
      let dy = 0;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;

      if (dx !== 0 || dy !== 0) {
        emitGameInput('PP_MOVE', { dx, dy });
      }
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
  }, [phase]);

  // ─── Render ─────────────────────────────────────────────────

  return (
    <AnimatePresence mode="wait">
      {/* LEVEL_PREVIEW — level name + layout preview */}
      {phase === 'LEVEL_PREVIEW' && (
        <motion.div
          key="level-preview"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 text-(--rmhbox-text)"
        >
          <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">
            Level {level}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6, type: 'spring' }}
            className="text-4xl font-extrabold text-(--rmhbox-accent)"
          >
            {levelName}
          </motion.h1>
          <p className="text-sm text-(--rmhbox-text-muted)">
            Use WASD or arrow keys to push the ball!
          </p>
          {/* Mini layout preview */}
          <div
            className="mt-2 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface)"
            style={{ width: Math.min(layout.width * 0.4, 320), height: Math.min(layout.height * 0.4, 240) }}
          />
        </motion.div>
      )}

      {/* ACTIVE — full game canvas */}
      {phase === 'ACTIVE' && (
        <motion.div
          key="active"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col items-center gap-2"
        >
          <div className="flex items-center gap-4 text-sm text-(--rmhbox-text-muted)">
            <span>Level {level}: {levelName}</span>
            <span className="font-mono">{timeRemaining}s</span>
          </div>
          <GameCanvas
            ball={ball}
            pushers={pushers}
            walls={walls}
            goalZone={goalZone}
            waypoints={waypoints}
            myUserId={playerId}
            canvasWidth={layout.width}
            canvasHeight={layout.height}
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
        </motion.div>
      )}

      {/* LEVEL_COMPLETE — celebration */}
      {phase === 'LEVEL_COMPLETE' && (
        <motion.div
          key="level-complete"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center gap-3 text-(--rmhbox-text)"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="text-5xl"
          >
            🎉
          </motion.div>
          <h2 className="text-2xl font-bold text-(--rmhbox-accent)">Level Complete!</h2>
          <p className="text-sm text-(--rmhbox-text-muted)">
            Get ready for the next level…
          </p>
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
          <PixelPushersResults
            finalRankings={finalRankings}
            levelsCompleted={level}
            currentUserId={playerId}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
