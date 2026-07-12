'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Gift } from 'lucide-react';
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
  const { t } = useTranslation("c-economy");
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
        toast.success(
          recipientName
            ? t('gift-success-named', { defaultValue: 'Gifted {{months}} month{{s}} of {{tier}} to {{name}}!', months, s: months > 1 ? 's' : '', tier: tier === 'pro' ? 'Pro' : 'Starter', name: recipientName })
            : t('gift-success', { defaultValue: 'Gifted {{months}} month{{s}} of {{tier}}!', months, s: months > 1 ? 's' : '', tier: tier === 'pro' ? 'Pro' : 'Starter' })
        );
        onOpenChange(false);
      } else if (res.status === 401) {
        toast.error(t('gift-sign-in', { defaultValue: 'Please sign in to gift a membership.' }));
      } else {
        toast.error(data.error || t('gift-error', { defaultValue: 'Could not gift membership' }));
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
            <Gift className="h-5 w-5 text-site-accent" /> {t('gift-a-membership', { defaultValue: 'Gift a membership' })}
          </DialogTitle>
          <DialogDescription>
            {recipientName
              ? t('gift-desc-named', { defaultValue: 'Give {{name}} a membership with coins.', name: recipientName })
              : t('gift-desc', { defaultValue: 'Give this user a membership with coins.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('tier', { defaultValue: 'Tier' })}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['starter', 'pro'] as const).map((tierOpt) => (
                <button
                  key={tierOpt}
                  type="button"
                  onClick={() => setTier(tierOpt)}
                  className={`rounded-site border px-3 py-2 text-sm font-medium transition-colors ${
                    tier === tierOpt ? 'border-site-accent bg-site-accent/10 text-site-text' : 'border-site-border text-site-text-muted hover:text-site-text'
                  }`}
                >
                  {tierOpt === 'pro' ? 'Pro' : 'Starter'}
                  <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[11px] text-site-text-dim">
                    <CoinIcon className="h-3 w-3" /> {PRICES[tierOpt].toLocaleString()}/mo
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('duration', { defaultValue: 'Duration' })}</p>
            <div className="flex gap-2">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`flex-1 rounded-site-sm border px-2 py-1.5 text-sm font-medium transition-colors ${
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
          <Button variant="accent" loading={submitting} onClick={submit} className="gap-1.5">
            {!submitting && <Gift className="h-4 w-4" />}
            {t('gift-for', { defaultValue: 'Gift for' })} <CoinIcon className="h-4 w-4" /> {cost.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
