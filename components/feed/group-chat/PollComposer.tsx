import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { MAX_POLL_OPTIONS, type PollDraft } from './group-chat-state';

export function PollComposer({
  draft,
  onChange,
  onCancel,
}: {
  draft: PollDraft;
  onChange: (d: PollDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('feed');
  const setOption = (i: number, val: string) => {
    const options = [...draft.options];
    options[i] = val;
    onChange({ ...draft, options });
  };
  return (
    <div className="border-t border-site-border bg-site-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="site-section-label">{t('poll', { defaultValue: 'Poll' })}</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-site-text-dim hover:text-site-text"
          aria-label={t('cancel-button', { defaultValue: 'Cancel' })}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        value={draft.question}
        onChange={(e) => onChange({ ...draft, question: e.target.value })}
        maxLength={300}
        placeholder={t('poll-question-placeholder', { defaultValue: 'Ask a question…' })}
        className="glass-inset border mb-2 w-full rounded-site-sm px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
      />
      <div className="flex flex-col gap-1.5">
        {draft.options.map((o, i) => (
          <input
            key={i}
            value={o}
            onChange={(e) => setOption(i, e.target.value)}
            maxLength={100}
            placeholder={t('poll-option-placeholder', {
              index: i + 1,
              defaultValue: 'Option {{index}}',
            })}
            className="glass-inset border w-full rounded-site-sm px-3 py-1.5 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />
        ))}
      </div>
      {draft.options.length < MAX_POLL_OPTIONS && (
        <button
          type="button"
          onClick={() => onChange({ ...draft, options: [...draft.options, ''] })}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-site-accent hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> {t('add-option', { defaultValue: 'Add option' })}
        </button>
      )}
    </div>
  );
}
