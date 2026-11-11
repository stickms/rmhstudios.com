import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { giftSubApi } from '@/lib/gifting/gift.contract';

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
    if (submitting) return;
    setSubmitting(true);
    try {
      await api(giftSubApi, { body: { recipient: recipientId, tier, months } });
      toast.success(
        recipientName
          ? t('gift-success-named', { defaultValue: 'Gifted {{months}} month{{s}} of {{tier}} to {{name}}!', months, s: months > 1 ? 's' : '', tier: tier === 'pro' ? 'Pro' : 'HARD-R', name: recipientName })
          : t('gift-success', { defaultValue: 'Gifted {{months}} month{{s}} of {{tier}}!', months, s: months > 1 ? 's' : '', tier: tier === 'pro' ? 'Pro' : 'HARD-R' })
      );
      onOpenChange(false);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        toast.error(t('gift-sign-in', { defaultValue: 'Please sign in to gift a membership.' }));
      } else {
        toast.error(serverError(e) || t('gift-error', { defaultValue: 'Could not gift membership' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // Not dismissable mid-send: closing would hide whether the coins moved.
    <Dialog open={open} onOpenChange={(next) => (submitting && !next ? undefined : onOpenChange(next))}>
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
            <p className="mb-1.5 site-section-label">{t('tier', { defaultValue: 'Tier' })}</p>
            <div className="grid grid-cols-2 gap-2">
              {(['starter', 'pro'] as const).map((tierOpt) => (
                <button
                  key={tierOpt}
                  type="button"
                  onClick={() => setTier(tierOpt)}
                  disabled={submitting}
                  data-jelly
                  className={`rounded-site border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    tier === tierOpt ? 'border-site-accent bg-site-accent/10 text-site-text' : 'border-site-border text-site-text-muted hover:text-site-text'
                  }`}
                >
                  {tierOpt === 'pro' ? 'Pro' : 'HARD-R'}
                  <span className="mt-0.5 flex items-center justify-center gap-0.5 text-caption text-site-text-muted">
                    <CoinIcon className="h-3 w-3" /> {PRICES[tierOpt].toLocaleString()}/mo
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 site-section-label">{t('duration', { defaultValue: 'Duration' })}</p>
            <div className="flex gap-2">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  disabled={submitting}
                  data-jelly
                  className={`flex-1 rounded-site-sm border px-2 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
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
          <Button variant="default" loading={submitting} onClick={submit} className="gap-1.5">
            {!submitting && <Gift className="h-4 w-4" />}
            {t('gift-for', { defaultValue: 'Gift for' })} <CoinIcon className="h-4 w-4" /> {cost.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
