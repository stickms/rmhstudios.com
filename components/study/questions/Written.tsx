import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { gradeWritten, type WrittenQuestion } from '@/lib/study/practice-test';
import { Verdict } from '@/components/study/questions/Verdict';

/** A typed answer, graded forgivingly; a one-edit slip is "almost" and the student may accept it. */
export function Written({
  question,
  text,
  accepted,
  onText,
  onAccept,
  locked,
  locale,
}: {
  question: WrittenQuestion;
  text: string;
  accepted: boolean;
  onText: (text: string) => void;
  onAccept: () => void;
  locked: boolean;
  locale: string;
}) {
  const { t } = useTranslation('study-tests');
  const id = useId();
  const grade = locked ? gradeWritten(question.answer, text, locale) : null;
  return (
    <fieldset className="space-y-3">
      <legend className="t-prose whitespace-pre-wrap text-site-text" dir="auto">
        {question.prompt}
      </legend>
      <label htmlFor={id} className="t-label block">
        {t('written-label', { defaultValue: 'Your answer' })}
      </label>
      <Input
        id={id}
        value={text}
        readOnly={locked}
        onChange={(e) => onText(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        dir="auto"
        maxLength={500}
      />
      {grade === 'correct' && <Verdict right>{t('written-correct', { defaultValue: 'Correct' })}</Verdict>}
      {grade === 'almost' && (
        <div className="space-y-2">
          <Verdict right={accepted}>
            {accepted
              ? t('written-accepted', { defaultValue: 'Counted as correct. The card says: {{answer}}', answer: question.answer })
              : t('written-almost', { defaultValue: 'Almost. The card says: {{answer}}', answer: question.answer })}
          </Verdict>
          {!accepted && (
            <Button type="button" variant="default" size="sm" onClick={onAccept}>
              {t('written-accept', { defaultValue: 'Count as correct' })}
            </Button>
          )}
        </div>
      )}
      {grade === 'wrong' && (
        <Verdict right={false}>
          {t('written-wrong', { defaultValue: 'Not quite. The card says: {{answer}}', answer: question.answer })}
        </Verdict>
      )}
    </fieldset>
  );
}
