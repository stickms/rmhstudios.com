import type { ComponentType } from 'react';
import { m as motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fade } from '@/lib/motion';
import { OverlayPanel } from '@/components/ui/overlay-panel';
import type { AudienceValue, ReplyControlValue } from './compose-state';
import { useAudienceOptions, useReplyOptions } from './compose-options';

type OptionIcon = ComponentType<{ className?: string }>;

/** One-of-N picker slab shared by the audience and who-can-reply dialogs. */
function OptionPicker<V extends string>({
  heading,
  HeadingIcon,
  options,
  value,
  onSelect,
  onClose,
}: {
  heading: string;
  HeadingIcon: OptionIcon;
  options: ReadonlyArray<{ value: V; label: string; icon: OptionIcon }>;
  value: V;
  onSelect: (value: V) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <OverlayPanel open onClose={onClose}>
      <motion.div
        variants={fade}
        initial="initial"
        animate="animate"
        className="relative w-full max-w-xs p-2 surface-overlay"
      >
        <div className="mb-1 flex items-center justify-between px-3 pt-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text">
            <HeadingIcon className="h-4 w-4 text-site-text-muted" />
            {heading}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', { defaultValue: 'Close' })}
            className="p-2 rounded-full text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div role="listbox" className="py-1">
          {options.map(({ value: optionValue, label, icon: Icon }) => (
            <button
              key={optionValue}
              type="button"
              role="option"
              aria-selected={value === optionValue}
              onClick={() => {
                onSelect(optionValue);
                onClose();
              }}
              className={`flex items-center gap-2 w-full rounded-site-sm px-3 py-2 text-sm transition-colors hover:bg-site-surface-hover ${
                value === optionValue ? 'text-site-accent' : 'text-site-text'
              }`}
            >
              <Icon className="w-4 h-4 text-site-text-muted" />
              <span className="flex-1 text-left">{label}</span>
              {value === optionValue && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
      </motion.div>
    </OverlayPanel>
  );
}

/** Post visibility picker — opened from the (+) menu. */
export function AudiencePickerDialog({
  audience,
  onSelect,
  onClose,
}: {
  audience: AudienceValue;
  onSelect: (value: AudienceValue) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('feed');
  const options = useAudienceOptions();
  const current = options.find((o) => o.value === audience) ?? options[0];
  return (
    <OptionPicker
      heading={t('audience-group-label', { defaultValue: 'Who can see this post' })}
      HeadingIcon={current.icon}
      options={options}
      value={audience}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}

/** Who-can-reply picker — opened from the (+) menu. */
export function ReplyPickerDialog({
  replyControl,
  onSelect,
  onClose,
}: {
  replyControl: ReplyControlValue;
  onSelect: (value: ReplyControlValue) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('feed');
  const options = useReplyOptions();
  const current = options.find((o) => o.value === replyControl) ?? options[0];
  return (
    <OptionPicker
      heading={t('reply-control-heading', { defaultValue: 'Who can reply?' })}
      HeadingIcon={current.icon}
      options={options}
      value={replyControl}
      onSelect={onSelect}
      onClose={onClose}
    />
  );
}
