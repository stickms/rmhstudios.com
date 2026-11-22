/**
 * s06-07 — the optional written feedback on a jam entry's rating form: a labelled textarea with a character
 * counter, and "Leave my name off". It is controlled by the rating form, which saves the words with the scores in
 * one request; a rater who comes back sees their text and can edit it until rating closes.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FEEDBACK_MAX, FEEDBACK_MIN } from '@/lib/competitive/jam-feedback';
import { cn } from '@/lib/utils';

interface JamFeedbackFieldProps {
  value: string;
  anonymous: boolean;
  onChange: (value: string) => void;
  onAnonymousChange: (anonymous: boolean) => void;
  disabled?: boolean;
}

export function JamFeedbackField({ value, anonymous, onChange, onAnonymousChange, disabled }: JamFeedbackFieldProps) {
  const { t } = useTranslation('jam-feedback');
  const id = useId();
  const length = value.trim().length;
  const tooShort = length > 0 && length < FEEDBACK_MIN;
  return (
    <div className="col-span-2 flex flex-col gap-2">
      <label htmlFor={`${id}-text`} className="t-label">
        {t('field-label', { defaultValue: 'Feedback for the team (optional)' })}
      </label>
      <Textarea
        id={`${id}-text`}
        value={value}
        maxLength={FEEDBACK_MAX}
        rows={3}
        disabled={disabled}
        aria-invalid={tooShort || undefined}
        aria-describedby={`${id}-count`}
        placeholder={t('field-placeholder', { defaultValue: 'What worked, what broke' })}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={`${id}-count`} className={cn('t-meta', tooShort && 'text-site-danger')}>
        {tooShort
          ? t('field-too-short', {
              min: FEEDBACK_MIN,
              defaultValue: 'At least {{min}} characters, or leave it empty.',
            })
          : t('field-count', {
              count: length,
              max: FEEDBACK_MAX,
              defaultValue: '{{count}} of {{max}}',
            })}
      </p>
      <div className="flex items-center gap-3">
        <Switch
          id={`${id}-anon`}
          checked={anonymous}
          disabled={disabled}
          onCheckedChange={onAnonymousChange}
          aria-labelledby={`${id}-anon-label`}
        />
        <span id={`${id}-anon-label`} className="t-body">
          {t('field-anonymous', { defaultValue: 'Leave my name off' })}
        </span>
      </div>
    </div>
  );
}
