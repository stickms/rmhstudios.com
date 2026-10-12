'use client';

/**
 * Savings goals (C1) — the wallet's "Goals" tab. Lazy-loaded when the tab opens.
 *
 * A goal is a view over the balance: nothing here locks or moves coins.
 */
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Target, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import type { SavingsGoalsPayload, SavingsGoalView } from '@/lib/economy/savings-goal-schema';
import { SAVINGS_CUSTOM_MAX } from '@/lib/economy/savings-goal-schema';
import { apiJson, errorCode } from './api';
import { ItemPicker, type PickedItem } from './ItemPicker';
import { ProgressRing } from './ProgressRing';

const KEY = ['economy-plus', 'savings-goals'] as const;
type Kind = 'shop_item' | 'market_cosmetic' | 'custom';

export default function SavingsGoalsPanel() {
  const { t, i18n } = useTranslation('f-economy-plus');
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Kind>('shop_item');
  const [item, setItem] = useState<PickedItem | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => apiJson<SavingsGoalsPayload>('/api/economy/savings-goals'),
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () =>
      apiJson('/api/economy/savings-goals', {
        method: 'POST',
        body:
          kind === 'custom'
            ? { kind, title: title.trim(), targetCoins: Number(amount) }
            : { kind, itemId: item?.id },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      setAdding(false);
      setItem(null);
      setTitle('');
      setAmount('');
      toast.success(t('goals-added', { defaultValue: 'Goal added' }));
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(
        code === 'NO_LISTING'
          ? t('goals-err-no-listing', {
              defaultValue: 'Nobody is selling that on the market right now.',
            })
          : code === 'TOO_MANY'
            ? t('goals-err-too-many', { defaultValue: 'You have reached the goal limit.' })
            : code === 'NOT_TRADABLE'
              ? t('goals-err-not-tradable', { defaultValue: 'That item cannot be traded.' })
              : t('goals-err-generic', { defaultValue: "Couldn't save that goal" }),
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiJson(`/api/economy/savings-goals/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: () =>
      toast.error(t('goals-err-delete', { defaultValue: "Couldn't remove that goal" })),
  });

  const customValid =
    title.trim().length > 0 &&
    Number.isInteger(Number(amount)) &&
    Number(amount) >= 1 &&
    Number(amount) <= SAVINGS_CUSTOM_MAX;
  const canSave = kind === 'custom' ? customValid : item !== null;
  const fmtDate = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  function eta(g: SavingsGoalView): string {
    const p = g.projection;
    if (p.status === 'reached') {
      return t('goals-reached', { defaultValue: 'You have enough for this right now.' });
    }
    if (p.status === 'stalled') {
      return t('goals-stalled', {
        defaultValue: 'Not enough recent savings to estimate — earn a little more and check back.',
      });
    }
    return t('goals-eta', {
      defaultValue: 'About {{days}} days · around {{date}} · +{{perDay}}/day',
      days: p.daysLeft,
      date: g.etaDate ? fmtDate.format(new Date(`${g.etaDate}T00:00:00Z`)) : '',
      perDay: Math.round(p.perDay).toLocaleString(),
    });
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-3 px-3 pb-8">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 pb-8">
      <p className="px-1 text-sm text-site-text-muted">
        {t('goals-intro', {
          defaultValue:
            'Pick something you want and watch your balance close in on it. Goals never lock your coins — they just show how far away you are.',
        })}
      </p>

      {data.goals.length === 0 && !adding ? (
        <EmptyState
          icon={Target}
          title={t('goals-empty-title', { defaultValue: 'No goals yet' })}
          description={t('goals-empty-desc', {
            defaultValue: 'Set a goal for a store item, a market item, or any amount.',
          })}
          action={
            <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Plus /> {t('goals-add', { defaultValue: 'Add a goal' })}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {data.goals.map((g) => (
            <li key={g.id} className="glass-fill flex items-center gap-4 p-4">
              <ProgressRing value={g.progress} label={`${Math.floor(g.progress * 100)}%`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-site-text">{g.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-site-text-muted">
                  <CoinIcon className="size-3.5" />
                  {Math.min(data.balance, g.targetCoins).toLocaleString()} /{' '}
                  {g.targetCoins.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-site-text-muted">{eta(g)}</p>
                {g.projection.status === 'reached' && g.kind !== 'custom' ? (
                  <Link
                    to="/store"
                    search={{ tab: g.kind === 'market_cosmetic' ? 'market' : 'shop' }}
                    className="mt-1 inline-block text-xs font-semibold text-site-accent hover:underline"
                  >
                    {t('goals-go-store', { defaultValue: 'Go to the store' })}
                  </Link>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('goals-remove-aria', {
                  defaultValue: 'Remove goal {{title}}',
                  title: g.title,
                })}
                onClick={() => remove.mutate(g.id)}
                disabled={remove.isPending}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="glass-pane space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) create.mutate();
          }}
        >
          <p className="site-section-label">{t('goals-new', { defaultValue: 'New goal' })}</p>
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setItem(null);
            }}
            aria-label={t('goals-kind-aria', { defaultValue: 'What are you saving for?' })}
          >
            <option value="shop_item">
              {t('goals-kind-shop', { defaultValue: 'A store item' })}
            </option>
            <option value="market_cosmetic">
              {t('goals-kind-market', { defaultValue: 'A market item' })}
            </option>
            <option value="custom">
              {t('goals-kind-custom', { defaultValue: 'A custom amount' })}
            </option>
          </Select>

          {kind === 'custom' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder={t('goals-custom-title', { defaultValue: 'What is it for?' })}
                aria-label={t('goals-custom-title', { defaultValue: 'What is it for?' })}
              />
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
                inputMode="numeric"
                placeholder={t('goals-custom-amount', { defaultValue: 'Coins' })}
                aria-label={t('goals-custom-amount', { defaultValue: 'Coins' })}
              />
            </div>
          ) : (
            <>
              <ItemPicker
                mode={kind === 'market_cosmetic' ? 'tradable' : 'any'}
                picked={item}
                onPick={setItem}
                label={t('goals-pick-aria', { defaultValue: 'Search for an item' })}
              />
              {kind === 'market_cosmetic' ? (
                <p className="text-xs text-site-text-muted">
                  {t('goals-market-note', {
                    defaultValue:
                      'The target is the cheapest live listing right now. It does not follow the market afterwards.',
                  })}
                </p>
              ) : null}
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              type="submit"
              variant="accent"
              size="sm"
              disabled={!canSave}
              loading={create.isPending}
            >
              {t('goals-save', { defaultValue: 'Save goal' })}
            </Button>
          </div>
        </form>
      ) : data.goals.length > 0 && data.goals.length < data.max ? (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> {t('goals-add', { defaultValue: 'Add a goal' })}
        </Button>
      ) : null}
    </div>
  );
}
