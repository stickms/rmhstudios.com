'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';

/**
 * Inline edit for a message bubble.
 *
 * Edits in place rather than in a dialog: the point of a 15-minute window is
 * that this is a quick correction, and a modal makes a typo fix feel like a
 * document revision. Enter saves, Escape cancels, and the field is focused with
 * the caret at the end so the common case (a missing word at the end) is one
 * keystroke away.
 *
 * The field is `.glass-inset` — the input tier — and sits *outside* the bubble
 * fill, so it never puts a blurred surface on a repeated list item.
 */
export function MessageEditor({
  initialValue,
  saving,
  onSave,
  onCancel,
}: {
  initialValue: string;
  saving: boolean;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('feed');
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const unchanged = value.trim() === initialValue.trim();

  return (
    <div className="flex w-full flex-col gap-2">
      <textarea
        ref={ref}
        value={value}
        rows={2}
        maxLength={MESSAGE_MAX_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!unchanged && !saving) onSave(value);
          }
        }}
        aria-label={t('message-edit-field', { defaultValue: 'Edit message' })}
        className="glass-inset w-full resize-none rounded-site px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus-visible:border-site-accent focus-visible:outline-none"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-site-text-dim">
          {t('message-edit-hint', { defaultValue: 'Enter to save · Esc to cancel' })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          aria-label={t('message-edit-cancel', { defaultValue: 'Cancel edit' })}
          className="size-11 rounded-site p-0"
        >
          <X className="size-4" />
        </Button>
        <Button
          variant="accent"
          size="sm"
          onClick={() => onSave(value)}
          disabled={saving || unchanged}
          loading={saving}
          aria-label={t('message-edit-save', { defaultValue: 'Save edit' })}
          className="size-11 rounded-site p-0"
        >
          <Check className="size-4" />
        </Button>
      </div>
    </div>
  );
}
