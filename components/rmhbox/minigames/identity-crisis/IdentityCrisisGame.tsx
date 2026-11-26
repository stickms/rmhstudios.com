/**
 * IdentityCrisisGame — phase router for the Identity Crisis minigame.
 *
 *   ASSIGN → study the board: everyone's identity but yours
 *   ASK    → the asker types a yes-or-no question about themselves
 *   VOTE   → everyone else votes yes / no / maybe, all at once
 *   RESULT → the three counts and the plurality ("Split" on a tie)
 *   FINAL  → one last guess for everyone not yet right
 *   REVEAL → every identity, yours included
 *
 * Server actions handled: IC_ASSIGN, IC_TURN_START, IC_TURN_START_SELF,
 * IC_ASK_TIMEOUT, IC_QUESTION, IC_VOTE_ACK, IC_VOTE_PROGRESS, IC_VOTE_RESULT,
 * IC_GUESS_RESULT, IC_PLAYER_GUESSED, IC_SCORE_UPDATE, IC_FINAL_START,
 * IC_REVEAL, TIMER_START, TIMER_TICK. Every GAME_STATE_SNAPSHOT (mount,
 * reconnect) re-hydrates the whole view.
 *
 * The client never holds its own identity before the reveal: the server does
 * not send it, so there is nothing to hide here. Questions are member text and
 * are shown with `dir="auto"`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emitGameInput, useGameSocket } from '@/lib/rmhbox/minigame-client';
import { playSound } from '@/lib/rmhbox/audio';
import { useArrival } from '@/components/ui/arrive';
import IdentityBoard from './IdentityBoard';
import AskPanel from './AskPanel';
import VotePanel from './VotePanel';
import GuessPanel from './GuessPanel';
import type {
  ICCounts,
  ICHistoryEntry,
  ICIdentity,
  ICOther,
  ICPhase,
  ICPlurality,
  ICQuestion,
  ICResult,
  ICRevealEntry,
  ICStatus,
  ICVote,
} from './ic-types';

/**
 * An identity can be a member's pack line, so where one is put inside a translated sentence it is wrapped in a first
 * strong isolate (U+2068 ... U+2069): the sentence keeps its order whatever direction the name is written in.
 */
const isolate = (text: string) => `\u2068${text}\u2069`;

const SNAPSHOT_PHASES: readonly string[] = ['ASSIGN', 'ASK', 'VOTE', 'RESULT', 'FINAL', 'REVEAL'];

interface IdentityCrisisGameProps {
  playerId: string;
  playerName: string;
}

export default function IdentityCrisisGame({ playerId, playerName }: IdentityCrisisGameProps) {
  const { t } = useTranslation('identity-crisis');

  const [phase, setPhase] = useState<ICPhase>('WAITING');
  const [others, setOthers] = useState<ICOther[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [turnNumber, setTurnNumber] = useState(0);
  const [totalSlots, setTotalSlots] = useState(0);
  const [askerId, setAskerId] = useState<string | null>(null);
  const [askerName, setAskerName] = useState('');
  const [askerIdentity, setAskerIdentity] = useState<ICIdentity | null>(null);
  const [question, setQuestionState] = useState<ICQuestion | null>(null);
  // The handlers read the question when its vote closes; a ref keeps that read out of a state updater
  const questionRef = useRef<ICQuestion | null>(null);
  const setQuestion = useCallback((q: ICQuestion | null) => {
    questionRef.current = q;
    setQuestionState(q);
  }, []);
  const [received, setReceived] = useState(0);
  const [totalVoters, setTotalVoters] = useState(0);
  const [myVote, setMyVote] = useState<ICVote | null>(null);
  const [result, setResult] = useState<ICResult | null>(null);
  const [history, setHistory] = useState<ICHistoryEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ICStatus>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [finalists, setFinalists] = useState<string[]>([]);
  const [myFinalGuessed, setMyFinalGuessed] = useState(false);
  const [feedback, setFeedback] = useState<'right' | 'wrong' | null>(null);
  const [reveal, setReveal] = useState<ICRevealEntry[] | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  const myRole = useRMHboxStore((s) => s.lobby?.myRole);
  const isSpectator = myRole === 'spectator';
  const myStatus: ICStatus | undefined = statuses[playerId];

  const setLiveScore = useCallback(
    (all: Record<string, number>) => {
      const mine = all[playerId];
      if (mine != null) useRMHboxStore.setState({ liveMinigameScore: mine });
    },
    [playerId],
  );

  const nameOf = useCallback(
    (userId: string): string =>
      userId === playerId ? playerName : (others.find((o) => o.userId === userId)?.userName ?? ''),
    [others, playerId, playerName],
  );

  const pluralityWord = useCallback(
    (p: ICPlurality): string =>
      p === 'yes'
        ? t('plurality-yes', { defaultValue: 'Yes' })
        : p === 'no'
          ? t('plurality-no', { defaultValue: 'No' })
          : p === 'maybe'
            ? t('plurality-maybe', { defaultValue: 'Maybe' })
            : t('plurality-split', { defaultValue: 'Split' }),
    [t],
  );

  const handleGameAction = useCallback(
    (data: Record<string, unknown>) => {
      switch (data.type as string) {
        case 'IC_ASSIGN': {
          setPhase('ASSIGN');
          setOthers(Array.isArray(data.others) ? (data.others as ICOther[]) : []);
          setOrder(Array.isArray(data.order) ? (data.order as string[]) : []);
          setTotalSlots((data.totalSlots as number) ?? 0);
          setHistory([]);
          setResult(null);
          setQuestion(null);
          playSound('swoosh');
          setAnnouncement(
            t('announce-assign', { defaultValue: 'Everyone sees who the others are. Your own card is hidden.' }),
          );
          break;
        }
        case 'IC_TURN_START':
        case 'IC_TURN_START_SELF': {
          const asker = data.askerId as string;
          const name = (data.askerName as string) ?? '';
          setPhase('ASK');
          setTurnNumber((data.turnNumber as number) ?? 0);
          setAskerId(asker);
          setAskerName(name);
          // Only IC_TURN_START carries the asker's identity; the asker's own turn never does
          setAskerIdentity(
            data.type === 'IC_TURN_START' ? ((data.askerIdentity as ICIdentity | undefined) ?? null) : null,
          );
          setQuestion(null);
          setResult(null);
          setReceived(0);
          setTotalVoters(0);
          setMyVote(null);
          setFeedback(null);
          setAnnouncement(
            asker === playerId
              ? t('announce-your-turn', { defaultValue: 'Your turn to ask a question.' })
              : t('announce-turn', { defaultValue: '{{name}} is asking.', name }),
          );
          break;
        }
        case 'IC_ASK_TIMEOUT': {
          setAnnouncement(t('announce-timeout', { defaultValue: 'The turn ran out with no question.' }));
          break;
        }
        case 'IC_QUESTION': {
          setPhase('VOTE');
          setQuestion({
            turnNumber: (data.turnNumber as number) ?? 0,
            askerId: (data.askerId as string) ?? '',
            text: (data.text as string) ?? '',
          });
          setTotalVoters((data.totalVoters as number) ?? 0);
          setReceived(0);
          setMyVote(null);
          setAnnouncement(t('announce-vote', { defaultValue: 'A question is up. Vote yes, no or maybe.' }));
          break;
        }
        case 'IC_VOTE_ACK': {
          setMyVote((data.vote as ICVote | undefined) ?? null);
          break;
        }
        case 'IC_VOTE_PROGRESS': {
          setReceived((data.received as number) ?? 0);
          setTotalVoters((data.total as number) ?? 0);
          break;
        }
        case 'IC_VOTE_RESULT': {
          const counts = data.counts as ICCounts;
          const plurality = data.plurality as ICPlurality;
          setPhase('RESULT');
          setResult({ counts, plurality });
          const q = questionRef.current;
          if (q) {
            setHistory((h) => [
              ...h.filter((e) => e.turnNumber !== q.turnNumber),
              {
                turnNumber: q.turnNumber,
                askerId: q.askerId,
                askerName: nameOf(q.askerId),
                text: q.text,
                counts,
                plurality,
              },
            ]);
          }
          setAnnouncement(
            t('announce-result', {
              defaultValue: 'Result: {{answer}}. Yes {{yes}}, no {{no}}, maybe {{maybe}}.',
              answer: pluralityWord(plurality),
              yes: counts.yes,
              no: counts.no,
              maybe: counts.maybe,
            }),
          );
          break;
        }
        case 'IC_GUESS_RESULT': {
          // Only the guesser is sent this
          const correct = data.correct === true;
          setFeedback(correct ? 'right' : 'wrong');
          if (data.kind === 'final') setMyFinalGuessed(true);
          if (data.kind === 'early') setStatuses((s) => ({ ...s, [playerId]: correct ? 'solved' : 'stopped' }));
          if (data.kind === 'final' && correct) setStatuses((s) => ({ ...s, [playerId]: 'solved' }));
          playSound(correct ? 'scoreDing' : 'buzzer');
          setAnnouncement(
            correct
              ? t('announce-guess-right', { defaultValue: 'Your guess is right.' })
              : t('announce-guess-wrong', { defaultValue: 'Your guess is wrong.' }),
          );
          break;
        }
        case 'IC_PLAYER_GUESSED': {
          const userId = data.userId as string;
          const status = data.status as ICStatus | undefined;
          if (status) setStatuses((s) => ({ ...s, [userId]: status }));
          if (data.kind === 'early') {
            const name = nameOf(userId);
            setAnnouncement(
              data.correct === true
                ? t('announce-other-right', { defaultValue: '{{name}} guessed right.', name })
                : t('announce-other-wrong', { defaultValue: '{{name}} guessed wrong.', name }),
            );
          }
          break;
        }
        case 'IC_SCORE_UPDATE': {
          const all = (data.scores as Record<string, number> | undefined) ?? {};
          setScores(all);
          setLiveScore(all);
          break;
        }
        case 'IC_FINAL_START': {
          setPhase('FINAL');
          setAskerId(null);
          setAskerIdentity(null);
          setFinalists(Array.isArray(data.finalists) ? (data.finalists as string[]) : []);
          setMyFinalGuessed(false);
          setFeedback(null);
          setAnnouncement(t('announce-final', { defaultValue: 'Final guess. Everyone not yet right has one guess.' }));
          break;
        }
        case 'IC_REVEAL': {
          setPhase('REVEAL');
          setAskerId(null);
          setReveal(Array.isArray(data.players) ? (data.players as ICRevealEntry[]) : null);
          const all = (data.scores as Record<string, number> | undefined) ?? {};
          setScores(all);
          setLiveScore(all);
          setAnnouncement(t('announce-reveal', { defaultValue: 'Every identity is revealed.' }));
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
    [nameOf, playerId, pluralityWord, setLiveScore, setQuestion, t],
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
      setPhase(p as ICPhase);
      setOthers(Array.isArray(snapshot.others) ? (snapshot.others as ICOther[]) : []);
      setOrder(Array.isArray(snapshot.order) ? (snapshot.order as string[]) : []);
      setTurnNumber((snapshot.turnNumber as number) ?? 0);
      setTotalSlots((snapshot.totalSlots as number) ?? 0);
      setAskerId((snapshot.askerId as string | null) ?? null);
      setAskerName((snapshot.askerName as string | null) ?? '');
      setAskerIdentity((snapshot.askerIdentity as ICIdentity | null) ?? null);
      setQuestion((snapshot.question as ICQuestion | null) ?? null);
      setReceived((snapshot.votesReceived as number) ?? 0);
      setTotalVoters((snapshot.totalVoters as number) ?? 0);
      setMyVote((snapshot.myVote as ICVote | null) ?? null);
      setResult((snapshot.result as ICResult | null) ?? null);
      setHistory(Array.isArray(snapshot.questionHistory) ? (snapshot.questionHistory as ICHistoryEntry[]) : []);
      setStatuses((snapshot.statuses as Record<string, ICStatus> | undefined) ?? {});
      setFinalists(Array.isArray(snapshot.finalists) ? (snapshot.finalists as string[]) : []);
      setMyFinalGuessed(snapshot.myFinalGuessed === true);
      setReveal(Array.isArray(snapshot.reveal) ? (snapshot.reveal as ICRevealEntry[]) : null);
      if (typeof snapshot.timeRemaining === 'number') setTimeRemaining(snapshot.timeRemaining);
      const all = (snapshot.scores as Record<string, number> | undefined) ?? {};
      setScores(all);
      setLiveScore(all);
    },
    [setLiveScore, setQuestion],
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

  const arrival = useArrival(result !== null || reveal !== null);

  const isAsker = askerId === playerId;
  const canGuessEarly = !isSpectator && myStatus === 'asking' && (phase === 'ASK' || (phase === 'VOTE' && !isAsker));
  const canGuessFinal = !isSpectator && phase === 'FINAL' && finalists.includes(playerId) && !myFinalGuessed;

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
        <p className="text-sm text-app-text-muted">{t('waiting-first', { defaultValue: 'Dealing identities…' })}</p>
      </div>
    );
  }

  let status: string;
  if (phase === 'ASSIGN') {
    status = isSpectator
      ? t('status-assign-spectator', { defaultValue: 'Everyone is being dealt an identity.' })
      : t('status-assign', { defaultValue: 'Study the board. You are the one marked with a question mark.' });
  } else if (phase === 'ASK') {
    status = isAsker
      ? t('status-ask-self', { defaultValue: 'Your turn: ask a yes-or-no question.' })
      : t('status-ask', { defaultValue: '{{name}} is asking a question.', name: askerName });
  } else if (phase === 'VOTE') {
    status = isAsker
      ? t('status-vote-self', { defaultValue: 'The table is voting on your question.' })
      : t('status-vote', { defaultValue: 'Vote on the question from {{name}}.', name: askerName });
  } else if (phase === 'RESULT') {
    status = t('status-result', { defaultValue: 'The table has voted.' });
  } else if (phase === 'FINAL') {
    status = t('status-final', { defaultValue: 'Final guess' });
  } else {
    status = t('status-reveal', { defaultValue: 'Who everyone was' });
  }

  return (
    <div className="flex w-full flex-col gap-4" data-testid="ic-game">
      <p className="sr-only" role="status" aria-live="polite" data-testid="ic-announcer">
        {announcement}
      </p>

      <div className="flex items-start justify-between gap-4">
        <div>
          {totalSlots > 0 && phase !== 'ASSIGN' && phase !== 'REVEAL' ? (
            <p className="text-xs text-app-text-muted">
              {phase === 'FINAL'
                ? t('turn-final', { defaultValue: 'After the questions' })
                : t('turn-of', { defaultValue: 'Turn {{current}}', current: turnNumber })}
            </p>
          ) : null}
          <h2 className="text-lg font-semibold text-app-text">{status}</h2>
        </div>
        {phase !== 'REVEAL' && (
          <span
            className="font-mono text-sm tabular-nums text-app-text-muted"
            role="timer"
            aria-label={t('time-left', { defaultValue: 'Seconds left' })}
          >
            {t('seconds-short', { defaultValue: '{{count}}s', count: Math.max(0, timeRemaining) })}
          </span>
        )}
      </div>

      {phase === 'REVEAL' && reveal ? (
        <div className={arrival} data-testid="ic-reveal">
          <ul className="border-t border-app-border" aria-label={t('reveal-label', { defaultValue: 'Every identity' })}>
            {reveal.map((r) => (
              <li
                key={r.userId}
                className={`flex items-center justify-between gap-3 border-b border-app-border py-2 text-sm ${
                  r.userId === playerId ? 'font-semibold text-app-text' : 'text-app-text'
                }`}
              >
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  <bdi>{r.userName}</bdi>
                </span>
                <span className="min-w-0 flex-1 truncate text-end" dir="auto">
                  <bdi>{r.identity.name}</bdi>
                </span>
                <span className="w-32 text-end text-xs text-app-text-muted">
                  {r.outcome === 'early'
                    ? t('outcome-early', { defaultValue: 'Guessed early' })
                    : r.outcome === 'final'
                      ? t('outcome-final', { defaultValue: 'Guessed at the end' })
                      : t('outcome-missed', { defaultValue: 'Not guessed' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <IdentityBoard
          myId={isSpectator ? null : playerId}
          myName={playerName}
          others={others}
          order={order}
          statuses={statuses}
          scores={scores}
          askerId={phase === 'ASK' || phase === 'VOTE' ? askerId : null}
        />
      )}

      {phase === 'ASK' && (
        <>
          {isAsker && !isSpectator ? (
            <AskPanel key={turnNumber} onAsk={(text) => emitGameInput('ask', { text })} />
          ) : (
            <p className="text-sm text-app-text-muted" data-testid="ic-ask-wait">
              {askerIdentity
                ? t('ask-wait-identity', {
                    defaultValue: '{{name}} is {{identity}}. Wait for their question.',
                    name: askerName,
                    identity: isolate(askerIdentity.name),
                  })
                : t('ask-wait', { defaultValue: 'Waiting for the question.' })}
            </p>
          )}
        </>
      )}

      {(phase === 'VOTE' || phase === 'RESULT') && question && (
        <div className="flex flex-col gap-1 border-t border-app-border pt-3" data-testid="ic-question">
          <p className="text-xs text-app-text-muted">
            {t('question-from', {
              defaultValue: 'Question from {{name}}',
              name: nameOf(question.askerId) || askerName,
            })}
            {askerIdentity && !isAsker
              ? ` · ${t('question-as', { defaultValue: 'who is {{identity}}', identity: isolate(askerIdentity.name) })}`
              : ''}
          </p>
          <p className="text-base font-semibold text-app-text" dir="auto">
            {question.text}
          </p>
        </div>
      )}

      {phase === 'VOTE' && !isSpectator && (
        <VotePanel
          key={question?.turnNumber ?? 0}
          myVote={myVote}
          canVote={!isAsker}
          received={received}
          total={totalVoters}
          onVote={(vote) => emitGameInput('vote', { vote })}
        />
      )}

      {phase === 'VOTE' && isSpectator && (
        <p className="text-xs text-app-text-muted">
          {t('vote-progress-spectator', {
            defaultValue: '{{received}} of {{total}} voted',
            received,
            total: totalVoters,
          })}
        </p>
      )}

      {phase === 'RESULT' && result && (
        <div className={`flex flex-col gap-1 ${arrival ?? ''}`} data-testid="ic-result">
          <p className="text-base font-semibold text-app-text">
            {t('result-answer', {
              defaultValue: 'The table says: {{answer}}',
              answer: pluralityWord(result.plurality),
            })}
          </p>
          <p className="font-mono text-sm tabular-nums text-app-text-muted">
            {t('result-counts', {
              defaultValue: 'Yes {{yes}} · No {{no}} · Maybe {{maybe}}',
              yes: result.counts.yes,
              no: result.counts.no,
              maybe: result.counts.maybe,
            })}
          </p>
        </div>
      )}

      {phase === 'FINAL' && (
        <>
          {canGuessFinal ? (
            <GuessPanel
              kind="final"
              disabled={false}
              feedback={feedback}
              onGuess={(text) => emitGameInput('guess', { text })}
            />
          ) : (
            <p className="text-sm text-app-text-muted">
              {myStatus === 'solved'
                ? t('final-solved', { defaultValue: 'You already got it. Waiting for the others.' })
                : isSpectator
                  ? t('final-watching', { defaultValue: 'The table is making its final guesses.' })
                  : t('final-sent', { defaultValue: 'Guess sent. Waiting for the others.' })}
            </p>
          )}
        </>
      )}

      {canGuessEarly && (
        <GuessPanel
          kind="early"
          disabled={false}
          feedback={feedback}
          onGuess={(text) => emitGameInput('guess', { text })}
        />
      )}

      {myStatus === 'stopped' && phase !== 'FINAL' && phase !== 'REVEAL' && !isSpectator && (
        <p className="text-xs text-app-text-muted">
          {t('stopped-note', { defaultValue: 'You are out of questions. You still vote, and you have a final guess.' })}
        </p>
      )}
      {myStatus === 'solved' && phase !== 'REVEAL' && !isSpectator && (
        <p className="text-xs text-app-text-muted">
          {t('solved-note', { defaultValue: 'You got it. You still vote on the others.' })}
        </p>
      )}

      {history.length > 0 && phase !== 'REVEAL' && (
        <section aria-label={t('history-label', { defaultValue: 'Questions so far' })}>
          <h3 className="mb-1 text-sm font-semibold text-app-text">
            {t('history-title', { defaultValue: 'Questions so far' })}
          </h3>
          <ul className="border-t border-app-border">
            {history.map((entry) => (
              <li
                key={entry.turnNumber}
                className="flex items-start justify-between gap-3 border-b border-app-border py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 text-app-text" dir="auto">
                  <bdi>{entry.askerName}</bdi>
                  {': '}
                  {entry.text}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-app-text-muted">
                  {entry.plurality ? pluralityWord(entry.plurality) : ''}
                  {entry.counts ? ` ${entry.counts.yes}-${entry.counts.no}-${entry.counts.maybe}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
