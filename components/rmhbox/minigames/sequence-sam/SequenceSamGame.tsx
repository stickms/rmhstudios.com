/**
 * SequenceSamGame — Phase router for the Sequence Sam minigame.
 *
 * Subscribes to SS_* and TIMER_TICK WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   ROUND_START      → Round number + chaos announcement
 *   PATTERN_DISPLAY  → GridDisplay (non-interactive, tiles flash)
 *   INPUT            → GridDisplay (interactive, player taps)
 *   ROUND_RESULTS    → Round summary
 *   ELIMINATION      → EliminationBanner
 *   GAME_OVER        → SequenceSamResults (final scores + awards)
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSocket, emit } from '@/lib/rmhbox/socket';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { S2C, C2S } from '@/lib/rmhbox/events';
import GridDisplay from './GridDisplay';
import StrikeIndicator from './StrikeIndicator';
import ChaosOverlay from './ChaosOverlay';
import EliminationBanner from './EliminationBanner';
import SequenceSamResults from './SequenceSamResults';
import type { TileState } from './GridTile';
import type { Ranking, AwardEntry } from './SequenceSamResults';

type Phase =
  | 'ROUND_START'
  | 'PATTERN_DISPLAY'
  | 'INPUT'
  | 'ROUND_RESULTS'
  | 'ELIMINATION'
  | 'GAME_OVER';

interface PlayerStatus {
  userId: string;
  userName: string;
  completed: boolean;
  strikes: number;
}

/** Helper: emit a game input action */
function emitGameInput(action: string, data: unknown = {}) {
  const lobbyId = useRMHboxStore.getState().lobby?.lobbyId;
  if (!lobbyId) return;
  emit(C2S.GAME_INPUT, { lobbyId, action, data });
}

interface SequenceSamGameProps {
  playerId: string;
  playerName: string;
}

const DEFAULT_TILES: TileState[] = Array(9).fill('default');

export default function SequenceSamGame({ playerId, playerName: _playerName }: SequenceSamGameProps) {
  void _playerName;

  const [phase, setPhase] = useState<Phase>('ROUND_START');
  const [currentRound, setCurrentRound] = useState(1);
  const [isChaos, setIsChaos] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [tiles, setTiles] = useState<TileState[]>(DEFAULT_TILES);
  const [strikesRemaining, setStrikesRemaining] = useState(3);
  const [maxStrikes, setMaxStrikes] = useState(3);
  const [playerStatuses, setPlayerStatuses] = useState<PlayerStatus[]>([]);
  const [progress, setProgress] = useState(0);
  const [patternLength, setPatternLength] = useState(0);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);
  const [eliminationRank, setEliminationRank] = useState(0);
  const [eliminationScore, setEliminationScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const players = useRMHboxStore((s) => s.lobby?.players);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'SS_ROUND_START': {
          setPhase('ROUND_START');
          setCurrentRound(data.round as number);
          setIsChaos((data.isChaos as boolean) ?? false);
          setRotated(false);
          setTiles([...DEFAULT_TILES]);
          setProgress(0);
          setPatternLength((data.patternLength as number) ?? 0);
          if (data.maxStrikes != null) setMaxStrikes(data.maxStrikes as number);
          if (data.strikesRemaining != null) setStrikesRemaining(data.strikesRemaining as number);
          // eslint-disable-next-line no-console
          console.log('[playSound] round-start');
          break;
        }

        case 'SS_PATTERN_STEP': {
          setPhase('PATTERN_DISPLAY');
          const tileIndex = data.position as number;
          setTiles((prev) => {
            const next = prev.map(() => 'default' as TileState);
            if (tileIndex >= 0 && tileIndex < 9) {
              next[tileIndex] = 'flashing';
            }
            return next;
          });
          // eslint-disable-next-line no-console
          console.log('[playSound] pattern-step');
          break;
        }

        case 'SS_GRID_ROTATE': {
          setRotated(true);
          // eslint-disable-next-line no-console
          console.log('[playSound] grid-rotate');
          break;
        }

        case 'SS_PATTERN_COMPLETE': {
          setPhase('INPUT');
          setTiles([...DEFAULT_TILES]);
          setProgress(0);
          // eslint-disable-next-line no-console
          console.log('[playSound] pattern-complete');
          break;
        }

        case 'SS_TAP_RESULT': {
          const tileIndex = data.position as number;
          const correct = data.correct as boolean;

          setTiles((prev) => {
            const next = [...prev];
            if (tileIndex >= 0 && tileIndex < 9) {
              next[tileIndex] = correct ? 'tapped-correct' : 'tapped-incorrect';
            }
            return next;
          });

          if (correct) {
            setProgress((prev) => prev + 1);
            // eslint-disable-next-line no-console
            console.log('[playSound] tap-correct');
          } else {
            setStrikesRemaining((prev) => Math.max(0, prev - 1));
            // eslint-disable-next-line no-console
            console.log('[playSound] tap-incorrect');
          }

          // Reset tile after brief delay
          setTimeout(() => {
            setTiles((prev) => {
              const next = [...prev];
              if (tileIndex >= 0 && tileIndex < 9) {
                next[tileIndex] = 'default';
              }
              return next;
            });
          }, 300);
          break;
        }

        case 'SS_PLAYER_COMPLETE': {
          const userId = data.userId as string;
          setPlayerStatuses((prev) => {
            const existing = prev.find((p) => p.userId === userId);
            if (existing) {
              return prev.map((p) =>
                p.userId === userId ? { ...p, completed: true } : p,
              );
            }
            const p = players?.find((pl) => pl.userId === userId);
            return [...prev, { userId, userName: p?.userName ?? userId, completed: true, strikes: 0 }];
          });
          if (userId === playerId) {
            // eslint-disable-next-line no-console
            console.log('[playSound] player-complete');
          }
          break;
        }

        case 'SS_PLAYER_FAILED': {
          const userId = data.userId as string;
          setPlayerStatuses((prev) => {
            const existing = prev.find((p) => p.userId === userId);
            if (existing) {
              return prev.map((p) =>
                p.userId === userId ? { ...p, completed: false, strikes: (data.strikes as number) ?? 0 } : p,
              );
            }
            const p = players?.find((pl) => pl.userId === userId);
            return [...prev, { userId, userName: p?.userName ?? userId, completed: false, strikes: (data.strikes as number) ?? 0 }];
          });
          if (userId === playerId) {
            // eslint-disable-next-line no-console
            console.log('[playSound] player-failed');
          }
          break;
        }

        case 'SS_ROUND_RESULTS': {
          setPhase('ROUND_RESULTS');
          setPlayerStatuses([]);
          const results = data.playerResults as Record<string, { completed: boolean; strikes: number }> | undefined;
          if (results) {
            const statuses: PlayerStatus[] = Object.entries(results).map(([uid, r]) => {
              const p = players?.find((pl) => pl.userId === uid);
              return { userId: uid, userName: p?.userName ?? uid, completed: r.completed, strikes: r.strikes };
            });
            setPlayerStatuses(statuses);
          }
          // eslint-disable-next-line no-console
          console.log('[playSound] round-results');
          break;
        }

        case 'SS_ELIMINATION': {
          const userId = data.userId as string;
          if (userId === playerId) {
            setPhase('ELIMINATION');
            setEliminationRank((data.rank as number) ?? 0);
            setEliminationScore((data.score as number) ?? 0);
            // eslint-disable-next-line no-console
            console.log('[playSound] elimination');
          }
          break;
        }

        case 'SS_GAME_OVER': {
          setPhase('GAME_OVER');
          const rawRankings = data.rankings as Array<{
            userId: string;
            userName: string;
            score: number;
            rank: number;
          }> | undefined;

          if (rawRankings) {
            setRankings(rawRankings);
          }

          const rawAwards = data.awards as Array<{
            userId: string;
            title: string;
            description: string;
            icon: string;
          }> | undefined;

          if (rawAwards) {
            setAwards(
              rawAwards.map((a) => ({
                icon: a.icon,
                title: a.title,
                recipient: a.userId,
                description: a.description,
              })),
            );
          }
          // eslint-disable-next-line no-console
          console.log('[playSound] game-over');
          break;
        }

        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') setTimeRemaining(remaining);
          break;
        }

        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl?.timeRemaining != null) {
            setTimeRemaining(pl.timeRemaining as number);
          }
          break;
        }
      }
    },
    [players, playerId],
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on(S2C.GAME_ACTION, handleGameAction);
    return () => {
      socket.off(S2C.GAME_ACTION, handleGameAction);
    };
  }, [handleGameAction]);

  // Hydrate from store snapshot on mount
  useEffect(() => {
    const snapshot = useRMHboxStore.getState().gameState;
    if (!snapshot || !snapshot.phase) return;

    const p = snapshot.phase as string;
    if (
      p === 'ROUND_START' ||
      p === 'PATTERN_DISPLAY' ||
      p === 'INPUT' ||
      p === 'ROUND_RESULTS' ||
      p === 'ELIMINATION' ||
      p === 'GAME_OVER'
    ) {
      setPhase(p);
    }
    if (snapshot.currentRound) setCurrentRound(snapshot.currentRound as number);
    if (snapshot.isChaos) setIsChaos(snapshot.isChaos as boolean);
    if (snapshot.strikesRemaining != null) setStrikesRemaining(snapshot.strikesRemaining as number);
    if (snapshot.maxStrikes != null) setMaxStrikes(snapshot.maxStrikes as number);
  }, []);

  const handleTileTap = useCallback(
    (tileIndex: number) => {
      emitGameInput('SS_TAP', { position: tileIndex });
    },
    [],
  );

  return (
    <AnimatePresence mode="wait">
      {phase === 'ROUND_START' && (
        <motion.div
          key="round-start"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 text-(--rmhbox-text)"
        >
          <ChaosOverlay isChaos={isChaos} />
          <p className="text-sm uppercase tracking-wider text-(--rmhbox-text-muted)">
            Round {currentRound}
          </p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, type: 'spring' }}
            className="text-4xl font-extrabold text-(--rmhbox-accent)"
          >
            {isChaos ? 'Chaos Round!' : 'Watch the Pattern!'}
          </motion.h1>
          <StrikeIndicator strikesRemaining={strikesRemaining} maxStrikes={maxStrikes} />
        </motion.div>
      )}

      {(phase === 'PATTERN_DISPLAY' || phase === 'INPUT') && (
        <motion.div
          key="grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex w-full flex-col items-center gap-4"
        >
          <div className="flex w-full max-w-md items-center justify-between px-2 text-sm text-(--rmhbox-text-muted)">
            <span>Round {currentRound}</span>
            <StrikeIndicator strikesRemaining={strikesRemaining} maxStrikes={maxStrikes} />
            {phase === 'INPUT' && (
              <span className="font-mono">{progress}/{patternLength}</span>
            )}
            {phase === 'INPUT' && timeRemaining > 0 && (
              <span className="font-mono">{timeRemaining}s</span>
            )}
          </div>

          {phase === 'PATTERN_DISPLAY' && (
            <p className="text-sm font-medium text-(--rmhbox-accent)">Watch carefully…</p>
          )}
          {phase === 'INPUT' && (
            <p className="text-sm font-medium text-(--rmhbox-accent)">Your turn! Repeat the pattern</p>
          )}

          <GridDisplay
            tiles={tiles}
            interactive={phase === 'INPUT'}
            onTileTap={handleTileTap}
            rotated={rotated}
          />
        </motion.div>
      )}

      {phase === 'ROUND_RESULTS' && (
        <motion.div
          key="round-results"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 text-(--rmhbox-text)"
        >
          <h2 className="text-center text-xl font-bold">Round {currentRound} Results</h2>
          <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
            <ul className="space-y-2">
              {playerStatuses.map((ps) => (
                <li
                  key={ps.userId}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    ps.userId === playerId ? 'bg-(--rmhbox-accent)/10 ring-1 ring-(--rmhbox-accent)/30' : ''
                  }`}
                >
                  <span className="font-semibold">{ps.userName}</span>
                  <div className="flex items-center gap-2">
                    <span className={ps.completed ? 'text-(--rmhbox-success)' : 'text-(--rmhbox-danger)'}>
                      {ps.completed ? '✓ Completed' : '✗ Failed'}
                    </span>
                    {ps.strikes > 0 && (
                      <span className="text-xs text-(--rmhbox-danger)">
                        {ps.strikes} strike{ps.strikes !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {phase === 'ELIMINATION' && (
        <motion.div
          key="elimination"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <EliminationBanner rank={eliminationRank} score={eliminationScore} />
        </motion.div>
      )}

      {phase === 'GAME_OVER' && (
        <motion.div
          key="game-over"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <SequenceSamResults
            rankings={rankings}
            awards={awards}
            currentUserId={playerId}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
