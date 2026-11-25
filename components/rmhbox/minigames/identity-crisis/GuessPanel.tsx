/**
 * GuessPanel — guess who you are.
 *
 * Early (during the questions): right earns a bonus that shrinks with every
 * question used, wrong costs 100 points and ends your questions. Final (the last
 * 30 seconds): one guess, right is 200. The text goes to the server only; the
 * answer comes back as right or wrong and nobody else sees what was typed.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_LENGTH = 100;

interface GuessPanelProps {
  kind: 'early' | 'final';
  /** The guess was sent (final) or is not possible now (early). */
  disabled: boolean;
  /** How the last guess went, for the line under the field. */
  feedback: 'right' | 'wrong' | null;
  onGuess: (text: string) => void;
}

export default function GuessPanel({ kind, disabled, feedback, onGuess }: GuessPanelProps) {
  const { t } = useTranslation('identity-crisis');
  const [text, setText] = useState('');
  const fieldId = `ic-guess-input-${kind}`;
  const trimmed = text.trim();
  const valid = trimmed.length > 0 && !disabled;

  const submit = () => {
    if (!valid) return;
    onGuess(trimmed);
    setText('');
  };

  return (
    <div className="flex flex-col gap-2 border-t border-app-border pt-3" data-testid={`ic-guess-${kind}`}>
      <label htmlFor={fieldId} className="text-sm font-semibold text-app-text">
        {kind === 'early'
          ? t('guess-early-label', { defaultValue: 'Think you know? Guess who you are' })
          : t('guess-final-label', { defaultValue: 'Final guess: who are you?' })}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          type="text"
          dir="auto"
          value={text}
          maxLength={MAX_LENGTH}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={t('guess-placeholder', { defaultValue: 'A name' })}
          className="min-w-0 flex-1 rounded-app-sm border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text placeholder:text-app-text-muted"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!valid}
          className="rounded-app-sm border border-app-border bg-app-surface px-4 py-2 text-sm font-medium text-app-text transition-colors hover:bg-app-bg disabled:opacity-40"
        >
          {t('guess-send', { defaultValue: 'Guess' })}
        </button>
      </div>
      <p className="text-xs text-app-text-muted" role="status" aria-live="polite">
        {feedback === 'right'
          ? t('guess-right', { defaultValue: 'Right.' })
          : feedback === 'wrong'
            ? t('guess-wrong', { defaultValue: 'Wrong.' })
            : kind === 'early'
              ? t('guess-early-hint', { defaultValue: 'A wrong guess costs 100 points and ends your questions.' })
              : t('guess-final-hint', { defaultValue: 'One guess. Right is worth 200 points.' })}
      </p>
    </div>
  );
}
