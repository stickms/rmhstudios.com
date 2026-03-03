/**
 * SequenceSamGame — Phase router for the Sequence Sam minigame.
 *
 * Subscribes to SS_* and TIMER_TICK WebSocket events and routes to
 * the correct sub-component based on the current game phase:
 *   ROUND_START      → Round number + chaos announcement
 *   PATTERN_DISPLAY  → GridDisplay (non-interactive, tiles flash)
 *   INPUT            → GridDisplay (interactive, player taps)
 *   ROUND_RESULTS    → Round summary with per-player results
 *   GAME_OVER        → SequenceSamResults (final scores + awards)
 *
 * Scoring: points per correct tap + first-finish bonus.
 * Game ends when ≤1 player completes the latest sequence.
 */
'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitGameInput, useGameSocket, extractTimerTick } from '@/lib/rmhbox/minigame-client';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { playSound } from '@/lib/rmhbox/audio';
import GridDisplay from './GridDisplay';
import ChaosOverlay from './ChaosOverlay';
import SequenceSamResults from './SequenceSamResults';
import type { TileState } from './GridTile';
import type { Ranking, AwardEntry } from './SequenceSamResults';

type Phase =
  | 'ROUND_START'
  | 'PATTERN_DISPLAY'
  | 'INPUT'
  | 'ROUND_RESULTS'
  | 'GAME_OVER';

/** Per-player round result from SS_ROUND_RESULTS. */
interface RoundPlayerResult {
  userId: string;
  userName: string;
  completed: boolean;
  correctTaps: number;
  roundScore: number;
  totalScore: number;
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
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [rotated, setRotated] = useState(false);
  const [tiles, setTiles] = useState<TileState[]>(DEFAULT_TILES);
  const [progress, setProgress] = useState(0);
  const [patternLength, setPatternLength] = useState(0);
  const [rankings, setRankings] = useState<Ranking[]>([]);
  const [awards, setAwards] = useState<AwardEntry[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundPlayerResult[]>([]);

  const players = useRMHboxStore((s) => s.lobby?.players);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      const actionType = data.type as string;

      switch (actionType) {
        case 'SS_ROUND_START': {
          setPhase('ROUND_START');
          setCurrentRound(data.round as number);
          setIsChaos((data.isChaosRound as boolean) ?? false);
          setRotationDegrees((data.rotationDegrees as number) ?? 0);
          setRotated(false);
          setTiles([...DEFAULT_TILES]);
          setProgress(0);
          setPatternLength((data.sequenceLength as number) ?? 0);
          setRoundResults([]);
          playSound('goFanfare');
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
          playSound('click');
          break;
        }

        case 'SS_GRID_ROTATE': {
          setRotated(true);
          playSound('swoosh');
          break;
        }

        case 'SS_PATTERN_COMPLETE': {
          setPhase('INPUT');
          setTiles([...DEFAULT_TILES]);
          setProgress(0);
          playSound('swoosh');
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
            playSound('scoreDing');
          } else {
            playSound('buzzer');
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
          if (userId === playerId) {
            playSound('chime');
          }
          break;
        }

        case 'SS_PLAYER_FAILED': {
          const userId = data.userId as string;
          if (userId === playerId) {
            playSound('buzzer');
          }
          break;
        }

        case 'SS_ROUND_RESULTS': {
          setPhase('ROUND_RESULTS');
          const results = data.playerResults as RoundPlayerResult[] | undefined;
          if (results) {
            setRoundResults(results);
          }
          playSound('chime');
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
          playSound('victoryFanfare');
          break;
        }

        case 'TIMER_TICK': {
          const remaining = extractTimerTick(data);
          if (remaining != null) setTimeRemaining(remaining);
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

  /** Hydrate full state from a GAME_STATE_SNAPSHOT (reconnection / initial broadcast). */
  const handleStateSnapshot = useCallback(
    (snapshot: Record<string, unknown>) => {
      if (!snapshot.phase) return;
      const p = snapshot.phase as string;
      if (
        p === 'ROUND_START' ||
        p === 'PATTERN_DISPLAY' ||
        p === 'INPUT' ||
        p === 'ROUND_RESULTS' ||
        p === 'GAME_OVER'
      ) {
        setPhase(p);
      }
      if (snapshot.currentRound) setCurrentRound(snapshot.currentRound as number);
      if (snapshot.isChaosRound) setIsChaos(snapshot.isChaosRound as boolean);
      if (snapshot.rotationDegrees != null) setRotationDegrees(snapshot.rotationDegrees as number);
      if (snapshot.sequenceLength != null) setPatternLength(snapshot.sequenceLength as number);
    },
    [],
  );

  // Subscribe via the standard useGameSocket hook (GAME_ACTION + GAME_STATE_SNAPSHOT + hydration)
  useGameSocket({
    onGameAction: handleGameAction,
    onStateSnapshot: handleStateSnapshot,
  });

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
          <ChaosOverlay isChaos={isChaos} rotationDegrees={rotationDegrees} />
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
            {isChaos && (
              <span className="rounded-full bg-(--rmhbox-danger)/20 px-3 py-0.5 text-xs font-bold text-(--rmhbox-danger) animate-pulse">
                🔄 CHAOS — Rotated {rotationDegrees}°
              </span>
            )}
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
              {roundResults.map((pr) => (
                <li
                  key={pr.userId}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    pr.userId === playerId ? 'bg-(--rmhbox-accent)/10 ring-1 ring-(--rmhbox-accent)/30' : ''
                  }`}
                >
                  <span className="font-semibold">{pr.userName}</span>
                  <div className="flex items-center gap-3">
                    <span className={pr.completed ? 'text-(--rmhbox-success)' : 'text-(--rmhbox-danger)'}>
                      {pr.completed ? '✓ Completed' : `✗ ${pr.correctTaps} taps`}
                    </span>
                    <span className="font-mono text-xs text-(--rmhbox-accent)">
                      +{pr.roundScore}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
