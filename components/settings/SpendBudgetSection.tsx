import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SpendBudgetMeter } from '@/components/wallet/SpendBudgetMeter';
import { api } from '@/lib/contract/client';
import { setPlayLimitsApi } from '@/lib/economy/play-limits.contract';
import type { PlayLimitsView } from '@/lib/economy/play-limits.server';
import { isLoosening } from '@/lib/economy/play-limits';
import { MAX_SPEND_CAP, MIN_SPEND_CAP } from '@/lib/economy/spend-budget';

/**
 * Monthly spending budget (s04-07), a section of the staking-limits panel.
 *
 * It decides nothing: `applySpendBudgetChange` on the server does. The panel
 * only says before the click what will happen (a raise waits a day) and shows
 * what came back. Raising or removing the budget is parked; a cut applies now.
 */
export function SpendBudgetSection({
  budget,
  onSaved,
}: {
  budget: PlayLimitsView['spendBudget'];
  onSaved: (view: PlayLimitsView) => void;
}) {
  const { t, i18n } = useTranslation('spending-budget');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = budget.monthlySpendCap;
  const input = draft ?? (cap === null ? '' : String(cap));
  const parsed = input.trim() === '' ? null : Number(input);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= MIN_SPEND_CAP && parsed <= MAX_SPEND_CAP);
  const changed = parsed !== cap;
  const wouldDefer = valid && changed && isLoosening(cap, parsed);
  const num = (n: number) => n.toLocaleString(i18n.language);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  async function save(body: { monthlySpendCap: number | null } | { cancelPendingSpendCap: true }) {
    setSaving(true);
    setError(null);
    try {
      const next = await api(setPlayLimitsApi, { body });
      onSaved(next);
      setDraft(null);
      if ('cancelPendingSpendCap' in body) {
        toast.success(t('cancelled', { defaultValue: 'The pending change is cancelled.' }));
      } else if (next.spendBudget.pendingSpendCapAt) {
        toast.success(
          t('deferred', {
            defaultValue: 'Saved. Because this gives you more room, it takes effect {{when}}.',
            when: when(next.spendBudget.pendingSpendCapAt),
          }),
        );
      } else {
        toast.success(t('saved', { defaultValue: 'Saved.' }));
      }
    } catch {
      const message = t('save-error', { defaultValue: 'Could not save that. Try again.' });
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-site-border pt-4">
      <label htmlFor="spend-budget-cap" className="t-label block">
        {t('label', { defaultValue: 'Monthly spending budget' })}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="spend-budget-cap"
          inputMode="numeric"
          value={input}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('off', { defaultValue: 'Off' })}
          className="max-w-40"
          aria-describedby="spend-budget-hint"
          aria-invalid={!valid || error !== null}
        />
        <Button onClick={() => void save({ monthlySpendCap: parsed })} disabled={saving || !valid || !changed}>
          {t('save', { defaultValue: 'Save budget' })}
        </Button>
      </div>
      <p id="spend-budget-hint" className="t-meta">
        {t('hint', {
          count: Number(num(MAX_SPEND_CAP)),
          defaultValue_one:
            'Shop, unlocks, tips, gifts, memberships and market buys, per calendar month (UTC). Leave blank for no budget. Allowed: {{min}} to {{max}} coin.',
          defaultValue:
            'Shop, unlocks, tips, gifts, memberships and market buys, per calendar month (UTC). Leave blank for no budget. Allowed: {{min}} to {{max}} coins.',
          min: num(MIN_SPEND_CAP),
          max: num(MAX_SPEND_CAP),
        })}
      </p>
      {cap !== null && <SpendBudgetMeter spent={budget.spentThisMonth} cap={cap} month={budget.month} />}
      {wouldDefer && (
        <p className="t-meta">
          {t('will-defer', { defaultValue: 'This gives you more room, so it takes effect in 24 hours.' })}
        </p>
      )}
      {budget.pendingSpendCapAt && (
        <p className="t-meta flex flex-wrap items-center gap-2">
          <span>
            {budget.pendingSpendCap === null
              ? t('pending-remove', {
                  defaultValue: 'Your budget is removed on {{when}}.',
                  when: when(budget.pendingSpendCapAt),
                })
              : t('pending-raise', {
                  defaultValue: 'Rises to {{cap}} on {{when}}.',
                  cap: num(budget.pendingSpendCap),
                  when: when(budget.pendingSpendCapAt),
                })}
          </span>
          <Button
            variant="ghost"
            size="xs"
            disabled={saving}
            onClick={() => void save({ cancelPendingSpendCap: true })}
          >
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
        </p>
      )}
      {error && (
        <p role="alert" className="t-meta text-site-danger">
          {error}
        </p>
      )}
    </div>
  );
}
