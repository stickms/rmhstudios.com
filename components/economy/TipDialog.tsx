'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { toast } from 'sonner';

interface TipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName?: string | null;
  entityType?: 'rmhark' | 'profile';
  entityId?: string;
}

const QUICK_AMOUNTS = [5, 10, 25, 50, 100];

/** Reusable "tip jar" dialog — sends coins to another user. */
export function TipDialog({ open, onOpenChange, recipientId, recipientName, entityType, entityId }: TipDialogProps) {
  const { t } = useTranslation("c-economy");
  const [amount, setAmount] = useState(10);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (amount < 1) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coins/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipientId, amount, note: note.trim() || undefined, entityType, entityId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(t("tip-success", { defaultValue: "Tipped {{amount}} coins{{recipient}}!", amount, recipient: recipientName ? ` to ${recipientName}` : '' }));
        onOpenChange(false);
        setNote('');
      } else if (res.status === 401) {
        toast.error(t("tip-sign-in", { defaultValue: "Please sign in to tip." }));
      } else {
        toast.error(data.error || t("tip-error", { defaultValue: "Could not send tip" }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("tip-dialog-title", { defaultValue: "Send a tip" })}</DialogTitle>
          <DialogDescription>
            {t("tip-dialog-description", { defaultValue: "Send coins{{recipient}} to show some appreciation.", recipient: recipientName ? ` to ${recipientName}` : '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t("tip-amount-group-label", { defaultValue: "Tip amount" })}>
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              aria-pressed={amount === a}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                amount === a ? 'border-site-accent bg-site-accent-dim text-site-text' : 'border-site-border text-site-text-muted hover:bg-site-surface'
              }`}
            >
              <CoinIcon className="inline h-3.5 w-3.5" /> {a}
            </button>
          ))}
        </div>

        <label className="block text-xs text-site-text-muted">
          {t("custom-amount", { defaultValue: "Custom amount" })}
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="mt-1 w-full rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text focus:border-site-accent focus:outline-none"
          />
        </label>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          rows={2}
          placeholder={t("note-placeholder", { defaultValue: "Add a note (optional)" })}
          className="w-full resize-none rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>{t("cancel", { defaultValue: "Cancel" })}</Button>
          <Button variant="accent" onClick={submit} disabled={submitting || amount < 1}>
            {submitting ? t("sending", { defaultValue: "Sending…" }) : (<span className="inline-flex items-center gap-1">{t("tip-btn", { defaultValue: "Tip" })} <CoinIcon className="h-4 w-4" /> {amount}</span>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
