'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
        toast.success(`Tipped 🪙 ${amount}${recipientName ? ` to ${recipientName}` : ''}!`);
        onOpenChange(false);
        setNote('');
      } else if (res.status === 401) {
        toast.error('Please sign in to tip.');
      } else {
        toast.error(data.error || 'Could not send tip');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Send a tip</DialogTitle>
          <DialogDescription>
            Send coins{recipientName ? ` to ${recipientName}` : ''} to show some appreciation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Tip amount">
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              aria-pressed={amount === a}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                amount === a ? 'border-site-accent bg-site-accent-dim text-site-text' : 'border-site-border text-site-text-muted hover:bg-site-surface'
              }`}
            >
              🪙 {a}
            </button>
          ))}
        </div>

        <label className="block text-xs text-site-text-muted">
          Custom amount
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
          placeholder="Add a note (optional)"
          className="w-full resize-none rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button variant="accent" onClick={submit} disabled={submitting || amount < 1}>
            {submitting ? 'Sending…' : `Tip 🪙 ${amount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
