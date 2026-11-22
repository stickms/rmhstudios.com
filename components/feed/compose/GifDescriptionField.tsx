import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { MAX_GIF_ALT_LENGTH } from '@/lib/feed/gif-alt';

/**
 * "Describe this GIF" (sprint 06 #15): the description that travels with a GIF a member is about to post or send. It is
 * prefilled from the GIF provider's own text, so describing costs nothing, and stays editable. An empty field is
 * allowed (the GIF is then announced as "GIF") unless the member requires descriptions, when `required` says so.
 * A visible label and a live count, like the image description field; no new styling.
 */
export function GifDescriptionField({
  value,
  onChange,
  required = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The member's "Require alt text" setting is on and this GIF has no description yet. */
  required?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('gif-descriptions');
  const id = useId();
  const hintId = `${id}-hint`;
  const missing = required && !value.trim();
  return (
    <div className={className}>
      <label htmlFor={id} className="t-label">
        {t('describe-label', { defaultValue: 'Describe this GIF' })}
      </label>
      <Input
        id={id}
        data-gif-alt-input=""
        value={value}
        maxLength={MAX_GIF_ALT_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('describe-placeholder', { defaultValue: 'What happens in the GIF' })}
        aria-describedby={hintId}
        aria-invalid={missing || undefined}
        className="mt-1"
      />
      <p id={hintId} className="t-meta mt-1" aria-live="off">
        {missing
          ? t('describe-required', { defaultValue: 'A description is required.' })
          : t('describe-count', {
              used: value.length,
              max: MAX_GIF_ALT_LENGTH,
              defaultValue: '{{used}} / {{max}}',
            })}
      </p>
    </div>
  );
}
