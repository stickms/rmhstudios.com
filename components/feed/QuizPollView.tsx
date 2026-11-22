import { useTranslation } from 'react-i18next';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { quizCorrectShare, quizVerdict } from '@/lib/feed/quiz-poll';
import type { FeedPoll } from '@/lib/feed-types';

/**
 * A quiz poll (sprint 07 #19). Before an answer: the options and a "Quiz" marker, with no hint of which is right.
 * After the viewer answers, or once the quiz has ended, or for its author: every option as a row on a rule, the right
 * one marked "Correct" and the viewer's own wrong choice "Your answer" in words (colour tints the word, never a fill),
 * the explanation below, and for the author the share who answered correctly.
 */
export function QuizPollView({
  poll,
  closed,
  voting,
  signedIn,
  onAnswer,
}: {
  poll: FeedPoll;
  closed: boolean;
  voting: boolean;
  signedIn: boolean;
  onAnswer: (optionId: string) => void;
}) {
  const { t, i18n } = useTranslation('quiz-polls');
  const answered = (poll.myVotes?.length ?? 0) > 0;
  const revealed = poll.correctOptionId !== undefined;
  // The answer is known without voting or an end only to the author.
  const isAuthor = revealed && !answered && !closed;
  const showResults = answered || closed || isAuthor;
  const verdict = revealed ? quizVerdict(poll.myVotes, poll.correctOptionId as string) : null;
  const share = isAuthor && revealed ? quizCorrectShare(poll.options, poll.correctOptionId as string) : null;
  const correctText = poll.options.find((o) => o.id === poll.correctOptionId)?.text ?? '';

  return (
    <div className="mt-3">
      <p className="t-label">{t('quiz-marker', { defaultValue: 'Quiz' })}</p>
      <p className="t-heading mb-2">{poll.question}</p>

      {showResults ? (
        <ul className="border-t border-site-border">
          {poll.options.map((option) => {
            const isCorrect = revealed && option.id === poll.correctOptionId;
            const isMine = !!poll.myVotes?.includes(option.id);
            const pct = poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;
            return (
              <li key={option.id} className="flex items-center justify-between gap-3 border-b border-site-border py-2">
                <span className="t-body flex flex-wrap items-baseline gap-x-2">
                  <span className={isCorrect ? 'font-semibold' : undefined}>{option.text}</span>
                  {isCorrect && (
                    <span className="t-label text-site-success">{t('quiz-correct', { defaultValue: 'Correct' })}</span>
                  )}
                  {isMine && !isCorrect && (
                    <span className="t-label text-site-danger">
                      {t('quiz-your-answer', { defaultValue: 'Your answer' })}
                    </span>
                  )}
                </span>
                <span className="t-meta shrink-0">{pct}%</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-t border-site-border">
          {poll.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onAnswer(option.id)}
              disabled={!signedIn || voting}
              className="t-body flex min-h-11 w-full items-center border-b border-site-border py-2 text-left transition-colors hover:bg-site-bg-subtle disabled:opacity-60"
            >
              {option.text}
            </button>
          ))}
          <p className="t-meta mt-2">
            {signedIn
              ? t('quiz-final-note', { defaultValue: 'One answer, and it is final.' })
              : t('quiz-sign-in', { defaultValue: 'Sign in to answer.' })}
          </p>
        </div>
      )}

      {/* Right or wrong is announced politely once the viewer has answered. */}
      <div role="status" aria-live="polite">
        {verdict === 'correct' && (
          <p className="t-body mt-2 font-semibold">{t('quiz-result-correct', { defaultValue: 'Correct.' })}</p>
        )}
        {verdict === 'wrong' && (
          <p className="t-body mt-2 font-semibold">
            {t('quiz-result-wrong', {
              answer: correctText,
              defaultValue: 'Not quite. The answer is {{answer}}.',
            })}
          </p>
        )}
      </div>

      {showResults && poll.explanation && <p className="t-body mt-2">{poll.explanation}</p>}

      {share !== null && (
        <p className="t-meta mt-2">
          {t('quiz-share-correct', { percent: share, defaultValue: '{{percent}}% answered correctly' })}
        </p>
      )}

      <p className="t-meta mt-2">
        {t('quiz-vote-count', {
          count: poll.totalVotes,
          defaultValue_one: '{{count}} vote',
          defaultValue_other: '{{count}} votes',
          defaultValue: '{{count}} votes',
        })}
        {poll.closesAt && (
          <>
            {' '}
            ·{' '}
            <RelativeTime
              date={poll.closesAt}
              format={(at, now) =>
                closed
                  ? t('quiz-ended-relative', {
                      when: formatRelativeTime(at, i18n.language, now),
                      defaultValue: 'Ended {{when}}',
                    })
                  : t('quiz-ends-relative', {
                      when: formatRelativeTime(at, i18n.language, now),
                      defaultValue: 'Ends {{when}}',
                    })
              }
              fallback={() =>
                closed ? t('quiz-ended', { defaultValue: 'Ended' }) : t('quiz-open', { defaultValue: 'Open' })
              }
            />
          </>
        )}
      </p>
    </div>
  );
}
