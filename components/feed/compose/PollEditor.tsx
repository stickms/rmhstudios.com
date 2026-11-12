import type { Dispatch, SetStateAction } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import {
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
} from '@/lib/rmhark-limits';
import type { PollDraft } from './compose-state';

/** The poll creator shown while the poll attachment is active. */
export function PollEditor({
  poll,
  setPoll,
  pollDuration,
  setPollDuration,
  onRemove,
}: {
  poll: PollDraft;
  setPoll: Dispatch<SetStateAction<PollDraft>>;
  pollDuration: number;
  setPollDuration: (hours: number) => void;
  /** Close the editor and discard the draft poll. */
  onRemove: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="mt-2 rounded-site px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-site-text-muted">
          {t('poll-heading', { defaultValue: 'Poll' })}
        </span>
        <button
          onClick={onRemove}
          className="p-2 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <input
        type="text"
        value={poll.question}
        onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
        placeholder={t('poll-question-placeholder', { defaultValue: 'Ask a question…' })}
        aria-label={t('poll-question-aria', { defaultValue: 'Poll question' })}
        maxLength={MAX_POLL_QUESTION_LENGTH}
        className="w-full surface-field text-site-text placeholder:text-site-text-muted text-sm rounded-site-sm px-3 py-2 outline-none focus:border-site-accent transition-colors mb-2"
      />

      <div className="space-y-2">
        {poll.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                const newOptions = [...poll.options];
                newOptions[i] = e.target.value;
                setPoll((p) => ({ ...p, options: newOptions }));
              }}
              placeholder={t('poll-option-placeholder', {
                index: i + 1,
                defaultValue: 'Option {{index}}',
              })}
              aria-label={t('poll-option-aria', {
                count: i + 1,
                defaultValue: 'Poll option {{count}}',
              })}
              maxLength={MAX_POLL_OPTION_LENGTH}
              className="flex-1 surface-field text-site-text placeholder:text-site-text-muted text-sm rounded-site-sm px-3 py-2 outline-none focus:border-site-accent transition-colors"
            />
            {poll.options.length > MIN_POLL_OPTIONS && (
              <button
                type="button"
                onClick={() => {
                  const newOptions = poll.options.filter((_, j) => j !== i);
                  setPoll((p) => ({ ...p, options: newOptions }));
                }}
                aria-label={t('poll-remove-option', {
                  count: i + 1,
                  defaultValue: 'Remove option {{count}}',
                })}
                className="p-2 rounded-full text-site-text-muted hover:text-site-danger hover:bg-site-danger/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>

      {poll.options.length < MAX_POLL_OPTIONS && (
        <button
          onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}
          className="mt-2 text-xs text-site-accent hover:text-site-accent-hover transition-colors"
        >
          {t('poll-add-option', { defaultValue: '+ Add option' })}
        </button>
      )}

      <label className="flex items-center gap-2 mt-3 cursor-pointer">
        <input
          type="checkbox"
          checked={poll.multiSelect}
          onChange={(e) => setPoll((p) => ({ ...p, multiSelect: e.target.checked }))}
          className="rounded border-site-border text-site-accent focus:ring-site-accent"
        />
        <span className="text-xs text-site-text-muted">
          {t('poll-multi-select', { defaultValue: 'Allow multiple selections' })}
        </span>
      </label>

      <label className="mt-3 flex items-center gap-2">
        <span className="text-xs text-site-text-muted">
          {t('poll-length-label', { defaultValue: 'Poll length' })}
        </span>
        <Select
          controlSize="sm"
          value={pollDuration}
          onChange={(e) => setPollDuration(Number(e.target.value))}
          containerClassName="inline-block w-auto"
          className="w-auto min-w-28"
        >
          <option value={0}>{t('poll-duration-no-limit', { defaultValue: 'No limit' })}</option>
          <option value={1}>{t('poll-duration-1h', { defaultValue: '1 hour' })}</option>
          <option value={6}>{t('poll-duration-6h', { defaultValue: '6 hours' })}</option>
          <option value={24}>{t('poll-duration-1d', { defaultValue: '1 day' })}</option>
          <option value={72}>{t('poll-duration-3d', { defaultValue: '3 days' })}</option>
          <option value={168}>{t('poll-duration-1w', { defaultValue: '1 week' })}</option>
        </Select>
      </label>
    </div>
  );
}
