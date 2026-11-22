/**
 * Admin coin panel for one member (s04-06): balance, the read-only ledger
 * reconciliation line, a signed adjustment form and the last 20 adjustments with
 * Reverse. Every change goes through the ledger on the server; this component
 * only asks. Apply is the dialog's one ink primary.
 */

import { useId, useRef, useState } from 'react';
import { Coins } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { HttpError, errorField, serverError } from '@/lib/http';
import {
  ADJUSTMENT_MAX,
  ADJUSTMENT_NOTE_MAX,
  ADJUSTMENT_REASONS,
  confirmationSatisfied,
  isValidAmount,
  noteSatisfied,
  requiresConfirmation,
  type AdjustmentDirection,
  type AdjustmentReason,
  type AdjustmentView,
} from '@/lib/economy/adjustments';
import { adjustCoinsApi, getCoinAdjustmentsApi, reverseCoinAdjustmentApi } from '@/lib/economy/adjustments.contract';

interface Props {
  userId: string;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told the member's new balance after an adjustment or a reversal, so the table row follows. */
  onBalanceChange: (balance: number) => void;
}

function CoinAdjustDialog({ userId, userName, open, onOpenChange, onBalanceChange }: Props) {
  const { t, i18n } = useTranslation('coin-adjustments');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const ids = useId();

  const [direction, setDirection] = useState<AdjustmentDirection>('add');
  const [amountText, setAmountText] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('goodwill');
  const [note, setNote] = useState('');
  // One idempotency key per distinct submission: a retry of the same form reuses it (applies once), an edited form
  // gets a new one (a different request must not be answered with the earlier adjustment).
  const attempt = useRef<{ sig: string; key: string } | null>(null);

  const queryKey = ['admin', 'coin-adjustments', userId];
  const summary = useQuery({
    queryKey,
    queryFn: () => api(getCoinAdjustmentsApi, { params: { id: userId } }),
    enabled: open,
    staleTime: 0,
  });
  const arrival = useArrival(!summary.isLoading);

  const nf = new Intl.NumberFormat(i18n.language);
  const signed = new Intl.NumberFormat(i18n.language, { signDisplay: 'always' });
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  const reasonLabels: Record<AdjustmentReason, string> = {
    correction: t('reason-correction', { defaultValue: 'Correction' }),
    goodwill: t('reason-goodwill', { defaultValue: 'Goodwill' }),
    compensation: t('reason-compensation', { defaultValue: 'Compensation' }),
    exploit_clawback: t('reason-exploit-clawback', { defaultValue: 'Exploit clawback' }),
    reversal: t('reason-reversal', { defaultValue: 'Reversal' }),
  };

  const amount = Number(amountText);
  const amountValid = amountText.trim() !== '' && isValidAmount(amount);
  const needsConfirm = amountValid && requiresConfirmation(amount);
  const confirmValue = confirmText.trim() === '' ? undefined : Number(confirmText);
  const canApply = amountValid && noteSatisfied(reason, note) && confirmationSatisfied(amount, confirmValue);

  const refused = (e: unknown) => {
    const balance = errorField<number>(e, 'balance');
    if (e instanceof HttpError && e.status === 409 && typeof balance === 'number') {
      toast.error(
        t('error-insufficient', {
          balance: nf.format(balance),
          defaultValue: 'The member only has {{balance}} coins.',
        }),
      );
    } else if (e instanceof HttpError && e.status === 409) {
      toast.error(serverError(e) ?? t('error-failed', { defaultValue: 'The change could not be applied.' }));
    } else {
      toast.error(t('error-failed', { defaultValue: 'The change could not be applied.' }));
    }
  };

  const apply = useMutation({
    mutationFn: () => {
      const sig = JSON.stringify([direction, amount, reason, note.trim(), confirmValue]);
      if (attempt.current?.sig !== sig) attempt.current = { sig, key: crypto.randomUUID() };
      return api(adjustCoinsApi, {
        params: { id: userId },
        body: {
          direction,
          amount,
          reason: reason as Exclude<AdjustmentReason, 'reversal'>,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(confirmValue !== undefined ? { confirmAmount: confirmValue } : {}),
          key: attempt.current.key,
        },
      });
    },
    onSuccess: (data) => {
      attempt.current = null;
      setAmountText('');
      setConfirmText('');
      setNote('');
      onBalanceChange(data.balance);
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('adjusted', { defaultValue: 'Coins adjusted.' }));
    },
    onError: refused,
  });

  const reverse = useMutation({
    mutationFn: (adjustmentId: string) => api(reverseCoinAdjustmentApi, { params: { id: userId, adjustmentId } }),
    onSuccess: (data) => {
      onBalanceChange(data.balance);
      void queryClient.invalidateQueries({ queryKey });
      toast.success(t('reversed-toast', { defaultValue: 'Adjustment reversed.' }));
    },
    onError: refused,
  });

  const askReverse = async (row: AdjustmentView) => {
    const ok = await confirm({
      title: t('reverse-title', { defaultValue: 'Reverse this adjustment?' }),
      description: t('reverse-body', {
        amount: signed.format(-row.delta),
        count: Number(signed.format(-row.delta)),
        defaultValue_one: 'This applies {{amount}} coin to the member and cannot be undone.',
        defaultValue: 'This applies {{amount}} coins to the member and cannot be undone.',
      }),
      confirmLabel: t('reverse', { defaultValue: 'Reverse' }),
      danger: true,
    });
    if (ok) reverse.mutate(row.id);
  };

  const busy = apply.isPending || reverse.isPending;
  const data = summary.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { name: userName, defaultValue: 'Coins for {{name}}' })}</DialogTitle>
          <DialogDescription>
            {t('description', {
              defaultValue: 'Every change is a ledger entry the member sees on their statement.',
            })}
          </DialogDescription>
        </DialogHeader>

        {summary.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : summary.isError || !data ? (
          <p role="alert" className="t-body text-site-danger">
            {t('error-load', { defaultValue: 'Could not load this member’s coins.' })}
          </p>
        ) : (
          <div className={cn('space-y-1', arrival)}>
            <p className="t-heading">
              {t('balance', {
                amount: nf.format(data.balance),
                count: Number(nf.format(data.balance)),
                defaultValue_one: 'Balance: {{amount}} coin',
                defaultValue: 'Balance: {{amount}} coins',
              })}
            </p>
            <p className="t-meta">
              {data.reconciliation.ok
                ? t('ledger-matches', { defaultValue: 'Ledger matches balance' })
                : t('ledger-differs', {
                    amount: nf.format(Math.abs(data.reconciliation.drift)),
                    defaultValue: 'Ledger differs by {{amount}}: balance predates the ledger',
                  })}
            </p>
          </div>
        )}

        <form
          className="space-y-3 border-t border-site-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canApply && !busy) apply.mutate();
          }}
        >
          <Tabs
            aria-label={t('direction', { defaultValue: 'Direction' })}
            sheet={false}
            value={direction}
            onChange={(v) => setDirection(v === 'remove' ? 'remove' : 'add')}
            tabs={[
              { id: 'add', label: t('add', { defaultValue: 'Add' }) },
              { id: 'remove', label: t('remove', { defaultValue: 'Remove' }) },
            ]}
          />

          <div className="space-y-1">
            <label htmlFor={`${ids}-amount`} className="t-label block">
              {t('amount', { defaultValue: 'Amount' })}
            </label>
            <Input
              id={`${ids}-amount`}
              type="number"
              inputMode="numeric"
              min={1}
              max={ADJUSTMENT_MAX}
              step={1}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={amountText.trim() !== '' && !amountValid}
              aria-describedby={`${ids}-amount-hint`}
            />
            <p id={`${ids}-amount-hint`} className="t-meta">
              {t('amount-hint', {
                max: nf.format(ADJUSTMENT_MAX),
                defaultValue: 'A whole number from 1 to {{max}}.',
              })}
            </p>
          </div>

          {needsConfirm && (
            <div className="space-y-1">
              <label htmlFor={`${ids}-confirm`} className="t-label block">
                {t('confirm-amount', { defaultValue: 'Type the amount again to confirm' })}
              </label>
              <Input
                id={`${ids}-confirm`}
                type="number"
                inputMode="numeric"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                aria-invalid={confirmText.trim() !== '' && confirmValue !== amount}
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor={`${ids}-reason`} className="t-label block">
              {t('reason', { defaultValue: 'Reason' })}
            </label>
            <Select id={`${ids}-reason`} value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)}>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {reasonLabels[r]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1">
            <label htmlFor={`${ids}-note`} className="t-label block">
              {reason === 'correction'
                ? t('note-required', { defaultValue: 'Note (required for a correction)' })
                : t('note', { defaultValue: 'Note (optional)' })}
            </label>
            <Textarea
              id={`${ids}-note`}
              value={note}
              maxLength={ADJUSTMENT_NOTE_MAX}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              aria-required={reason === 'correction'}
            />
            <p className="t-meta">
              {t('note-count', {
                count: note.length,
                max: ADJUSTMENT_NOTE_MAX,
                defaultValue: '{{count}} of {{max}}',
              })}
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
              {t('close', { defaultValue: 'Close' })}
            </Button>
            <Button type="submit" variant="primary" disabled={!canApply || busy}>
              {direction === 'add'
                ? t('apply-add', { defaultValue: 'Add coins' })
                : t('apply-remove', { defaultValue: 'Remove coins' })}
            </Button>
          </DialogFooter>
        </form>

        <section aria-labelledby={`${ids}-history`} className="border-t border-site-border pt-4">
          <h3 id={`${ids}-history`} className="t-label">
            {t('history', { defaultValue: 'Recent adjustments' })}
          </h3>
          {data && data.adjustments.length === 0 ? (
            <EmptyState
              title={t('history-empty', { defaultValue: 'No adjustments yet' })}
              description={t('history-empty-hint', {
                defaultValue: 'Adjustments appear here with who made them and why.',
              })}
            />
          ) : (
            <ul className={cn(arrival)}>
              {data?.adjustments.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 border-b border-site-border py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="t-body">
                      <span className="t-meta text-site-text">{signed.format(row.delta)}</span>{' '}
                      {reasonLabels[row.reason]}
                      {row.reversed && <span className="t-meta"> · {t('reversed', { defaultValue: 'Reversed' })}</span>}
                    </p>
                    {row.note && <p className="t-meta break-words">{row.note}</p>}
                    <p className="t-meta">
                      {when.format(new Date(row.createdAt))}
                      {' · '}
                      {row.admin?.name ?? t('admin-removed', { defaultValue: 'Former admin' })}
                    </p>
                  </div>
                  {!row.reversed && !row.isReversal && (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      disabled={busy}
                      onClick={() => void askReverse(row)}
                    >
                      {t('reverse', { defaultValue: 'Reverse' })}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/** The Coins button on a member row; it owns the dialog's open state and mounts it only while open. */
export function CoinAdjustButton({
  userId,
  userName,
  balance,
  disabled,
  onBalanceChange,
}: {
  userId: string;
  userName: string;
  balance: number;
  disabled?: boolean;
  onBalanceChange: (balance: number) => void;
}) {
  const { t, i18n } = useTranslation('coin-adjustments');
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={Coins}
        size="icon-sm"
        variant="default"
        disabled={disabled}
        onClick={() => setOpen(true)}
        label={t('adjust-coins', {
          coins: balance.toLocaleString(i18n.language),
          defaultValue: 'Adjust coins (currently {{coins}})',
        })}
      />
      {open && (
        <CoinAdjustDialog
          userId={userId}
          userName={userName}
          open
          onOpenChange={setOpen}
          onBalanceChange={onBalanceChange}
        />
      )}
    </>
  );
}
