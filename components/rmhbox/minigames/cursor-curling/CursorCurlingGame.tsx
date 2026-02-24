/**
 * CursorCurlingGame — Phase router for the Cursor Curling minigame.
 *
 * A physics-based curling game where players take turns throwing stones
 * toward a target house. Players aim, set power, and can sweep to
 * influence the stone's trajectory.
 *
 * Subscribes to CU_* WebSocket events and routes to the correct
 * sub-component based on the current game phase:
 *   WAITING        → Waiting for end to start
 *   AIMING         → AimArrow (directional aim)
 *   POWER          → PowerMeter (power selection)
 *   SLIDING        → CurlingCanvas + SweepOverlay (stone in motion)
 *   END_RESULTS    → EndResults (scoring)
 *   GAME_OVER      → Final standings
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
import { useHeaderTimer, useMinigameRound } from '../MinigameRenderer';
import CurlingCanvas from './CurlingCanvas';
import AimArrow from './AimArrow';
import PowerMeter from './PowerMeter';
import SweepOverlay from './SweepOverlay';
import EndResults from './EndResults';

// ─── Types ───────────────────────────────────────────────────────

type Phase = 'WAITING' | 'AIMING' | 'POWER' | 'SLIDING' | 'END_RESULTS' | 'GAME_OVER';

export interface StoneState {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  moving: boolean;
  color: string;
}

export interface EndScore {
  playerId: string;
  playerName: string;
  stoneDistances: number[];
  endPoints: number;
  closestBonus: boolean;
}

interface CursorCurlingGameProps {
  playerId: string;
  playerName: string;
}

/** Helper: emit a game input action */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

export default function CursorCurlingGame({ playerId }: CursorCurlingGameProps) {
  const [phase, setPhase] = useState<Phase>('WAITING');
  const [currentEnd, setCurrentEnd] = useState(1);
  const [totalEnds, setTotalEnds] = useState(3);
  const [stones, setStones] = useState<StoneState[]>([]);
  const [activeStoneId, setActiveStoneId] = useState<string | null>(null);
  const [thrower, setThrower] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [endScores, setEndScores] = useState<EndScore[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [aimAngle, setAimAngle] = useState(0);
  const [lockedPower, setLockedPower] = useState<number | null>(null);

  const players = useRMHboxStore((s) => s.lobby?.players);
  const { startTimer, tickTimer, clearTimer } = useHeaderTimer();
  const { setRound } = useMinigameRound();

  const isMyTurn = thrower === playerId;

  /** Handle incremental GAME_ACTION events */
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;

      switch (type) {
        case 'CU_END_START': {
          setPhase('WAITING');
          setCurrentEnd(data.end as number);
          setTotalEnds(data.totalEnds as number);
          setStones([]);
          setEndScores([]);
          setActiveStoneId(null);
          setLockedPower(null);
          setRound(data.end as number, data.totalEnds as number);
          break;
        }
        case 'CU_THROWER_ACTIVE': {
          setThrower(data.throwerUserId as string);
          setPhase('AIMING');
          setAimAngle(0);
          setLockedPower(null);
          const dur = data.duration as number;
          if (dur) startTimer(dur);
          break;
        }
        case 'CU_POWER_PHASE': {
          setPhase('POWER');
          setLockedPower(null);
          const dur = data.duration as number;
          if (dur) startTimer(dur);
          break;
        }
        case 'CU_STONE_LAUNCHED': {
          setPhase('SLIDING');
          setActiveStoneId(data.stoneId as string);
          const stone: StoneState = {
            id: data.stoneId as string,
            playerId: data.playerId as string,
            x: data.x as number,
            y: data.y as number,
            vx: data.vx as number,
            vy: data.vy as number,
            moving: true,
            color: data.color as string,
          };
          setStones((prev) => [...prev, stone]);
          clearTimer();
          break;
        }
        case 'CU_STONE_POSITION': {
          const id = data.stoneId as string;
          setStones((prev) =>
            prev.map((s) =>
              s.id === id
                ? { ...s, x: data.x as number, y: data.y as number, vx: data.vx as number, vy: data.vy as number }
                : s,
            ),
          );
          break;
        }
        case 'CU_STONE_COLLISION': {
          const updates = data.stones as Array<{ id: string; x: number; y: number; vx: number; vy: number }>;
          if (updates) {
            setStones((prev) =>
              prev.map((s) => {
                const u = updates.find((u) => u.id === s.id);
                return u ? { ...s, x: u.x, y: u.y, vx: u.vx, vy: u.vy } : s;
              }),
            );
          }
          break;
        }
        case 'CU_SWEEP_ACTIVE': {
          // Sweep phase started — stone is still sliding
          break;
        }
        case 'CU_SWEPT_EFFECT': {
          const id = data.stoneId as string;
          setStones((prev) =>
            prev.map((s) =>
              s.id === id ? { ...s, vx: data.vx as number, vy: data.vy as number } : s,
            ),
          );
          break;
        }
        case 'CU_STONE_STOPPED': {
          const id = data.stoneId as string;
          setStones((prev) =>
            prev.map((s) =>
              s.id === id
                ? { ...s, x: data.x as number, y: data.y as number, vx: 0, vy: 0, moving: false }
                : s,
            ),
          );
          setActiveStoneId(null);
          break;
        }
        case 'CU_END_RESULTS': {
          setPhase('END_RESULTS');
          setEndScores(data.endScores as EndScore[]);
          const newScores = data.scores as Record<string, number>;
          if (newScores) {
            setScores(newScores);
            const myNewScore = newScores[playerId];
            if (typeof myNewScore === 'number') {
              useRMHboxStore.setState((state) => ({
                lobby: state.lobby
                  ? {
                      ...state.lobby,
                      players: state.lobby.players.map((p) =>
                        p.userId === state.lobby!.myUserId ? { ...p, score: myNewScore } : p,
                      ),
                    }
                  : null,
              }));
            }
          }
          break;
        }
        case 'CU_GAME_OVER': {
          setPhase('GAME_OVER');
          const finalScores = data.scores as Record<string, number>;
          if (finalScores) setScores(finalScores);
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            const total = pl.total as number ?? pl.timeRemaining as number;
            const remaining = pl.timeRemaining as number;
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
        case 'MINIGAME_ROUND': {
          const current = data.current as number;
          const total = data.total as number;
          if (current && total) setRound(current, total);
          break;
        }
      }
    },
    [playerId, startTimer, tickTimer, clearTimer, setRound],
  );

  /** Handle full state snapshot (reconnection) */
  const handleStateSnapshot = useCallback(
    (data: Record<string, unknown>) => {
      if (data.phase) setPhase(data.phase as Phase);
      if (data.currentEnd) setCurrentEnd(data.currentEnd as number);
      if (data.totalEnds) setTotalEnds(data.totalEnds as number);
      if (data.stones) setStones(data.stones as StoneState[]);
      if (data.thrower) setThrower(data.thrower as string);
      if (data.scores) setScores(data.scores as Record<string, number>);
      if (data.activeStoneId) setActiveStoneId(data.activeStoneId as string);
      if (data.endScores) setEndScores(data.endScores as EndScore[]);
      if (data.timeRemaining) setTimeRemaining(data.timeRemaining as number);
    },
    [],
  );

  /** Handle game-over results from the game coordinator */
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      if (data.rankings) setPhase('GAME_OVER');
    },
    [],
  );

  // Subscribe to socket events
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on(S2C.GAME_ACTION, handleGameAction);
    socket.on(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
    socket.on(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
      socket.off(S2C.GAME_STATE_SNAPSHOT, handleStateSnapshot);
      socket.off(S2C.GAME_ROUND_RESULTS, handleRoundResults);
    };
  }, [handleGameAction, handleStateSnapshot, handleRoundResults]);

  // Hydrate from Zustand gameState snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (snapshot && Object.keys(snapshot).length > 0 && snapshot.phase) {
      handleStateSnapshot(snapshot as Record<string, unknown>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Action Handlers ────────────────────────────────────────────

  const handleAimSubmit = useCallback((angle: number) => {
    setAimAngle(angle);
  }, []);

  const handlePowerSubmit = useCallback((power: number) => {
    setLockedPower(power);
    emitGameInput('THROW_STONE', { angle: aimAngle, power });
  }, [aimAngle]);

  const handleSweep = useCallback((intensity: number) => {
    emitGameInput('SWEEP', { intensity });
  }, []);

  const getPlayerName = useCallback(
    (userId: string) => players?.find((p) => p.userId === userId)?.userName ?? userId,
    [players],
  );

  const throwerName = thrower ? getPlayerName(thrower) : '';

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4 text-(--rmhbox-text)">

      {/* Scoreboard */}
      <div className="flex w-full items-center justify-between rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2 text-sm">
        <span className="text-(--rmhbox-text-muted)">End {currentEnd}/{totalEnds}</span>
        <div className="flex gap-3">
          {Object.entries(scores).map(([uid, score]) => (
            <span
              key={uid}
              className={uid === playerId ? 'font-bold text-(--rmhbox-accent)' : 'text-(--rmhbox-text-muted)'}
            >
              {getPlayerName(uid)}: {score}
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* WAITING — End about to start */}
        {phase === 'WAITING' && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 py-8"
          >
            <p className="text-lg font-bold">End {currentEnd} of {totalEnds}</p>
            <p className="text-sm text-(--rmhbox-text-muted)">Get ready…</p>
          </motion.div>
        )}

        {/* AIMING — Direction selection */}
        {phase === 'AIMING' && (
          <motion.div
            key="aiming"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full flex-col items-center gap-3"
          >
            <p className="text-sm text-(--rmhbox-text-muted)">
              {isMyTurn ? 'Aim your stone!' : `${throwerName} is aiming…`}
            </p>
            <CurlingCanvas stones={stones} activeStoneId={activeStoneId} />
            {isMyTurn && (
              <AimArrow onSubmit={handleAimSubmit} timeRemaining={timeRemaining} />
            )}
          </motion.div>
        )}

        {/* POWER — Power meter */}
        {phase === 'POWER' && (
          <motion.div
            key="power"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex w-full flex-col items-center gap-3"
          >
            <p className="text-sm text-(--rmhbox-text-muted)">
              {isMyTurn ? 'Set your power!' : `${throwerName} is setting power…`}
            </p>
            <CurlingCanvas stones={stones} activeStoneId={activeStoneId} aimAngle={aimAngle} />
            {isMyTurn && (
              <PowerMeter onSubmit={handlePowerSubmit} locked={lockedPower} />
            )}
          </motion.div>
        )}

        {/* SLIDING — Stone in motion */}
        {phase === 'SLIDING' && (
          <motion.div
            key="sliding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex w-full flex-col items-center gap-3"
          >
            <p className="text-sm text-(--rmhbox-text-muted)">Stone in play!</p>
            <CurlingCanvas stones={stones} activeStoneId={activeStoneId} />
            <SweepOverlay
              active={activeStoneId !== null}
              canSweep={!isMyTurn}
              onSweep={handleSweep}
            />
          </motion.div>
        )}

        {/* END_RESULTS — End scoring */}
        {phase === 'END_RESULTS' && (
          <motion.div
            key="end-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <EndResults
              endScores={endScores}
              cumulativeScores={scores}
              currentUserId={playerId}
              getPlayerName={getPlayerName}
            />
          </motion.div>
        )}

        {/* GAME_OVER — Final standings */}
        {phase === 'GAME_OVER' && (
          <motion.div
            key="game-over"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-8"
          >
            <h2 className="text-2xl font-bold">Game Over!</h2>
            <div className="w-full space-y-2">
              {Object.entries(scores)
                .sort(([, a], [, b]) => b - a)
                .map(([uid, score], i) => (
                  <div
                    key={uid}
                    className={`flex items-center justify-between rounded-lg border px-4 py-2 ${
                      uid === playerId
                        ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/10 font-bold text-(--rmhbox-accent)'
                        : 'border-(--rmhbox-border) bg-(--rmhbox-surface) text-(--rmhbox-text)'
                    }`}
                  >
                    <span>#{i + 1} {getPlayerName(uid)}</span>
                    <span className="font-mono">{score}</span>
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
