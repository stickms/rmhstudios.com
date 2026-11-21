import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrueFalseQuestion } from '@/lib/study/practice-test';
import { Verdict } from '@/components/study/questions/Verdict';

/** A prompt and a proposed answer; the student says whether the pair is right. */
export function TrueFalse({
  question,
  answer,
  onAnswer,
  locked,
}: {
  question: TrueFalseQuestion;
  answer: boolean | undefined;
  onAnswer: (value: boolean) => void;
  locked: boolean;
}) {
  const { t } = useTranslation('study-tests');
  const name = useId();
  const options: { value: boolean; label: string }[] = [
    { value: true, label: t('true', { defaultValue: 'True' }) },
    { value: false, label: t('false', { defaultValue: 'False' }) },
  ];
  return (
    <fieldset className="space-y-3">
      <legend className="t-label">{t('true-false-legend', { defaultValue: 'Is this answer right for this card?' })}</legend>
      <div className="space-y-1 border-y border-site-border py-3">
        <p className="t-prose whitespace-pre-wrap text-site-text" dir="auto">
          {question.prompt}
        </p>
        <p className="t-body whitespace-pre-wrap text-site-text-muted" dir="auto">
          {question.shown}
        </p>
      </div>
      <div className="flex gap-6">
        {options.map((o) => (
          <label key={String(o.value)} className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={name}
              checked={answer === o.value}
              disabled={locked}
              onChange={() => onAnswer(o.value)}
              className="size-4 accent-site-accent"
            />
            <span className="t-body">{o.label}</span>
          </label>
        ))}
      </div>
      {locked && (
        <Verdict right={answer === question.isTrue}>
          {question.isTrue
            ? t('tf-was-true', { defaultValue: 'That answer is right.' })
            : t('tf-was-false', { defaultValue: 'That answer is wrong. The right one is: {{answer}}', answer: question.answer })}
        </Verdict>
      )}
    </fieldset>
  );
}
