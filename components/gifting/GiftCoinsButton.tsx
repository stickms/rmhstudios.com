'use client';

/**
 * Gifting v2 (§9) — "Gift coins" action: a token-styled button that opens a
 * small dialog (amount, optional note, "make it public" toggle) and POSTs to
 * /api/coins/gift. Reusable on profiles and the DM composer.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';

const QUICK_AMOUNTS = [10, 25, 50, 100, 250];
const MIN = 10;
const MAX = 10_000;

interface GiftCoinsButtonProps {
  /** Recipient user id or handle — resolved server-side. */
  recipient: string;
  recipientName?: string | null;
  /** Render as an icon-only trigger (e.g. inside the DM composer toolbar). */
  compact?: boolean;
  /** Extra classes for the trigger button. */
  className?: string;
  variant?: 'accent' | 'outline' | 'ghost' | 'secondary' | 'accent-outline';
  onSent?: (amount: number) => void;
}

export function GiftCoinsButton({
  recipient,
  recipientName,
  compact,
  className,
  variant = 'accent-outline',
  onSent,
}: GiftCoinsButtonProps) {
  const { t } = useTranslation('site');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(50);
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const label = t('gift-coins', { defaultValue: 'Gift coins' });

  const submit = async () => {
    if (amount < MIN || amount > MAX) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/coins/gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipient,
          amount,
          note: note.trim() || undefined,
          public: isPublic,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success(
          t('gift-coins-success', {
            defaultValue: 'Sent {{amount}} coins{{recipient}} 🎁',
            amount,
            recipient: recipientName ? ` to ${recipientName}` : '',
          }),
        );
        setOpen(false);
        setNote('');
        setIsPublic(false);
        onSent?.(amount);
      } else if (res.status === 401) {
        toast.error(t('gift-coins-sign-in', { defaultValue: 'Please sign in to gift coins.' }));
      } else {
        toast.error(data.error || t('gift-coins-error', { defaultValue: 'Could not send gift' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={compact ? 'icon-sm' : 'sm'}
        className={className}
        onClick={() => setOpen(true)}
        aria-label={label}
      >
        <Gift className="h-4 w-4" aria-hidden />
        {!compact && <span className="ml-1.5">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-site-accent" aria-hidden />
              {label}
            </DialogTitle>
            <DialogDescription>
              {t('gift-coins-description', {
                defaultValue: 'Send coins{{recipient}} — pure gift, no strings attached.',
                recipient: recipientName ? ` to ${recipientName}` : '',
              })}
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('gift-coins-amount-group', { defaultValue: 'Gift amount' })}
          >
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                aria-pressed={amount === a}
                className={`rounded-site-sm border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  amount === a
                    ? 'border-site-accent bg-site-accent-dim text-site-text'
                    : 'border-site-border text-site-text-muted hover:bg-site-surface'
                }`}
              >
                <CoinIcon className="inline h-3.5 w-3.5" /> {a}
              </button>
            ))}
          </div>

          <label className="block text-xs text-site-text-muted">
            {t('gift-coins-custom-amount', { defaultValue: 'Custom amount' })}
            <input
              type="number"
              min={MIN}
              max={MAX}
              value={amount}
              onChange={(e) =>
                setAmount(Math.min(MAX, Math.max(MIN, parseInt(e.target.value, 10) || MIN)))
              }
              className="mt-1 w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text focus:border-site-accent focus:outline-none"
            />
          </label>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder={t('gift-coins-note-placeholder', {
              defaultValue: 'Add a message (optional)',
            })}
            className="w-full resize-none rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
          />

          <label className="flex items-center gap-2 text-sm text-site-text-muted">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-site-border text-site-accent focus:ring-site-accent"
            />
            {t('gift-coins-public', {
              defaultValue: 'Make it public (they can show it off)',
            })}
          </label>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              variant="accent"
              onClick={submit}
              disabled={submitting || amount < MIN || amount > MAX}
            >
              {submitting ? (
                t('sending', { defaultValue: 'Sending…' })
              ) : (
                <span className="inline-flex items-center gap-1">
                  {t('gift-coins-send', { defaultValue: 'Gift' })}
                  <CoinIcon className="h-4 w-4" /> {amount}
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
