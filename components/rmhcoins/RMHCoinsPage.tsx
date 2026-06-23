'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { CoinIcon } from './CoinIcon';
import { PlayTab } from './PlayTab';

export function RMHCoinsPage() {
  const { t } = useTranslation("c-rmhcoins");
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session?.user) {
      navigate({ to: '/login', search: { callbackURL: '/wallet' } });
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
        <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
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
            disabled={claiming}
            variant="outline"
            size="sm"
            className="rounded-lg border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
          >
            {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : t("claim-free-coins", { defaultValue: "Claim 10 Free Coins" })}
          </Button>
        )}
      </div>

      {/* Play */}
      <div className="flex-1">
        <PlayTab coins={coins} setCoins={setCoins} />
      </div>
    </div>
  );
}
