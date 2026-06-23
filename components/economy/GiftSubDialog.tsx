'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Gift, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface GiftSubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName?: string | null;
}

// Mirrors GIFT_PRICES in lib/gifting/gift.server.ts (coins per month).
const PRICES = { starter: 600, pro: 1800 } as const;
const MONTH_OPTIONS = [1, 3, 6, 12];

export function GiftSubDialog({ open, onOpenChange, recipientId, recipientName }: GiftSubDialogProps) {
  const [tier, setTier] = useState<'starter' | 'pro'>('starter');
  const [months, setMonths] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const cost = PRICES[tier] * months;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/gift-sub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipient: recipientId, tier, months }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Gifted ${months} month${months > 1 ? 's' : ''} of ${tier === 'pro' ? 'Pro' : 'Starter'}${recipientName ? ` to ${recipientName}` : ''}!`);
        onOpenChange(false);
      } else if (res.status === 401) {
        toast.error('Please sign in to gift a membership.');
      } else {
        toast.error(data.error || 'Could not gift membership');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-site-accent" /> Gift a membership
          </DialogTitle>
          <DialogDescription>
            {recipientName ? `Give ${recipientName} a membership with coins.` : 'Give this user a membership with coins.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Tier</p>
            <div className="grid grid-cols-2 gap-2">
              {(['starter', 'pro'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    tier === t ? 'border-site-accent bg-site-accent/10 text-site-text' : 'border-site-border text-site-text-muted hover:text-site-text'
                  }`}
                >
                  {t === 'pro' ? 'Pro' : 'Starter'}
                  <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[11px] text-site-text-dim">
                    <CoinIcon className="h-3 w-3" /> {PRICES[t].toLocaleString()}/mo
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Duration</p>
            <div className="flex gap-2">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-sm font-medium transition-colors ${
                    months === m ? 'border-site-accent bg-site-accent/10 text-site-text' : 'border-site-border text-site-text-muted hover:text-site-text'
                  }`}
                >
                  {m}mo
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="accent" disabled={submitting} onClick={submit} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            Gift for <CoinIcon className="h-4 w-4" /> {cost.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
