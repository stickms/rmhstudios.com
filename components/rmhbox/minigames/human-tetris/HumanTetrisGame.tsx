/**
 * HumanTetrisGame — Phase router for the Human Tetris minigame.
 *
 * Subscribes to `rmhbox:game:action` WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   WALL_PREVIEW   → WallPreview (incoming wall shape)
 *   POSITIONING    → WallCanvas + SwipeDetector (move to fill holes)
 *   WALL_IMPACT    → WallAnimation (wall sweeps through)
 *   WAVE_RESULTS   → WaveResults (per-wave breakdown)
 *   GAME_OVER      → Final scoreboard
 *
 * Handles server actions:
 *   HT_WAVE_START, HT_PLAYER_MOVED, HT_MOVE_REJECTED,
 *   HT_WALL_IMPACT, HT_WAVE_RESULTS, HT_GAME_OVER,
 *   TIMER_TICK, TIMER_START, MINIGAME_ROUND
 *
 * Props:
 *   playerId: string — Current player's user ID
 *   playerName: string — Current player's display name
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import { useHeaderTimer, useMinigameRound } from '../MinigameRenderer';
import WallCanvas, { type PlayerPosition, type WallShape } from './WallCanvas';
import WallPreview from './WallPreview';
import WallAnimation, { type ImpactResult } from './WallAnimation';
import WaveResults, { type PlayerResult } from './WaveResults';
import SwipeDetector, { type Direction } from './SwipeDetector';

type Phase = 'WALL_PREVIEW' | 'POSITIONING' | 'WALL_IMPACT' | 'WAVE_RESULTS' | 'GAME_OVER';

/** Helper: emit a game input action */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface HumanTetrisGameProps {
  playerId: string;
  playerName: string;
}

interface Standing {
  userId: string;
  userName: string;
  totalScore: number;
}

export default function HumanTetrisGame({ playerId }: HumanTetrisGameProps) {
  const [phase, setPhase] = useState<Phase>('WALL_PREVIEW');
  const [waveNumber, setWaveNumber] = useState(1);
  const [totalWaves, setTotalWaves] = useState(1);
  const [wall, setWall] = useState<WallShape | null>(null);
  const [holeCount, setHoleCount] = useState(0);
  const [positions, setPositions] = useState<PlayerPosition[]>([]);
  const [correctPlayerIds, setCorrectPlayerIds] = useState<Set<string>>(new Set());
  const [impactResults, setImpactResults] = useState<ImpactResult[]>([]);
  const [wavePlayerResults, setWavePlayerResults] = useState<PlayerResult[]>([]);
  const [waveSuccess, setWaveSuccess] = useState(false);
  const [teamScore, setTeamScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [standings, setStandings] = useState<Standing[]>([]);

  const { startTimer, tickTimer, clearTimer } = useHeaderTimer();
  const { setRound, clearRound } = useMinigameRound();
  const lastSeq = useRef(-1);

  const players = useRMHboxStore((s) => s.lobby?.players);

  // Handle directional input
  const handleMove = useCallback(
    (direction: Direction) => {
      emitGameInput('HT_MOVE', { direction });
    },
    [],
  );

  // Handle incoming game actions
  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      // Sequence ordering guard
      const seq = data.seq as number | undefined;
      if (seq != null && seq <= lastSeq.current) return;
      if (seq != null) lastSeq.current = seq;

      const actionType = data.type as string;

      switch (actionType) {
        case 'HT_WAVE_START': {
          setPhase('WALL_PREVIEW');
          setWaveNumber(data.waveNumber as number);
          setTotalWaves(data.totalWaves as number);
          setRound(data.waveNumber as number, data.totalWaves as number);

          const wallData = data.wall as WallShape;
          setWall(wallData);

          // Count holes in the wall
          let holes = 0;
          if (wallData?.cells) {
            for (const row of wallData.cells) {
              for (const cell of row) {
                if (cell === 'hole') holes++;
              }
            }
          }
          setHoleCount(holes);

          // Initialize player positions from server
          const posData = data.positions as Array<{
            playerId: string;
            playerName: string;
            col: number;
            row: number;
            colorIndex: number;
          }> | undefined;
          if (posData) {
            setPositions(posData);
          }

          setCorrectPlayerIds(new Set());
          setImpactResults([]);
          break;
        }

        case 'HT_POSITIONING_START': {
          setPhase('POSITIONING');
          if (data.duration) {
            startTimer(data.duration as number);
          }
          break;
        }

        case 'HT_PLAYER_MOVED': {
          const movedId = data.playerId as string;
          const newCol = data.col as number;
          const newRow = data.row as number;

          setPositions((prev) =>
            prev.map((p) =>
              p.playerId === movedId ? { ...p, col: newCol, row: newRow } : p,
            ),
          );

          // Update correct placement set
          const correctIds = data.correctPlayerIds as string[] | undefined;
          if (correctIds) {
            setCorrectPlayerIds(new Set(correctIds));
          }
          break;
        }

        case 'HT_MOVE_REJECTED': {
          // Visual feedback could be added here (shake, flash)
          break;
        }

        case 'HT_WALL_IMPACT': {
          setPhase('WALL_IMPACT');
          clearTimer();

          const results = data.results as Array<{
            playerId: string;
            playerName: string;
            safe: boolean;
            inDeadZone: boolean;
          }> | undefined;
          if (results) {
            setImpactResults(results);
          }
          break;
        }

        case 'HT_WAVE_RESULTS': {
          setPhase('WAVE_RESULTS');
          setWaveSuccess(data.success as boolean);
          setTeamScore(data.teamScore as number);
          setStreak(data.streak as number);

          const playerResults = data.playerResults as Array<{
            playerId: string;
            playerName: string;
            status: 'safe' | 'hit' | 'dead-zone';
            pointsEarned: number;
          }> | undefined;
          if (playerResults) {
            setWavePlayerResults(playerResults);
          }
          break;
        }

        case 'HT_GAME_OVER': {
          setPhase('GAME_OVER');
          clearTimer();
          clearRound();

          const scores = data.scores as Record<string, number> | undefined;
          if (scores) {
            const list: Standing[] = Object.entries(scores).map(([uid, sc]) => {
              const p = players?.find((pl) => pl.userId === uid);
              return { userId: uid, userName: p?.userName ?? uid, totalScore: sc };
            });
            list.sort((a, b) => b.totalScore - a.totalScore);
            setStandings(list);
          }
          break;
        }

        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            startTimer(pl.totalDuration as number, pl.timeRemaining as number);
          }
          break;
        }

        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') tickTimer(remaining);
          break;
        }

        case 'MINIGAME_ROUND': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl) {
            setRound(pl.current as number, pl.total as number);
          }
          break;
        }
      }
    },
    [players, startTimer, tickTimer, clearTimer, setRound, clearRound],
  );

  // Handle round results for game-over
  const handleRoundResults = useCallback(
    (data: Record<string, unknown>) => {
      const rankings = data.rankings as Array<{
        userId: string;
        userName: string;
        score: number;
        rank: number;
      }> | undefined;

      if (rankings) {
        setPhase('GAME_OVER');
        clearTimer();
        clearRound();
        const scoreboard: Standing[] = rankings.map((r) => ({
          userId: r.userId,
          userName: r.userName,
          totalScore: r.score,
        }));
        setStandings(scoreboard);
      }
    },
    [clearTimer, clearRound],
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

  // Hydrate from Zustand gameState snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (
      p === 'WALL_PREVIEW' ||
      p === 'POSITIONING' ||
      p === 'WALL_IMPACT' ||
      p === 'WAVE_RESULTS' ||
      p === 'GAME_OVER'
    ) {
      setPhase(p);
    }
    if (snapshot.waveNumber != null) setWaveNumber(snapshot.waveNumber as number);
    if (snapshot.totalWaves != null) setTotalWaves(snapshot.totalWaves as number);
    if (snapshot.wall) setWall(snapshot.wall as WallShape);
    if (snapshot.teamScore != null) setTeamScore(snapshot.teamScore as number);
    if (Array.isArray(snapshot.positions)) {
      setPositions(snapshot.positions as PlayerPosition[]);
    }
  }, []);

  return (
    <SwipeDetector onMove={handleMove} enabled={phase === 'POSITIONING'}>
      <AnimatePresence mode="wait">
        {/* WALL_PREVIEW — show incoming wall shape */}
        {phase === 'WALL_PREVIEW' && wall && (
          <motion.div
            key="wall-preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center"
          >
            <WallPreview
              wall={wall}
              holeCount={holeCount}
              waveNumber={waveNumber}
              totalWaves={totalWaves}
            />
          </motion.div>
        )}

        {/* POSITIONING — move players into holes */}
        {phase === 'POSITIONING' && (
          <motion.div
            key="positioning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-3"
          >
            <p className="text-sm text-(--rmhbox-text-muted) text-center">
              Move into the <span className="text-emerald-400 font-semibold">green holes</span>!
              <br />
              <span className="text-xs">Use arrow keys or swipe</span>
            </p>
            <WallCanvas
              wall={wall}
              players={positions}
              localPlayerId={playerId}
              correctPlayerIds={correctPlayerIds}
              showWall
            />
            {/* Mobile direction buttons */}
            <div className="grid grid-cols-3 gap-1 w-32 sm:hidden">
              <div />
              <button
                onClick={() => handleMove('up')}
                className="rounded bg-(--rmhbox-surface) border border-(--rmhbox-border) p-2 text-center text-(--rmhbox-text) active:bg-(--rmhbox-surface-hover)"
              >
                ▲
              </button>
              <div />
              <button
                onClick={() => handleMove('left')}
                className="rounded bg-(--rmhbox-surface) border border-(--rmhbox-border) p-2 text-center text-(--rmhbox-text) active:bg-(--rmhbox-surface-hover)"
              >
                ◀
              </button>
              <button
                onClick={() => handleMove('down')}
                className="rounded bg-(--rmhbox-surface) border border-(--rmhbox-border) p-2 text-center text-(--rmhbox-text) active:bg-(--rmhbox-surface-hover)"
              >
                ▼
              </button>
              <button
                onClick={() => handleMove('right')}
                className="rounded bg-(--rmhbox-surface) border border-(--rmhbox-border) p-2 text-center text-(--rmhbox-text) active:bg-(--rmhbox-surface-hover)"
              >
                ▶
              </button>
            </div>
          </motion.div>
        )}

        {/* WALL_IMPACT — wall sweeps through */}
        {phase === 'WALL_IMPACT' && (
          <motion.div
            key="wall-impact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center"
          >
            <WallAnimation results={impactResults} />
          </motion.div>
        )}

        {/* WAVE_RESULTS — per-wave results */}
        {phase === 'WAVE_RESULTS' && (
          <motion.div
            key="wave-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center"
          >
            <WaveResults
              waveNumber={waveNumber}
              totalWaves={totalWaves}
              success={waveSuccess}
              playerResults={wavePlayerResults}
              teamScore={teamScore}
              streak={streak}
              currentUserId={playerId}
            />
          </motion.div>
        )}

        {/* GAME_OVER — final scoreboard */}
        {phase === 'GAME_OVER' && (
          <motion.div
            key="game-over"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="flex flex-col items-center gap-4 text-(--rmhbox-text)"
          >
            <h2 className="text-2xl font-bold text-(--rmhbox-accent)">Game Over!</h2>
            <p className="text-sm text-(--rmhbox-text-muted)">
              Final Team Score: <span className="font-bold text-(--rmhbox-accent)">{teamScore}</span>
            </p>

            <div className="w-full max-w-sm space-y-2">
              {standings.map((s, i) => {
                const isMe = s.userId === playerId;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                return (
                  <motion.div
                    key={s.userId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className={`flex items-center justify-between rounded-lg border px-4 py-2 ${
                      isMe
                        ? 'border-(--rmhbox-accent)/50 bg-(--rmhbox-accent)/10'
                        : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
                    }`}
                  >
                    <span className={`text-sm ${isMe ? 'font-semibold text-(--rmhbox-accent)' : ''}`}>
                      {medal} #{i + 1} {s.userName}
                      {isMe && <span className="ml-1 text-[10px] opacity-60">(you)</span>}
                    </span>
                    <span className="font-mono text-sm">{s.totalScore}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SwipeDetector>
  );
}
