import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { maskCloze, parseCloze } from '@/lib/study/card-types';
import { cn } from '@/lib/utils';

/**
 * A cloze card's text with its deletions drawn: on the front the active deletion is a mask
 * ("[…]", or "[hint]"), on the back it is the answer in weight 600, never coloured. `index` null
 * treats every deletion as active (the editor's list). Card text is plain text: parts render as
 * React text nodes, never markup. A mask is read as "blank".
 */
export function ClozeText({
  text,
  index,
  reveal,
  className,
}: {
  text: string;
  index: number | null;
  reveal: boolean;
  className?: string;
}) {
  const { t } = useTranslation('flashcard-types');
  const parsed = useMemo(() => parseCloze(text), [text]);
  const base = cn('break-words whitespace-pre-wrap', className);
  if (!parsed.ok) {
    return (
      <span dir="auto" className={base}>
        {text}
      </span>
    );
  }
  return (
    <span dir="auto" className={base}>
      {maskCloze(parsed.segments, index, reveal).map((part, i) => {
        if (part.type === 'text') return part.text;
        if (part.type === 'answer') {
          return (
            <span key={i} className="font-semibold">
              {part.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            role="img"
            aria-label={
              part.hint === null
                ? t('blank-label', { defaultValue: 'blank' })
                : t('blank-hint-label', {
                    defaultValue: 'blank, hint: {{hint}}',
                    hint: part.hint,
                  })
            }
          >
            {part.hint === null ? t('mask', { defaultValue: '[…]' }) : `[${part.hint}]`}
          </span>
        );
      })}
    </span>
  );
}
