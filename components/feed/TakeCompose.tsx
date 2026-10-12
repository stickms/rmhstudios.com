'use client';

import { Check, Scale, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * X6 composer pieces. "Mark as a take" lives in the composer's (+) menu, and an
 * active take shows as a removable chip under the text — the same pair the
 * content-warning toggle uses, so it reads as a sibling of that control.
 */

export function TakeMenuItem({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { t } = useTranslation('f-feed-plus');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
    >
      <Scale className={`w-4 h-4 ${active ? 'text-site-accent' : 'text-site-text-dim'}`} />
      <span className="flex-1 text-left">{t('take-menu', { defaultValue: 'Mark as a take' })}</span>
      {active && <Check className="w-4 h-4 text-site-accent" />}
    </button>
  );
}

export function TakeChip({ onRemove }: { onRemove: () => void }) {
  const { t } = useTranslation('f-feed-plus');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRemove}
        title={t('take-chip-title', {
          defaultValue: 'Readers vote agree or disagree and see the split after voting',
        })}
        className="inline-flex items-center gap-1 rounded-full border border-site-accent/40 bg-site-accent/10 px-3 py-1 text-xs font-medium text-site-accent transition-colors hover:bg-site-accent/20"
      >
        <Scale className="h-3.5 w-3.5" aria-hidden />
        <span>{t('take-chip', { defaultValue: 'Take' })}</span>
        <X className="h-3 w-3" aria-hidden />
        <span className="sr-only">{t('take-chip-remove', { defaultValue: 'Remove take' })}</span>
      </button>
    </div>
  );
}
