import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ComposeDraft } from '@/hooks/useComposeDraft';

/** Offers back an unsent draft found in storage when an empty composer mounts. */
export function DraftRestoreBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: ComposeDraft;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="mb-3 flex items-center gap-2 rounded-site glass-fill px-3 py-2">
      <History className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-xs text-site-text-muted">
        {t('draft-restore-prompt', { defaultValue: 'You have an unsent draft:' })}
        {''}
        <span className="text-site-text">{draft.content}</span>
      </p>
      <button
        type="button"
        onClick={onRestore}
        className="shrink-0 text-xs font-semibold text-site-accent hover:underline"
      >
        {t('draft-restore', { defaultValue: 'Restore' })}
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="shrink-0 text-xs text-site-text-muted hover:text-site-text"
      >
        {t('draft-discard', { defaultValue: 'Discard' })}
      </button>
    </div>
  );
}
