import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { suggestionsFor } from './suggestions';

export const QUESTION_MAX = 400;
export const QUESTION_MIN = 3;

/**
 * The question field, its counter and the one ink button (R4). Suggestions fill the field and never submit. While a
 * question is in flight the button is busy and Cancel (a bordered-less ghost button) takes the request back. The
 * "questions left" counter sits in its own wrapping row so it never collides with the button at 320 px.
 */
export function AskForm({
  question,
  onQuestion,
  onSubmit,
  onCancel,
  pending,
  configured,
  remaining,
  cap,
  pinned,
  showSuggestions = true,
}: {
  question: string;
  onQuestion: (q: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  configured: boolean;
  /** `null` while the status query has not answered. */
  remaining: number | null;
  cap: number | null;
  pinned: boolean;
  /** False while a question is in flight or answered: the answer, not a list of starters, is what the page is about. */
  showSuggestions?: boolean;
}) {
  const { t } = useTranslation('medschools');
  const id = useId();
  const trimmed = question.trim();
  const used = remaining === 0;
  const canAsk = configured && !used && trimmed.length >= QUESTION_MIN && !pending;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canAsk) onSubmit();
      }}
    >
      <label htmlFor={id} className="t-label">
        {t('ask-field-label', { defaultValue: 'Your question' })}
      </label>
      <Textarea
        id={id}
        value={question}
        maxLength={QUESTION_MAX}
        rows={3}
        className="min-h-20"
        disabled={pending}
        onChange={(e) => onQuestion(e.target.value)}
        aria-describedby={`${id}-count`}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant="primary" loading={pending} disabled={!canAsk && !pending}>
          {t('ask-submit', { defaultValue: 'Ask' })}
        </Button>
        {pending ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('ask-cancel', { defaultValue: 'Cancel' })}
          </Button>
        ) : null}
        <p id={`${id}-count`} className="t-meta m-0 ms-auto">
          {t('ask-char-count', {
            defaultValue: '{{n}} of {{max}}',
            n: question.length,
            max: QUESTION_MAX,
          })}
        </p>
      </div>
      {remaining !== null && cap !== null ? (
        <p className="t-meta m-0" data-testid="ask-remaining">
          {t('ask-remaining', {
            defaultValue: '{{n}} of {{cap}} questions left today',
            n: remaining,
            cap,
          })}
        </p>
      ) : null}
      {!configured ? (
        <p className="t-meta m-0" role="status">
          {t('ask-unconfigured', { defaultValue: 'Questions are not available right now.' })}
        </p>
      ) : null}
      <p className="t-meta m-0">
        {t('ask-privacy', {
          defaultValue: 'Your question is sent to our AI provider to write the answer. RMH does not keep it.',
        })}
      </p>
      {showSuggestions ? (
        <div>
          <p className="t-label m-0 mt-2">{t('ask-suggest-heading', { defaultValue: 'Try one' })}</p>
          <ul className="m-0 mt-1 list-none border-t border-site-border p-0">
            {suggestionsFor(pinned).map((s) => {
              const text = t(s.key, { defaultValue: s.defaultValue });
              return (
                <li key={s.key} className="border-b border-site-border">
                  <button
                    type="button"
                    className="t-body min-h-11 w-full py-2 text-start hover:bg-site-bg-subtle disabled:opacity-45"
                    disabled={pending}
                    onClick={() => onQuestion(text)}
                  >
                    {text}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
