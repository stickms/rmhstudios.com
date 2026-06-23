'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, PiggyBank, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';

interface Stake {
  principal: number;
  accrued: number;
  apr: number;
  balance: number;
}

const fmt = (n: number) => n.toLocaleString();

export function StakingCard() {
  const { t } = useTranslation('feed');
  const [data, setData] = useState<Stake | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/staking', { credentials: 'include' });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function act(path: string, body: object, key: string) {
    setBusy(key);
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setAmount('');
        await load();
      } else {
        const b = await res.json().catch(() => ({}));
        if (b?.error) alert(b.error);
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-site-border bg-site-surface p-4">
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-site-accent" />
        </div>
      </section>
    );
  }
  if (!data) return null;

  const amt = parseInt(amount, 10);
  const validAmt = Number.isFinite(amt) && amt > 0;

  return (
    <section className="rounded-xl border border-site-border bg-site-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-site-accent" />
          <h2 className="text-sm font-bold text-site-text">{t("coin-vault", { defaultValue: "Coin vault" })}</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-site-accent/15 px-2 py-0.5 text-[11px] font-semibold text-site-accent">
          <TrendingUp className="h-3 w-3" /> {(data.apr * 100).toFixed(0)}% APR
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-site-bg p-2">
          <p className="inline-flex items-center gap-0.5 text-sm font-bold text-site-text">
            <CoinIcon className="h-3.5 w-3.5" /> {fmt(data.principal)}
          </p>
          <p className="text-[10px] text-site-text-dim">{t("staked", { defaultValue: "Staked" })}</p>
        </div>
        <div className="rounded-lg bg-site-bg p-2">
          <p className="inline-flex items-center gap-0.5 text-sm font-bold text-site-accent">
            <CoinIcon className="h-3.5 w-3.5" /> {fmt(data.accrued)}
          </p>
          <p className="text-[10px] text-site-text-dim">{t("interest", { defaultValue: "Interest" })}</p>
        </div>
        <div className="rounded-lg bg-site-bg p-2">
          <p className="inline-flex items-center gap-0.5 text-sm font-bold text-site-text">
            <CoinIcon className="h-3.5 w-3.5" /> {fmt(data.balance)}
          </p>
          <p className="text-[10px] text-site-text-dim">{t("wallet", { defaultValue: "Wallet" })}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t("amount-placeholder", { defaultValue: "Amount" })}
          aria-label={t("coins-aria-label", { defaultValue: "Coins to stake or unstake" })}
          className="w-full rounded-lg border border-site-border bg-site-bg px-2.5 py-1.5 text-sm text-site-text outline-none focus:border-site-accent"
        />
        <Button
          size="sm"
          variant="accent"
          disabled={!validAmt || busy !== null}
          onClick={() => act('/api/staking/deposit', { amount: amt }, 'deposit')}
        >
          {busy === 'deposit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("stake", { defaultValue: "Stake" })}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!validAmt || busy !== null || amt > data.principal}
          onClick={() => act('/api/staking/withdraw', { amount: amt }, 'unstake')}
        >
          {busy === 'unstake' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("unstake", { defaultValue: "Unstake" })}
        </Button>
      </div>
      {data.accrued > 0 && (
        <button
          onClick={() => act('/api/staking/withdraw', { amount: 0 }, 'claim')}
          disabled={busy !== null}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-site-accent hover:underline disabled:opacity-50"
        >
          {busy === 'claim' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CoinIcon className="h-3 w-3" />}
          {t("claim-interest", { accrued: fmt(data.accrued), defaultValue: "Claim {{accrued}} interest" })}
        </button>
      )}
    </section>
  );
}
