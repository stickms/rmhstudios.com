'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { TrendingUp, Dice5 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CoinIcon } from './CoinIcon';
import { PlayTab } from './PlayTab';
import { PredictionsMarketTab } from '@/components/predictions/PredictionsMarketTab';

export function RMHCoinsPage() {
  const { t } = useTranslation("c-rmhcoins");
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [tab, setTab] = useState<'markets' | 'games'>('markets');

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session?.user) {
      navigate({ to: '/login', search: { callbackURL: '/predictions' } });
    }
  }, [isPending, session, navigate]);

  // Fetch coin balance
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/coins')
      .then((r) => r.json())
      .then((data) => {
        setCoins(data.coins ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  const handleClaimCoins = async () => {
    if (claiming || coins >= 10) return;
    setClaiming(true);
    try {
      const res = await fetch('/api/coins/claim', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("claim-failed", { defaultValue: "Claim failed" }));
        return;
      }
      setCoins(data.newBalance);
      toast.success(t("coins-added", { defaultValue: "+10 coins added!" }));
    } catch {
      toast.error(t("network-error", { defaultValue: "Network error" }));
    } finally {
      setClaiming(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={32} />
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="flex flex-col w-full">
      {/* Balance bar */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-site-border">
        <div className="flex items-center gap-2">
          <CoinIcon className="w-6 h-6" />
          <span className="font-bold text-2xl text-yellow-500">{coins}</span>
          <span className="text-sm text-site-text-dim ml-1">{t("rmh-coins", { defaultValue: "RMH Coins" })}</span>
        </div>
        {coins < 10 && (
          <Button
            onClick={handleClaimCoins}
            loading={claiming}
            variant="outline"
            size="sm"
            className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
          >
            {t("claim-free-coins", { defaultValue: "Claim 10 Free Coins" })}
          </Button>
        )}
      </div>

      {/* Mode switch — two descriptive cards so the casino games read as an
          equal, obvious choice instead of a bare tab that's easy to miss. */}
      <div className="grid grid-cols-2 gap-2 border-b border-site-border p-3">
        {([
          {
            id: 'markets' as const,
            icon: TrendingUp,
            title: t("tab-markets", { defaultValue: "Prediction Markets" }),
            sub: t("tab-markets-sub", { defaultValue: "Back YES / NO calls" }),
          },
          {
            id: 'games' as const,
            icon: Dice5,
            title: t("tab-games", { defaultValue: "Casino Games" }),
            sub: t("tab-games-sub", { defaultValue: "Plinko, Blackjack, Hold'em & more" }),
          },
        ]).map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              aria-pressed={active}
              className={`flex items-center gap-3 rounded-site border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40 ${
                active
                  ? 'border-site-accent/50 bg-site-accent-dim'
                  : 'border-site-border bg-site-surface hover:bg-site-surface-hover'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-site-sm ${
                  active ? 'bg-site-accent/15 text-site-accent' : 'bg-site-bg text-site-text-muted'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-bold ${active ? 'text-site-accent' : 'text-site-text'}`}>
                  {tb.title}
                </span>
                <span className="block truncate text-xs text-site-text-dim">{tb.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {tab === 'markets' ? (
          <PredictionsMarketTab coins={coins} setCoins={setCoins} />
        ) : (
          <PlayTab coins={coins} setCoins={setCoins} />
        )}
      </div>
    </div>
  );
}
