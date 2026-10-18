'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CHECKLIST_ITEM_MAX,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_TITLE_MAX,
  type ChatRef,
} from '@/lib/chat-plus/types';

/**
 * M5 — a composer button that opens a small form for a shared checklist
 * ("who's bringing what"). The posted message arrives back through `onPosted`
 * so the host view can append it like any other send.
 */
export function ChecklistComposer({
  chat,
  onPosted,
  disabled,
}: {
  chat: ChatRef;
  onPosted: (message: unknown) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('f-messaging');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);

  const filled = items.map((i) => i.trim()).filter(Boolean);
  const valid = title.trim().length > 0 && filled.length > 0;

  const reset = () => {
    setTitle('');
    setItems(['', '']);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/chats/${chat.kind}/${encodeURIComponent(chat.id)}/checklist`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), items: filled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error || t('checklist-failed', { defaultValue: 'Could not post the checklist' }),
        );
        return;
      }
      onPosted(data.message);
      reset();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t('checklist-new', { defaultValue: 'New checklist' })}
        title={t('checklist-new', { defaultValue: 'New checklist' })}
        className="flex h-[42px] shrink-0 items-center rounded-site px-2.5 text-site-text-dim hover:bg-site-surface-hover hover:text-site-accent focus-visible:ring-2 focus-visible:ring-site-accent disabled:opacity-50"
      >
        <ListChecks className="size-5" />
      </button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('checklist-new', { defaultValue: 'New checklist' })}</DialogTitle>
              <DialogDescription>
                {t('checklist-help', {
                  defaultValue:
                    'Everyone in this chat can tick items off. Good for who is bringing what.',
                })}
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label className="sr-only" htmlFor="checklist-title">
                {t('checklist-title-label', { defaultValue: 'Checklist title' })}
              </label>
              <input
                id="checklist-title"
                autoFocus
                value={title}
                maxLength={CHECKLIST_TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('checklist-title-placeholder', {
                  defaultValue: 'Title, e.g. Game night',
                })}
                className="glass-inset min-h-11 rounded-site px-3 text-sm text-site-text outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
              />
              {items.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={item}
                    maxLength={CHECKLIST_ITEM_MAX}
                    onChange={(e) =>
                      setItems((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    aria-label={t('checklist-item-label', {
                      index: i + 1,
                      defaultValue: 'Item {{index}}',
                    })}
                    placeholder={t('checklist-item-placeholder', {
                      index: i + 1,
                      defaultValue: 'Item {{index}}',
                    })}
                    className="glass-inset min-h-11 min-w-0 flex-1 rounded-site px-3 text-sm text-site-text outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={t('checklist-item-remove', {
                        index: i + 1,
                        defaultValue: 'Remove item {{index}}',
                      })}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full text-site-text-dim hover:bg-site-surface-hover focus-visible:ring-2 focus-visible:ring-site-accent"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              {items.length < CHECKLIST_MAX_ITEMS && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, ''])}
                  className="inline-flex min-h-9 items-center gap-1 self-start px-1 text-sm font-medium text-site-accent hover:underline focus-visible:ring-2 focus-visible:ring-site-accent"
                >
                  <Plus className="size-4" aria-hidden />
                  {t('checklist-add-item', { defaultValue: 'Add item' })}
                </button>
              )}
              <Button
                type="submit"
                variant="accent"
                disabled={!valid}
                loading={busy}
                className="mt-2"
              >
                {t('checklist-post', { defaultValue: 'Post checklist' })}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
