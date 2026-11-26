/**
 * HumanKeyboardGame — phase router for the Human Keyboard minigame.
 *
 *   REVEAL       → the sentence is shown, the table sees its letters
 *   TYPING       → each player presses only the letters they hold
 *   ROUND_RESULT → the time, every player's presses and the points
 *
 * Server actions handled: HK_ROUND, HK_DEAL, HK_TYPING, HK_PRESS, HK_LOCK,
 * HK_KEY_WRONG, HK_KEY_NOT_YOURS, HK_RESHUFFLE_WARNING, HK_RESULT,
 * HK_SCORE_UPDATE, TIMER_START, TIMER_PAUSED, TIMER_RESUMED. Every
 * GAME_STATE_SNAPSHOT (mount, reconnect) re-hydrates the phase, the cursor and
 * the player's own letters.
 *
 * The hub judges every press: this component never moves the cursor itself.
 * The countdown is drawn from the phase's end time and re-rendered by one
 * setTimeout a second while TYPING is live; nothing else here is scheduled.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket } from '@/lib/rmhbox/minigame-client';
import { playSound, playTone } from '@/lib/rmhbox/audio';
import { completedWord, countdownTicks } from '@/lib/rmhbox/human-keyboard/rules';
import LetterPad from './LetterPad';
import SentenceLine from './SentenceLine';

type Phase = 'WAITING' | 'REVEAL' | 'TYPING' | 'ROUND_RESULT' | 'GAME_OVER';

const SNAPSHOT_PHASES: readonly string[] = ['REVEAL', 'TYPING', 'ROUND_RESULT'];
const PRESS_TONE_HZ = 520;
const WRONG_LOCK_MS = 500;

interface HKResultPayload {
  roundIndex: number;
  sentence: string;
  completed: boolean;
  elapsedMs: number;
  secondsLeft: number;
  multiplier: number;
  results: Array<{
    userId: string;
    userName: string;
    correct: number;
    wrong: number;
    points: number;
    perfect: boolean;
    mvp: boolean;
    newTotalScore: number;
  }>;
}

interface HumanKeyboardGameProps {
  playerId: string;
  playerName: string;
}

/**
 * The seconds left, drawn from a local deadline and redrawn by one setTimeout a
 * second while it is live. While the table is locked that one timeout fires at
 * the lock's end instead (never later than a second), so the indicator clears
 * on time; it is still the only timer.
 */
function Countdown({
  deadline,
  paused,
  frozen,
  phase,
  wakeAt,
  onTick,
}: {
  deadline: number;
  paused: boolean;
  frozen: number;
  phase: string;
  /** A local time the next tick must not wait past (the lock's end); 0 for none. */
  wakeAt: number;
  onTick: (now: number) => void;
}) {
  const { t } = useTranslation('human-keyboard');
  const [now, setNow] = useState(() => Date.now());
  const live = countdownTicks(phase, paused);

  useEffect(() => {
    if (!live) return undefined;
    const untilWake = wakeAt > 0 ? wakeAt - Date.now() : 1000;
    const delay = Math.min(1000, Math.max(0, untilWake));
    const handle = setTimeout(() => {
      const at = Date.now();
      setNow(at);
      onTick(at);
    }, delay);
    return () => clearTimeout(handle);
  }, [live, now, onTick, wakeAt]);

  const seconds = paused ? frozen : Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className="font-mono text-sm tabular-nums text-app-text-muted"
      role="timer"
      aria-label={t('time-left', { defaultValue: 'Seconds left' })}
    >
      {t('seconds-short', { defaultValue: '{{count}}s', count: seconds })}
    </span>
  );
}

export default function HumanKeyboardGame({ playerId, playerName: _playerName }: HumanKeyboardGameProps) {
  void _playerName; // Part of MinigameProps; not used here
  const { t } = useTranslation('human-keyboard');

  const [phase, setPhase] = useState<Phase>('WAITING');
  const [roundIndex, setRoundIndex] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [sentence, setSentence] = useState('');
  const [cursor, setCursor] = useState(0);
  const [myLetters, setMyLetters] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [spectatorDeal, setSpectatorDeal] = useState<Record<string, string[]>>({});
  const [dealKey, setDealKey] = useState(0);
  const [imIn, setImIn] = useState(false);
  const [warning, setWarning] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [result, setResult] = useState<HKResultPayload | null>(null);
  const [myScore, setMyScore] = useState(0);

  const areaRef = useRef<HTMLDivElement | null>(null);
  /** The sentence as the handlers see it (a word is announced from the cursor and the text). */
  const sentenceRef = useRef('');

  const myRole = useRMHboxStore((s) => s.lobby?.myRole);
  const lobbyPlayers = useRMHboxStore((s) => s.lobby?.players);
  const isSpectator = myRole === 'spectator';

  const nameOf = useCallback(
    (userId: string) => lobbyPlayers?.find((p) => p.userId === userId)?.userName ?? userId,
    [lobbyPlayers],
  );

  const setLiveScore = useCallback((score: number) => {
    setMyScore(score);
    useRMHboxStore.setState({ liveMinigameScore: score });
  }, []);

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      switch (data.type as string) {
        case 'HK_ROUND': {
          setPhase('REVEAL');
          setRoundIndex((data.roundIndex as number) ?? 0);
          setTotalRounds((data.totalRounds as number) ?? 0);
          sentenceRef.current = typeof data.sentence === 'string' ? data.sentence : '';
          setSentence(sentenceRef.current);
          setCursor(0);
          setResult(null);
          setWarning(false);
          setLocked(false);
          setAnnouncement('');
          playSound('swoosh');
          break;
        }
        case 'HK_DEAL': {
          if (Array.isArray(data.letters)) setMyLetters(data.letters as string[]);
          if (data.deal && typeof data.deal === 'object') setSpectatorDeal(data.deal as Record<string, string[]>);
          if (data.counts && typeof data.counts === 'object') setCounts(data.counts as Record<string, number>);
          setImIn(true);
          setWarning(false);
          setDealKey((k) => k + 1);
          if (data.reason === 'reshuffle') {
            const mine = Array.isArray(data.letters) ? (data.letters as string[]).length : 0;
            setAnnouncement(
              t('announce-reshuffle', {
                defaultValue_one: 'The keys were reshuffled. You hold {{count}} letter.',
                defaultValue: 'The keys were reshuffled. You hold {{count}} letters.',
                count: mine,
              }),
            );
          }
          break;
        }
        case 'HK_TYPING': {
          setPhase('TYPING');
          if (typeof data.duration === 'number') setDeadline(Date.now() + data.duration * 1000);
          // Typing starts: the game area takes focus so the keyboard works at once
          areaRef.current?.focus();
          break;
        }
        case 'HK_PRESS': {
          const next = data.cursor as number;
          if (typeof next !== 'number') break;
          setCursor(next);
          setLocked(false);
          // Each finished word is announced politely
          const word = completedWord(sentenceRef.current, next);
          if (word) setAnnouncement(t('announce-word', { defaultValue: 'Word done: {{word}}', word }));
          playTone(PRESS_TONE_HZ, 50);
          break;
        }
        case 'HK_LOCK': {
          setLocked(true);
          setLockedUntil(Date.now() + WRONG_LOCK_MS);
          break;
        }
        case 'HK_KEY_WRONG': {
          // Only the presser is sent this
          setAnnouncement(t('announce-wrong', { defaultValue: 'Wrong letter. The sentence is locked for a moment.' }));
          playSound('buzzer');
          break;
        }
        case 'HK_KEY_NOT_YOURS': {
          setAnnouncement(t('announce-not-yours', { defaultValue: 'Not yours' }));
          break;
        }
        case 'HK_RESHUFFLE_WARNING': {
          setWarning(true);
          setAnnouncement(t('announce-warning', { defaultValue: 'The keys are reshuffled in 3 seconds.' }));
          break;
        }
        case 'HK_RESULT': {
          setPhase('ROUND_RESULT');
          setResult(data as unknown as HKResultPayload);
          setLocked(false);
          setWarning(false);
          setCursor(((data.sentence as string | undefined) ?? '').length);
          playSound(data.completed === true ? 'scoreDing' : 'buzzer');
          break;
        }
        case 'HK_SCORE_UPDATE': {
          const scores = data.scores as Record<string, number> | undefined;
          if (scores && scores[playerId] != null) setLiveScore(scores[playerId]);
          break;
        }
        case 'TIMER_START': {
          const pl = data.payload as Record<string, unknown> | undefined;
          if (pl && typeof pl.timeRemaining === 'number') {
            setDeadline(Date.now() + pl.timeRemaining * 1000);
            setPaused(false);
          }
          break;
        }
        case 'TIMER_PAUSED': {
          const pl = data.payload as Record<string, unknown> | undefined;
          setPaused(true);
          if (pl && typeof pl.timeRemaining === 'number') setFrozen(Math.max(0, pl.timeRemaining));
          break;
        }
        case 'TIMER_RESUMED': {
          const pl = data.payload as Record<string, unknown> | undefined;
          setPaused(false);
          if (pl && typeof pl.timeRemaining === 'number') setDeadline(Date.now() + pl.timeRemaining * 1000);
          break;
        }
      }
    },
    [playerId, setLiveScore, t],
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
      sentenceRef.current = typeof snapshot.sentence === 'string' ? snapshot.sentence : '';
      setSentence(sentenceRef.current);
      setCursor((snapshot.cursor as number) ?? 0);
      setMyLetters(Array.isArray(snapshot.myLetters) ? (snapshot.myLetters as string[]) : []);
      setCounts((snapshot.counts as Record<string, number> | undefined) ?? {});
      setSpectatorDeal((snapshot.deal as Record<string, string[]> | null | undefined) ?? {});
      setDealKey((k) => k + 1);
      setImIn(snapshot.imIn === true);
      setWarning(false);
      setLocked(false);
      setPaused(snapshot.paused === true);
      if (typeof snapshot.timeRemaining === 'number') {
        setFrozen(snapshot.timeRemaining);
        setDeadline(Date.now() + snapshot.timeRemaining * 1000);
      }
      const rv = snapshot.result as HKResultPayload | null | undefined;
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

  // Clear the footer score when the minigame unmounts
  useEffect(() => {
    return () => {
      useRMHboxStore.setState({ liveMinigameScore: null });
    };
  }, []);

  /** On each tick (and at the lock's end) while typing: the short lock indicator ends by itself. */
  const handleTick = useCallback(
    (now: number) => {
      if (locked && now >= lockedUntil) setLocked(false);
    },
    [locked, lockedUntil],
  );

  const canPress = phase === 'TYPING' && imIn && !isSpectator && !paused && myLetters.length > 0;

  const press = useCallback(
    (letter: string) => {
      if (!canPress) return;
      emitGameInput('press', { key: letter });
    },
    [canPress],
  );

  // Letters act only while the game area has focus (never globally: no clash with the site shortcuts)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (!/^[a-z]$/i.test(event.key)) return;
    event.preventDefault();
    press(event.key.toLowerCase());
  };

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

  const watching = isSpectator || !imIn;
  let status: string;
  if (phase === 'REVEAL') {
    status = t('status-reveal', { defaultValue: 'Read the sentence. Find your letters.' });
  } else if (phase === 'TYPING') {
    status = locked
      ? t('status-locked', { defaultValue: 'Locked for a moment' })
      : warning
        ? t('status-warning', { defaultValue: 'The keys are about to be reshuffled' })
        : watching
          ? t('status-watching', { defaultValue: 'You are watching this round.' })
          : t('status-type', { defaultValue: 'Type the sentence together.' });
  } else {
    status = result?.completed
      ? t('status-done', { defaultValue: 'The table finished the sentence.' })
      : t('status-timeout', { defaultValue: 'Time ran out.' });
  }

  const rowIds = Object.keys(counts);

  return (
    <div
      ref={areaRef}
      tabIndex={0}
      role="group"
      aria-label={t('area-label', { defaultValue: 'Human Keyboard. Press the letters you hold.' })}
      onKeyDown={handleKeyDown}
      className="flex w-full flex-col gap-4"
      data-testid="hk-game"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-app-text-muted">
            {t('round-of', {
              defaultValue: 'Round {{current}} of {{total}}',
              current: roundIndex + 1,
              total: totalRounds,
            })}
          </p>
          <h2 className="text-lg font-semibold text-app-text">{status}</h2>
        </div>
        {phase === 'TYPING' && (
          <Countdown
            key={deadline}
            deadline={deadline}
            paused={paused}
            frozen={frozen}
            phase={phase}
            wakeAt={locked ? lockedUntil : 0}
            onTick={handleTick}
          />
        )}
      </div>

      <SentenceLine text={sentence} cursor={cursor} />

      {phase === 'ROUND_RESULT' ? (
        result ? (
          <RoundResult result={result} myPlayerId={playerId} />
        ) : (
          <p className="text-sm text-app-text-muted">{t('revealing', { defaultValue: 'Counting the points…' })}</p>
        )
      ) : (
        <>
          {!watching && <LetterPad letters={myLetters} enabled={canPress} onPress={press} dealKey={dealKey} />}
          {rowIds.length > 0 && (
            <ul
              className="border-t border-app-border"
              aria-label={t('holders-label', { defaultValue: 'Letters each player holds' })}
              data-testid="hk-holders"
            >
              {rowIds.map((id) => (
                <li
                  key={id}
                  className={`flex items-center justify-between gap-3 border-b border-app-border py-1.5 text-sm ${
                    id === playerId ? 'font-semibold text-app-text' : 'text-app-text-muted'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    <bdi>{nameOf(id)}</bdi>
                  </span>
                  <span className="font-mono text-xs uppercase tabular-nums">
                    {isSpectator && spectatorDeal[id]
                      ? spectatorDeal[id].join(' ')
                      : t('holds-count', {
                          defaultValue_one: '{{count}} letter',
                          defaultValue: '{{count}} letters',
                          count: counts[id] ?? 0,
                        })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="min-h-5 text-sm text-app-text-muted" role="status" aria-live="polite" data-testid="hk-announcer">
        {announcement}
      </p>
      <p className="text-sm text-app-text-muted">
        {t('your-score', { defaultValue: 'Score {{score}}', score: myScore })}
      </p>
    </div>
  );
}

/** A finished round: the time, the team multiplier and how every player did. */
function RoundResult({ result, myPlayerId }: { result: HKResultPayload; myPlayerId: string }) {
  const { t } = useTranslation('human-keyboard');
  return (
    <div className="flex w-full flex-col gap-3" data-testid="hk-result">
      <p className="text-sm text-app-text-muted">
        {result.completed
          ? t('result-time', {
              defaultValue: 'Finished in {{seconds}} s. Team multiplier {{multiplier}}.',
              seconds: (result.elapsedMs / 1000).toFixed(1),
              multiplier: result.multiplier,
            })
          : t('result-incomplete', {
              defaultValue: 'Not finished. Team multiplier {{multiplier}}.',
              multiplier: result.multiplier,
            })}
      </p>
      <ul className="border-t border-app-border" aria-label={t('result-players', { defaultValue: 'Player results' })}>
        {result.results.map((r) => (
          <li
            key={r.userId}
            className={`flex items-center justify-between gap-3 border-b border-app-border py-2 text-sm ${
              r.userId === myPlayerId ? 'font-semibold text-app-text' : 'text-app-text'
            }`}
          >
            <span className="min-w-0 flex-1 truncate" dir="auto">
              <bdi>{r.userName}</bdi>
              {r.mvp ? ` · ${t('result-mvp', { defaultValue: 'Most presses' })}` : ''}
            </span>
            <span className="font-mono text-xs tabular-nums text-app-text-muted">
              {t('result-presses', {
                defaultValue: '{{correct}} correct, {{wrong}} wrong',
                correct: r.correct,
                wrong: r.wrong,
              })}
            </span>
            <span className="w-16 text-end font-mono tabular-nums">+{r.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
