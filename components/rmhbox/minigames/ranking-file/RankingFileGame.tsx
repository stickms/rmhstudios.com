/**
 * RankingFileGame — phase router for the Ranking File minigame.
 *
 *   ORDERING → the prompt, the five items to order and a Lock in button
 *   REVEAL   → the official order with values, and the round's points
 *
 * Server actions handled: RF_ROUND, RF_LOCKED, RF_PLAYER_LOCKED, RF_REVEAL,
 * RF_SCORE_UPDATE, TIMER_START, TIMER_TICK. Every GAME_STATE_SNAPSHOT
 * (mount, reconnect) re-hydrates the phase, the items, our own order and the
 * reveal, so the screen always matches the server.
 *
 * Until the reveal the client holds only the shuffled labels and its own
 * order: the server never sends the official order or any value earlier.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket } from '@/lib/rmhbox/minigame-client';
import { playSound } from '@/lib/rmhbox/audio';
import OrderList from './OrderList';
import RoundReveal from './RoundReveal';
import type { RFRevealPayload } from './reveal-types';

type Phase = 'ORDERING' | 'REVEAL' | 'GAME_OVER';

const PHASES: readonly Phase[] = ['ORDERING', 'REVEAL', 'GAME_OVER'];

interface RankingFileGameProps {
  playerId: string;
  playerName: string;
}

export default function RankingFileGame({ playerId, playerName: _playerName }: RankingFileGameProps) {
  void _playerName; // Part of MinigameProps; not used here
  const { t } = useTranslation('ranking-file');

  const [phase, setPhase] = useState<Phase>('ORDERING');
  const [roundIndex, setRoundIndex] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [reveal, setReveal] = useState<RFRevealPayload | null>(null);
  const [myScore, setMyScore] = useState(0);

  const players = useRMHboxStore((s) => s.lobby?.players);
  const myRole = useRMHboxStore((s) => s.lobby?.myRole);
  const isSpectator = myRole === 'spectator';
  const totalPlayers = players?.filter((p) => p.isConnected).length ?? 0;

  const setLiveScore = useCallback((score: number) => {
    setMyScore(score);
    useRMHboxStore.setState({ liveMinigameScore: score });
  }, []);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      switch (data.type as string) {
        case 'RF_ROUND': {
          setPhase('ORDERING');
          setRoundIndex((data.roundIndex as number) ?? 0);
          setTotalRounds((data.totalRounds as number) ?? 0);
          setPrompt((data.prompt as string) ?? '');
          setCategory((data.category as string) ?? '');
          setLabels(Array.isArray(data.labels) ? (data.labels as string[]) : []);
          setLocked(false);
          setLockedIds([]);
          setReveal(null);
          if (typeof data.duration === 'number') setTimeRemaining(data.duration);
          playSound('swoosh');
          break;
        }
        case 'RF_LOCKED': {
          setLocked(true);
          if (Array.isArray(data.order)) setLabels(data.order as string[]);
          playSound('click');
          break;
        }
        case 'RF_PLAYER_LOCKED': {
          const id = data.userId as string;
          setLockedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
          break;
        }
        case 'RF_REVEAL': {
          setPhase('REVEAL');
          const payload = data as unknown as RFRevealPayload;
          setReveal(payload);
          const mine = payload.results?.find((r) => r.userId === playerId);
          if (mine) playSound(mine.perfect ? 'scoreDing' : 'click');
          break;
        }
        case 'RF_SCORE_UPDATE': {
          const scores = data.scores as Record<string, number> | undefined;
          if (scores && scores[playerId] != null) setLiveScore(scores[playerId]);
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl && typeof pl.timeRemaining === 'number') setTimeRemaining(pl.timeRemaining);
          break;
        }
        case 'TIMER_TICK': {
          const pl = data.payload as Record<string, unknown> | undefined;
          const remaining = (pl?.timeRemaining ?? data.timeRemaining) as number;
          if (typeof remaining === 'number') {
            setTimeRemaining(remaining);
            if (remaining <= 3 && remaining > 0) playSound('countdownBeep');
          }
          break;
        }
      }
    },
    [playerId, setLiveScore],
  );

  const handleRoundResults = useCallback(() => {
    setPhase('GAME_OVER');
    useRMHboxStore.setState({ liveMinigameScore: null });
  }, []);

  // A full server snapshot (getStateForPlayer) is authoritative
  const handleStateSnapshot = useCallback(
    (snapshot: Record<string, unknown>) => {
      const p = snapshot.phase as Phase | undefined;
      if (!p || !PHASES.includes(p)) return;
      setPhase(p);
      setRoundIndex((snapshot.currentRoundIndex as number) ?? 0);
      setTotalRounds((snapshot.totalRounds as number) ?? 0);
      setPrompt((snapshot.prompt as string) ?? '');
      setCategory((snapshot.category as string) ?? '');
      const mineOrder = Array.isArray(snapshot.myOrder) ? (snapshot.myOrder as string[]) : null;
      const shown = Array.isArray(snapshot.labels) ? (snapshot.labels as string[]) : [];
      setLabels(mineOrder ?? shown);
      setLocked(snapshot.myLocked === true);
      setLockedIds(Array.isArray(snapshot.lockedPlayerIds) ? (snapshot.lockedPlayerIds as string[]) : []);
      if (typeof snapshot.timeRemaining === 'number') setTimeRemaining(snapshot.timeRemaining);
      const rv = snapshot.reveal as RFRevealPayload | null | undefined;
      setReveal(rv && Array.isArray(rv.official) ? rv : null);
      const scores = snapshot.scores as Record<string, number> | undefined;
      if (scores && scores[playerId] != null) setLiveScore(scores[playerId]);
    },
    [playerId, setLiveScore],
  );

  useGameSocket({
    onGameAction: handleGameAction,
    onStateSnapshot: handleStateSnapshot,
    onRoundResults: handleRoundResults,
  });

  // Clear the footer score when the minigame unmounts
  useEffect(() => {
    return () => {
      useRMHboxStore.setState({ liveMinigameScore: null });
    };
  }, []);

  const handleReorder = useCallback(
    (next: string[]) => {
      if (isSpectator || locked) return;
      setLabels(next);
      emitGameInput('reorder', { order: next });
    },
    [isSpectator, locked],
  );

  const handleLock = useCallback(() => {
    if (isSpectator || locked) return;
    setLocked(true);
    emitGameInput('lock', {});
  }, [isSpectator, locked]);

  if (phase === 'GAME_OVER') {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-app-text-muted">
          {t('game-over', { defaultValue: 'Game over. Calculating results…' })}
        </p>
      </div>
    );
  }

  if (phase === 'REVEAL') {
    return reveal ? (
      <RoundReveal reveal={reveal} myPlayerId={playerId} myOrder={isSpectator ? null : labels} />
    ) : (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-app-text-muted">{t('revealing', { defaultValue: 'Revealing the order…' })}</p>
      </div>
    );
  }

  if (labels.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-app-text-muted">
          {t('waiting-round', { defaultValue: 'Waiting for the next round…' })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4" data-testid="rf-ordering">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-app-text-muted">
            {t('round-of', {
              defaultValue: 'Round {{current}} of {{total}}',
              current: roundIndex + 1,
              total: totalRounds,
            })}
            {category ? ` · ${category}` : ''}
          </p>
          <h2 className="text-lg font-semibold text-app-text">{prompt}</h2>
        </div>
        <span
          className="font-mono text-sm tabular-nums text-app-text-muted"
          role="timer"
          aria-label={t('time-left', { defaultValue: 'Seconds left' })}
        >
          {t('seconds-short', { defaultValue: '{{count}}s', count: Math.max(0, timeRemaining) })}
        </span>
      </div>

      <OrderList labels={labels} onChange={handleReorder} disabled={isSpectator || locked} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-text-muted">
          {t('locked-count', {
            defaultValue: '{{locked}} of {{total}} locked in',
            locked: lockedIds.length,
            total: totalPlayers,
          })}
          {myScore > 0 ? ` · ${t('your-score', { defaultValue: 'Score {{score}}', score: myScore })}` : ''}
        </p>
        {isSpectator ? (
          <p className="text-sm text-app-text-muted">
            {t('watching', { defaultValue: 'You are watching this round.' })}
          </p>
        ) : locked ? (
          <p className="text-sm text-app-text-muted">
            {t('locked-waiting', { defaultValue: 'Locked in. Waiting for the others.' })}
          </p>
        ) : (
          <button
            type="button"
            onClick={handleLock}
            className="flex min-h-9 items-center gap-2 rounded-app-sm bg-app-accent px-4 text-sm font-semibold text-app-accent-fg transition-colors hover:bg-app-accent-hover pointer-coarse:min-h-11"
          >
            <Lock className="size-4" aria-hidden="true" />
            {t('lock-in', { defaultValue: 'Lock in' })}
          </button>
        )}
      </div>
    </div>
  );
}
