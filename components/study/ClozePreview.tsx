import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ClozeText } from '@/components/study/ClozeText';
import { clozeAnswers, parseCloze } from '@/lib/study/card-types';

/**
 * The cards a cloze text will generate, one row per deletion index: the front as it will be
 * reviewed (the deletion masked) and the answer. A labelled list, rows on rules.
 */
export function ClozePreview({ text }: { text: string }) {
  const { t } = useTranslation('flashcard-types');
  const labelId = useId();
  const parsed = parseCloze(text);
  if (!parsed.ok) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p id={labelId} className="t-label">
        {t('preview', {
          count: parsed.indices.length,
          defaultValue_one: 'Preview: {{count}} card',
          defaultValue: 'Preview: {{count}} cards',
        })}
      </p>
      <ul aria-labelledby={labelId} className="divide-y divide-site-border border-y border-site-border">
        {parsed.indices.map((index) => (
          <li key={index} className="flex flex-col gap-1 py-2">
            <span className="t-meta">{t('preview-card', { defaultValue: 'Card {{index}}', index })}</span>
            <ClozeText text={text} index={index} reveal={false} className="t-body text-site-text" />
            <span className="t-body text-site-text-muted">
              {clozeAnswers(parsed.segments, index).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
