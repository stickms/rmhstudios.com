/**
 * The quiz every member of a study room sees while the host runs one (s11-15): the question with four answer buttons,
 * the reveal (the right answer and how many chose each option) and the standings. The answer is never in the question;
 * it arrives with the reveal. Time left is announced to a screen reader at 10 and 5 seconds, not every second, and the
 * reveal is announced politely. Card text, deck titles and member names are member-written: they carry `dir="auto"` or
 * sit in `<bdi>`.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, X } from 'lucide-react';
import { TIME_ANNOUNCE_AT, type Standing } from '@/lib/rmhstudy/quiz';
import type { RoomQuizClientState } from '@/lib/rmhstudy/types';

interface Props {
  quiz: RoomQuizClientState;
  myUserId: string;
  isHost: boolean;
  onAnswer: (choice: number) => void;
  onStop: () => void;
  onClose: () => void;
}

const button =
  'flex items-center gap-2 px-4 py-2 rounded-app-sm font-medium transition-colors bg-app-surface-hover text-app-text hover:bg-app-surface-active';

function Standings({ rows, myUserId, label }: { rows: Standing[]; myUserId: string; label: string }) {
  const { t } = useTranslation('room-quiz');
  return (
    <ol aria-label={label} className="divide-y divide-app-border">
      {rows.map((row) => (
        <li key={row.userId} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-6 shrink-0 text-app-text-muted font-mono">{row.place}</span>
          <span className="flex-1 truncate">
            <bdi>{row.userName}</bdi>
            {row.userId === myUserId && (
              <span className="text-app-text-muted"> {t('you', { defaultValue: '(you)' })}</span>
            )}
          </span>
          <span className="font-mono">{row.score}</span>
        </li>
      ))}
    </ol>
  );
}

export default function RoomQuizPanel({ quiz, myUserId, isHost, onAnswer, onStop, onClose }: Props) {
  const { t } = useTranslation('room-quiz');
  const question = quiz.question;
  const deadline = question?.deadline ?? 0;
  const open = quiz.phase === 'question';

  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const [announcement, setAnnouncement] = useState('');

  // One tick a second while a question is open. It only updates the visible count; the screen reader hears 10 and 5.
  useEffect(() => {
    if (!open) return;
    setAnnouncement('');
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if ((TIME_ANNOUNCE_AT as readonly number[]).includes(left)) {
        setAnnouncement(
          t('seconds-left', {
            count: left,
            defaultValue_one: '{{count}} second left',
            defaultValue_other: '{{count}} seconds left',
          }),
        );
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open, deadline, t]);

  const reveal = quiz.phase === 'reveal' ? quiz.reveal : null;
  const myResult = reveal
    ? quiz.myChoice === null
      ? 'unanswered'
      : reveal.correctUserIds.includes(myUserId)
        ? 'right'
        : 'wrong'
    : null;
  const revealText =
    reveal && question
      ? [
          myResult === 'right'
            ? t('you-right', { defaultValue: 'You got it right.' })
            : myResult === 'wrong'
              ? t('you-wrong', { defaultValue: 'Not this time.' })
              : t('you-skipped', { defaultValue: 'You did not answer.' }),
          t('right-answer', {
            answer: question.options[reveal.answerIndex] ?? '',
            defaultValue: 'The answer is {{answer}}.',
          }),
        ].join(' ')
      : '';

  return (
    <section aria-label={t('panel', { defaultValue: 'Room quiz' })} className="rounded-app app-glass p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold" dir="auto">
          {quiz.phase === 'ended'
            ? t('final-standings', { defaultValue: 'Final standings' })
            : t('heading', { deck: question?.deckTitle ?? '', defaultValue: 'Quiz: {{deck}}' })}
        </h3>
        {quiz.phase === 'ended' ? (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-app-text-muted hover:text-app-text"
            aria-label={t('close', { defaultValue: 'Close the quiz' })}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          isHost && (
            <button type="button" onClick={onStop} className={button}>
              {t('stop', { defaultValue: 'Stop quiz' })}
            </button>
          )
        )}
      </div>

      {quiz.phase !== 'ended' && question && (
        <>
          <div className="flex items-center justify-between text-xs text-app-text-muted">
            <span>
              {t('progress', {
                current: question.index + 1,
                total: question.total,
                defaultValue: 'Question {{current}} of {{total}}',
              })}
            </span>
            {open && (
              <span className="font-mono" aria-hidden="true">
                {secondsLeft}
              </span>
            )}
          </div>
          <p className="text-base font-medium" dir="auto">
            {question.prompt}
          </p>
          <ul className="space-y-2">
            {question.options.map((option, i) => {
              const chosen = quiz.myChoice === i;
              const isAnswer = reveal?.answerIndex === i;
              const state = reveal
                ? isAnswer
                  ? 'border-app-success'
                  : chosen
                    ? 'border-app-danger'
                    : 'border-app-border'
                : chosen
                  ? 'border-app-accent'
                  : 'border-app-border';
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!open || quiz.myChoice !== null || !quiz.canAnswer}
                    aria-pressed={chosen}
                    onClick={() => onAnswer(i)}
                    className={`flex w-full items-center justify-between gap-3 rounded-app-sm border px-3 py-2 text-left text-sm text-app-text transition-colors hover:bg-app-surface-hover disabled:hover:bg-transparent ${state}`}
                  >
                    <span dir="auto">{option}</span>
                    {reveal && (
                      <span className="shrink-0 font-mono text-xs text-app-text-muted">
                        {t('chose', {
                          count: reveal.counts[i] ?? 0,
                          defaultValue_one: '{{count}} chose this',
                          defaultValue_other: '{{count}} chose this',
                        })}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {open && quiz.myChoice !== null && (
            <p className="text-sm text-app-text-muted">
              {t('answered', { defaultValue: 'Answer in. Waiting for the others.' })}
            </p>
          )}
          {open && !quiz.canAnswer && (
            <p className="text-sm text-app-text-muted">
              {t('watching', { defaultValue: 'You joined during this question. You can answer the next one.' })}
            </p>
          )}
          {reveal && <p className="text-sm font-medium">{revealText}</p>}
          {quiz.standings.length > 0 && (
            <Standings
              rows={quiz.standings}
              myUserId={myUserId}
              label={t('standings', { defaultValue: 'Standings' })}
            />
          )}
        </>
      )}

      {quiz.phase === 'ended' && (
        <>
          {quiz.standings.length === 0 ? (
            <p className="text-sm text-app-text-muted">{t('nobody', { defaultValue: 'Nobody answered.' })}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-app-text-muted">
                <Trophy className="h-4 w-4" aria-hidden="true" />
                {t('out-of', { total: quiz.end?.total ?? 0, defaultValue: 'Out of {{total}} questions' })}
              </p>
              <Standings
                rows={quiz.standings}
                myUserId={myUserId}
                label={t('standings', { defaultValue: 'Standings' })}
              />
            </>
          )}
        </>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {open ? announcement : revealText}
      </div>
    </section>
  );
}
