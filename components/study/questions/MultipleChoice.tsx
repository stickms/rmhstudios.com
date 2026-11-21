import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { MultipleChoiceQuestion } from '@/lib/study/practice-test';
import { Verdict } from '@/components/study/questions/Verdict';

/** Four options as native radio buttons inside a fieldset whose legend is the prompt. */
export function MultipleChoice({
  question,
  choice,
  onChoose,
  locked,
}: {
  question: MultipleChoiceQuestion;
  choice: number | undefined;
  onChoose: (index: number) => void;
  locked: boolean;
}) {
  const { t } = useTranslation('study-tests');
  const name = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="t-prose whitespace-pre-wrap text-site-text" dir="auto">
        {question.prompt}
      </legend>
      <div className="border-t border-site-border">
        {question.options.map((option, i) => {
          const isAnswer = i === question.answerIndex;
          const isChosen = choice === i;
          return (
            <label
              key={i}
              className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-site-border py-2"
            >
              <input
                type="radio"
                name={name}
                checked={isChosen}
                disabled={locked}
                onChange={() => onChoose(i)}
                className="mt-1 size-4 accent-site-accent"
              />
              <span className="t-body min-w-0 flex-1 whitespace-pre-wrap" dir="auto">
                {option}
              </span>
              {locked && isAnswer && (
                <Verdict right>{t('correct-answer', { defaultValue: 'Correct answer' })}</Verdict>
              )}
              {locked && isChosen && !isAnswer && (
                <Verdict right={false}>{t('your-answer', { defaultValue: 'Your answer' })}</Verdict>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
