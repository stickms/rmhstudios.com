import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatDuration, type TestQuestion, type TestResponse, type TestScore } from '@/lib/study/practice-test';
import { gradeWritten } from '@/lib/study/practice-test';

export type SaveState = 'saving' | 'saved' | 'failed' | 'signed-out' | 'nothing';

/** The results screen: score, time, every answered question with both answers, and the next moves. */
export function PracticeTestResults({
  deckId,
  questions,
  answers,
  score,
  durationMs,
  saveState,
  locale,
  onRetake,
  onNewTest,
  onTestMissed,
}: {
  deckId: string;
  questions: TestQuestion[];
  answers: (TestResponse | undefined)[];
  score: TestScore;
  durationMs: number;
  saveState: SaveState;
  locale: string;
  onRetake: () => void;
  onNewTest: () => void;
  onTestMissed: () => void;
}) {
  const { t, i18n } = useTranslation('study-tests');
  const percent = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }),
    [i18n.language],
  );
  const fraction = score.total > 0 ? score.correct / score.total : 0;
  const saveText: Record<SaveState, string> = {
    saving: t('save-saving', { defaultValue: 'Saving result' }),
    saved: t('save-saved', { defaultValue: 'Result saved to your deck page' }),
    failed: t('save-failed', { defaultValue: 'Could not save this result' }),
    'signed-out': t('save-signed-out', { defaultValue: 'Sign in to save results. This result is not saved.' }),
    nothing: '',
  };
  const yes = t('answer-true', { defaultValue: 'True' });
  const no = t('answer-false', { defaultValue: 'False' });

  return (
    <div className="space-y-6">
      <section aria-labelledby="test-score" className="space-y-1">
        <h2 id="test-score" className="t-title">
          {score.answered === 0
            ? t('no-answers', { defaultValue: 'No questions answered' })
            : t('score', {
                defaultValue: '{{correct}} of {{total}} · {{percent}}',
                correct: score.correct,
                total: score.total,
                percent: percent.format(fraction),
              })}
        </h2>
        <p className="t-meta">
          {t('time-taken', { defaultValue: 'Time {{time}}', time: formatDuration(durationMs) })}
          {score.answered < questions.length &&
            ` · ${t('ended-early', {
              defaultValue: 'Ended after {{answered}} of {{total}} questions',
              answered: score.answered,
              total: questions.length,
            })}`}
        </p>
        {saveText[saveState] && (
          <p className="t-meta" role="status">
            {saveText[saveState]}{' '}
            {saveState === 'signed-out' && (
              <Link to="/login" className="underline">
                {t('sign-in', { defaultValue: 'Sign in' })}
              </Link>
            )}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" onClick={onRetake}>
          {t('retake', { defaultValue: 'Retake this test' })}
        </Button>
        <Button type="button" variant="default" onClick={onNewTest}>
          {t('new-test', { defaultValue: 'New test' })}
        </Button>
        <Button type="button" variant="default" disabled={score.missedCardIds.length === 0} onClick={onTestMissed}>
          {t('test-missed', { defaultValue: 'Test me on the missed cards' })}
        </Button>
        <Link to="/study/$deckId" params={{ deckId }}>
          <Button type="button" variant="ghost">
            {t('back-to-deck', { defaultValue: 'Back to deck' })}
          </Button>
        </Link>
      </div>

      <ol className="border-t border-site-border" aria-label={t('review-label', { defaultValue: 'Your answers' })}>
        {questions.map((q, i) => {
          const s = score.perQuestion[i];
          const response = answers[i];
          if (!s || !response) return null;
          const right = s.points === s.max;
          const Icon = right ? Check : X;
          return (
            <li key={i} className="space-y-1 border-b border-site-border py-3">
              <p className={`t-label flex items-center gap-2 ${right ? 'text-site-success' : 'text-site-danger'}`}>
                <Icon className="size-4" aria-hidden />
                {right
                  ? t('row-correct', { defaultValue: 'Correct' })
                  : q.kind === 'matching'
                    ? t('row-pairs', { defaultValue: '{{points}} of {{max}} pairs', points: s.points, max: s.max })
                    : t('row-wrong', { defaultValue: 'Wrong' })}
              </p>
              {q.kind === 'multiple-choice' && response.kind === 'multiple-choice' && (
                <Answer
                  prompt={q.prompt}
                  given={q.options[response.choice] ?? ''}
                  expected={right ? null : (q.options[q.answerIndex] ?? '')}
                />
              )}
              {q.kind === 'written' && response.kind === 'written' && (
                <Answer
                  prompt={q.prompt}
                  given={response.text}
                  expected={right ? null : q.answer}
                  note={
                    right && gradeWritten(q.answer, response.text, locale) === 'almost'
                      ? t('row-accepted', {
                          defaultValue: 'Counted as correct. The card says: {{answer}}',
                          answer: q.answer,
                        })
                      : undefined
                  }
                />
              )}
              {q.kind === 'true-false' && response.kind === 'true-false' && (
                <Answer
                  prompt={`${q.prompt} — ${q.shown}`}
                  given={response.answer ? yes : no}
                  expected={right ? null : q.isTrue ? yes : no}
                />
              )}
              {q.kind === 'matching' && response.kind === 'matching' && (
                <ul className="space-y-1">
                  {q.terms.map((term) => {
                    const picked = q.definitions.find((d) => d.cardId === response.pairs[term.cardId]);
                    const own = q.definitions.find((d) => d.cardId === term.cardId);
                    const missed = s.missedCardIds.includes(term.cardId);
                    return (
                      <li key={term.cardId} dir="auto">
                        <Answer
                          prompt={term.text}
                          given={picked?.text ?? t('unmatched', { defaultValue: 'Not matched' })}
                          expected={missed ? (own?.text ?? '') : null}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Answer({
  prompt,
  given,
  expected,
  note,
}: {
  prompt: string;
  given: string;
  expected: string | null;
  note?: string | undefined;
}) {
  const { t } = useTranslation('study-tests');
  return (
    <div className="space-y-0.5" dir="auto">
      <p className="t-body whitespace-pre-wrap text-site-text">{prompt}</p>
      <p className="t-body whitespace-pre-wrap text-site-text-muted">
        {t('you-answered', { defaultValue: 'You answered: {{answer}}', answer: given })}
      </p>
      {expected !== null && (
        <p className="t-body whitespace-pre-wrap text-site-text">
          {t('correct-was', { defaultValue: 'Correct answer: {{answer}}', answer: expected })}
        </p>
      )}
      {note && <p className="t-meta">{note}</p>}
    </div>
  );
}
