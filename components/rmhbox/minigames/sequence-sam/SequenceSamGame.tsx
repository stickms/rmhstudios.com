/**
 * SequenceSamGame — phase router for the Sequence Sam minigame.
 *
 *   SHOW   → the pads light up one step at a time, the same for everyone
 *   RECALL → the player taps the sequence back (pads, or keys 1 to 4)
 *   RESULT → the whole sequence, and how every player did
 *
 * Server actions handled: SS_ROUND, SS_STEP, SS_RECALL, SS_TAP, SS_PLAYER_DONE,
 * SS_RESULT, SS_SCORE_UPDATE, TIMER_START, TIMER_TICK. Every GAME_STATE_SNAPSHOT
 * (mount, reconnect) re-hydrates the phase and the steps shown so far.
 *
 * Until a step is shown the client holds nothing of it: the server sends each
 * step as it lights and the whole sequence only after the round.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket } from '@/lib/rmhbox/minigame-client';
import { playSound, playTone } from '@/lib/rmhbox/audio';
import PadGrid from './PadGrid';
import RoundResult from './RoundResult';
import type { SSResultPayload } from './RoundResult';
import { PAD_TONES_HZ, padName } from './pad-names';

type Phase = 'WAITING' | 'SHOW' | 'RECALL' | 'RESULT' | 'GAME_OVER';

const SNAPSHOT_PHASES: readonly string[] = ['SHOW', 'RECALL', 'RESULT'];
/** How long a player's own tap stays lit. */
const TAP_LIT_MS = 160;
const TONE_MS = 220;

interface SequenceSamGameProps {
  playerId: string;
  playerName: string;
}

export default function SequenceSamGame({ playerId, playerName: _playerName }: SequenceSamGameProps) {
  void _playerName; // Part of MinigameProps; not used here
  const { t } = useTranslation('sequence-sam');

  const [phase, setPhase] = useState<Phase>('WAITING');
  const [roundIndex, setRoundIndex] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [length, setLength] = useState(0);
  const [shownCount, setShownCount] = useState(0);
  const [litPad, setLitPad] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [myCorrect, setMyCorrect] = useState(0);
  const [finished, setFinished] = useState(false);
  const [missed, setMissed] = useState(false);
  const [imIn, setImIn] = useState(false);
  const [imOut, setImOut] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [result, setResult] = useState<SSResultPayload | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [doneCount, setDoneCount] = useState(0);

  const litTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myRole = useRMHboxStore((s) => s.lobby?.myRole);
  const isSpectator = myRole === 'spectator';

  const setLiveScore = useCallback((score: number) => {
    setMyScore(score);
    useRMHboxStore.setState({ liveMinigameScore: score });
  }, []);

  /** Light a pad by a fill change for `ms`, then put it out (and clear the spoken name). */
  const lightPad = useCallback((pad: number, ms: number, name: string | null) => {
    if (litTimer.current) clearTimeout(litTimer.current);
    setLitPad(pad);
    if (name !== null) setAnnouncement(name);
    playTone(PAD_TONES_HZ[pad] ?? PAD_TONES_HZ[0], TONE_MS);
    litTimer.current = setTimeout(() => {
      setLitPad(null);
      setAnnouncement('');
      litTimer.current = null;
    }, ms);
  }, []);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      switch (data.type as string) {
        case 'SS_ROUND': {
          setPhase('SHOW');
          setRoundIndex((data.roundIndex as number) ?? 0);
          setTotalRounds((data.totalRounds as number) ?? 0);
          setLength((data.length as number) ?? 0);
          setShownCount(0);
          setMyCorrect(0);
          setFinished(false);
          setMissed(false);
          setDoneCount(0);
          setResult(null);
          const inIds = Array.isArray(data.playersIn) ? (data.playersIn as string[]) : [];
          const outIds = Array.isArray(data.playersOut) ? (data.playersOut as string[]) : [];
          setImIn(inIds.includes(playerId));
          setImOut(outIds.includes(playerId));
          setTimeRemaining(0);
          playSound('swoosh');
          break;
        }
        case 'SS_STEP': {
          const pad = data.pad as number;
          if (typeof pad !== 'number') break;
          setPhase('SHOW');
          setShownCount(((data.step as number) ?? 0) + 1);
          lightPad(pad, (data.litMs as number) ?? 420, padName(t, pad));
          break;
        }
        case 'SS_RECALL': {
          setPhase('RECALL');
          if (typeof data.duration === 'number') setTimeRemaining(data.duration);
          break;
        }
        case 'SS_TAP': {
          // Only the tapper is sent this: how their own tap went
          if (typeof data.correctSteps === 'number') setMyCorrect(data.correctSteps);
          if (data.finished === true) setFinished(true);
          if (data.correct === false) {
            setMissed(true);
            playSound('buzzer');
          } else if (data.complete === true) {
            playSound('scoreDing');
          }
          break;
        }
        case 'SS_PLAYER_DONE': {
          setDoneCount((n) => n + 1);
          break;
        }
        case 'SS_RESULT': {
          setPhase('RESULT');
          setResult(data as unknown as SSResultPayload);
          break;
        }
        case 'SS_SCORE_UPDATE': {
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
          if (typeof remaining === 'number') setTimeRemaining(remaining);
          break;
        }
      }
    },
    [lightPad, playerId, setLiveScore, t],
  );

  const handleRoundResults = useCallback(() => {
    setPhase('GAME_OVER');
    useRMHboxStore.setState({ liveMinigameScore: null });
  }, []);

  // A full server snapshot (getStateForPlayer) is authoritative
  const handleStateSnapshot = useCallback(
    (snapshot: Record<string, unknown>) => {
      const p = snapshot.phase as string | undefined;
      if (!p || !SNAPSHOT_PHASES.includes(p)) return;
      setPhase(p as Phase);
      setRoundIndex((snapshot.currentRoundIndex as number) ?? 0);
      setTotalRounds((snapshot.totalRounds as number) ?? 0);
      setLength((snapshot.length as number) ?? 0);
      setShownCount(Array.isArray(snapshot.shownSteps) ? snapshot.shownSteps.length : 0);
      setMyCorrect((snapshot.myCorrect as number) ?? 0);
      setFinished(snapshot.myFinished === true);
      setImIn(snapshot.imIn === true);
      setImOut(snapshot.imOut === true);
      setDoneCount(Array.isArray(snapshot.finishedPlayerIds) ? snapshot.finishedPlayerIds.length : 0);
      if (typeof snapshot.timeRemaining === 'number') setTimeRemaining(snapshot.timeRemaining);
      const rv = snapshot.result as SSResultPayload | null | undefined;
      setResult(rv && Array.isArray(rv.results) ? rv : null);
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

  // Clear the footer score and the lit-pad timer when the minigame unmounts
  useEffect(() => {
    return () => {
      useRMHboxStore.setState({ liveMinigameScore: null });
      if (litTimer.current) clearTimeout(litTimer.current);
    };
  }, []);

  const canTap = phase === 'RECALL' && imIn && !finished && !isSpectator;

  const handleTap = useCallback(
    (pad: number) => {
      if (!canTap) return;
      lightPad(pad, TAP_LIT_MS, null);
      emitGameInput('tap', { pad });
    },
    [canTap, lightPad],
  );

  if (phase === 'GAME_OVER') {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-app-text-muted">
          {t('game-over', { defaultValue: 'Game over. Calculating results…' })}
        </p>
      </div>
    );
  }

  if (phase === 'WAITING') {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-app-text-muted">
          {t('waiting-round', { defaultValue: 'Waiting for the first round…' })}
        </p>
      </div>
    );
  }

  const watching = isSpectator || imOut || !imIn;
  let status: string;
  if (phase === 'SHOW') {
    status = t('status-watch', {
      defaultValue: 'Watch the pads. Step {{shown}} of {{length}}.',
      shown: shownCount,
      length,
    });
  } else if (phase === 'RECALL') {
    status = watching
      ? t('status-watching', { defaultValue: 'You are watching this round.' })
      : finished
        ? missed
          ? t('status-missed', { defaultValue: 'Wrong pad. Waiting for the others.' })
          : t('status-done', { defaultValue: 'Sequence played. Waiting for the others.' })
        : t('status-play', { defaultValue: 'Your turn. {{done}} of {{length}} played.', done: myCorrect, length });
  } else {
    status = t('status-result', { defaultValue: 'Round over.' });
  }

  return (
    <div className="flex w-full flex-col gap-4" data-testid="ss-game">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-app-text-muted">
            {t('round-of', {
              defaultValue: 'Round {{current}} of {{total}}',
              current: roundIndex + 1,
              total: totalRounds,
            })}
            {' · '}
            {t('length-steps', { defaultValue_one: '{{count}} step', defaultValue: '{{count}} steps', count: length })}
          </p>
          <h2 className="text-lg font-semibold text-app-text">{status}</h2>
        </div>
        {phase === 'RECALL' && (
          <span
            className="font-mono text-sm tabular-nums text-app-text-muted"
            role="timer"
            aria-label={t('time-left', { defaultValue: 'Seconds left' })}
          >
            {t('seconds-short', { defaultValue: '{{count}}s', count: Math.max(0, timeRemaining) })}
          </span>
        )}
      </div>

      {phase === 'RESULT' ? (
        result ? (
          <RoundResult result={result} myPlayerId={playerId} />
        ) : (
          <p className="text-sm text-app-text-muted">{t('revealing', { defaultValue: 'Counting the points…' })}</p>
        )
      ) : (
        <PadGrid litPad={litPad} enabled={canTap} onTap={handleTap} announcement={announcement} />
      )}

      <p className="text-sm text-app-text-muted">
        {phase === 'RECALL' ? `${t('done-count', { defaultValue: '{{done}} finished', done: doneCount })} · ` : ''}
        {t('your-score', { defaultValue: 'Score {{score}}', score: myScore })}
      </p>
    </div>
  );
}
